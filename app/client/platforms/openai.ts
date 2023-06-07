import { REQUEST_TIMEOUT_MS } from "@/app/constant";
import { useAccessStore, useAppConfig, useChatStore } from "@/app/store";

import { ChatOptions, getHeaders, LLMApi, LLMUsage, getToken } from "../api";
import Locale from "../../locales";
import {
  EventStreamContentType,
  fetchEventSource,
} from "@fortaine/fetch-event-source";
import { prettyObject } from "@/app/utils/format";

import { parseApiKey, OPENAI_URL_JUDGE } from "@/app/api/common";

export class ChatGPTApi implements LLMApi {
  public ChatPath = "v1/chat/completions";
  public skUsagePath = "dashboard/billing/usage"; // sk-
  public skSubsPath = "dashboard/billing/subscription"; // sk-
  public fkSubsPath = "dashboard/billing/credit_grants"; // fk

  path(path: string): string {
    let openaiUrl = useAccessStore.getState().openaiUrl;
    if (openaiUrl.endsWith("/")) {
      openaiUrl = openaiUrl.slice(0, openaiUrl.length - 1);
    }
    return [openaiUrl, path].join("/");
  }

  extractMessage(res: any) {
    return res.choices?.at(0)?.message?.content ?? "";
  }

  async chat(options: ChatOptions) {
    const messages = options.messages.map((v) => ({
      role: v.role,
      content: v.content,
    }));

    const modelConfig = {
      ...useAppConfig.getState().modelConfig,
      ...useChatStore.getState().currentSession().mask.modelConfig,
      ...{
        model: options.config.model,
      },
    };

    const requestPayload = {
      messages,
      stream: options.config.stream,
      model: modelConfig.model,
      temperature: modelConfig.temperature,
      presence_penalty: modelConfig.presence_penalty,
    };

    console.log("[Request] openai payload: ", requestPayload);

    const shouldStream = !!options.config.stream;
    const controller = new AbortController();
    options.onController?.(controller);

    try {
      const chatPath = this.path(this.ChatPath);
      const chatPayload = {
        method: "POST",
        body: JSON.stringify(requestPayload),
        signal: controller.signal,
        headers: getHeaders(),
      };

      // make a fetch request
      const requestTimeoutId = setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT_MS,
      );

      if (shouldStream) {
        let responseText = "";
        let finished = false;

        const finish = () => {
          if (!finished) {
            options.onFinish(responseText);
            finished = true;
          }
        };

        controller.signal.onabort = finish;

        fetchEventSource(chatPath, {
          ...chatPayload,
          async onopen(res) {
            clearTimeout(requestTimeoutId);
            const contentType = res.headers.get("content-type");
            console.log(
              "[OpenAI] request response content type: ",
              contentType,
            );

            if (contentType?.startsWith("text/plain")) {
              responseText = await res.clone().text();
              return finish();
            }

            if (
              !res.ok ||
              !res.headers
                .get("content-type")
                ?.startsWith(EventStreamContentType) ||
              res.status !== 200
            ) {
              const responseTexts = [responseText];
              let extraInfo = await res.clone().text();
              try {
                const resJson = await res.clone().json();
                extraInfo = prettyObject(resJson);
              } catch {}

              if (res.status === 401) {
                responseTexts.push(Locale.Error.Unauthorized);
              }

              if (extraInfo) {
                responseTexts.push(extraInfo);
              }

              responseText = responseTexts.join("\n\n");

              return finish();
            }
          },
          onmessage(msg) {
            if (msg.data === "[DONE]" || finished) {
              return finish();
            }
            const text = msg.data;
            try {
              const json = JSON.parse(text);
              const delta = json.choices[0].delta.content;
              if (delta) {
                responseText += delta;
                options.onUpdate?.(responseText, delta);
              }
            } catch (e) {
              console.error("[Request] parse error", text, msg);
            }
          },
          onclose() {
            finish();
          },
          onerror(e) {
            options.onError?.(e);
            throw e;
          },
          openWhenHidden: true,
        });
      } else {
        const res = await fetch(chatPath, chatPayload);
        clearTimeout(requestTimeoutId);

        const resJson = await res.json();
        const message = this.extractMessage(resJson);
        options.onFinish(message);
      }
    } catch (e) {
      console.log("[Request] failed to make a chat reqeust", e);
      options.onError?.(e as Error);
    }
  }

  async usage() {
    const apiKeySatatue = OPENAI_URL_JUDGE(
      parseApiKey(getToken().token).apiKey,
    );

    if (apiKeySatatue == 2) {
      const [subs] = await Promise.all([
        fetch(this.path(this.fkSubsPath), {
          method: "GET",
          headers: getHeaders(),
        }),
      ]);

      if (subs.status === 401) {
        throw new Error(Locale.Error.Unauthorized);
      }

      if (!subs.ok || !subs.ok) {
        throw new Error(
          "无法获取你的API订阅额度，请检查你的API key是否填写正确以及网络是否正常！",
        );
      }

      const total = (await subs.json()) as {
        total_available?: number;
      };

      return {
        used: 0,
        total: total.total_available,
      } as LLMUsage;
    } else if (apiKeySatatue == 1) {
      const formatDate = (d: Date) =>
        `${d.getFullYear()}-${(d.getMonth() + 1)
          .toString()
          .padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
      const ONE_DAY = 1 * 24 * 60 * 60 * 1000;
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startDate = formatDate(startOfMonth);
      const endDate = formatDate(new Date(Date.now() + ONE_DAY));

      const [used, subs] = await Promise.all([
        fetch(
          this.path(
            `${this.skUsagePath}?start_date=${startDate}&end_date=${endDate}`,
          ),
          {
            method: "GET",
            headers: getHeaders(),
          },
        ),
        fetch(this.path(this.skSubsPath), {
          method: "GET",
          headers: getHeaders(),
        }),
      ]);

      if (used.status === 401) {
        throw new Error(Locale.Error.Unauthorized);
      }

      if (!used.ok || !subs.ok) {
        throw new Error("无法从OpenaAI获取你的订阅信息！");
      }

      const response = (await used.json()) as {
        total_usage?: number;
        error?: {
          type: string;
          message: string;
        };
      };

      const total = (await subs.json()) as {
        hard_limit_usd?: number;
      };

      if (response.error && response.error.type) {
        throw Error(response.error.message);
      }

      if (response.total_usage) {
        response.total_usage = Math.round(response.total_usage) / 100;
      }

      if (total.hard_limit_usd) {
        total.hard_limit_usd = Math.round(total.hard_limit_usd * 100) / 100;
      }

      return {
        used: response.total_usage,
        total: total.hard_limit_usd,
      } as LLMUsage;
    }
  }
}
