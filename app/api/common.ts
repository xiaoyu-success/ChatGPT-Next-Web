import { NextRequest, NextResponse } from "next/server";
import { ACCESS_CODE_PREFIX } from "@/app/constant";

export function parseApiKey(bearToken: string) {
  const token = bearToken.trim().replaceAll("Bearer ", "").trim();
  const isOpenAiKey = !token.startsWith(ACCESS_CODE_PREFIX);

  return {
    apiKey: isOpenAiKey ? token : "",
  };
}
export function OPENAI_URL_JUDGE(authValue: string) {
  // API切换
  const { apiKey: token } = parseApiKey(authValue);
  let validString = (x: string) => x && x.length > 0;
  if (validString(token)) {
    if (token.startsWith("sk-")) {
      return 1;
    } else if (token.startsWith("fk")) {
      return 2;
    }
  }
}

export let apiKeyStatue: number;
export let OPENAI_URL: string;
const DISABLE_GPT4 = !!process.env.DISABLE_GPT4;

export async function requestOpenai(req: NextRequest) {
  const controller = new AbortController();
  const authValue = req.headers.get("Authorization") ?? "";
  const openaiPath = `${req.nextUrl.pathname}${req.nextUrl.search}`.replaceAll(
    "/api/openai/",
    "",
  );

  let apiKeySatatue = OPENAI_URL_JUDGE(authValue);

  const OPENAI_URL = (function () {
    if (apiKeySatatue == 1) {
      return "api.openai.com";
    } else if (apiKeySatatue == 2) {
      return "oa.api2d.net";
    } else {
      console.log("BASE_URL is error!");
    }
  })();
  const DEFAULT_PROTOCOL = "https";
  const PROTOCOL = process.env.PROTOCOL ?? DEFAULT_PROTOCOL;
  let baseUrl = process.env.BASE_URL ?? OPENAI_URL;
  if (baseUrl) {
    if (!baseUrl.startsWith("http")) {
      baseUrl = `${PROTOCOL}://${baseUrl}`;
    }
  }

  console.log("[Proxy] ", openaiPath);
  console.log("[Base Url]", baseUrl);

  if (process.env.OPENAI_ORG_ID) {
    console.log("[Org ID]", process.env.OPENAI_ORG_ID);
  }

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, 10 * 60 * 1000);

  const fetchUrl = `${baseUrl}/${openaiPath}`;
  const fetchOptions: RequestInit = {
    headers: {
      "Content-Type": "application/json",
      Authorization: authValue,
      ...(process.env.OPENAI_ORG_ID && {
        "OpenAI-Organization": process.env.OPENAI_ORG_ID,
      }),
    },
    cache: "no-store",
    method: req.method,
    body: req.body,
    signal: controller.signal,
  };

  // #1815 try to refuse gpt4 request
  if (DISABLE_GPT4 && req.body) {
    try {
      const clonedBody = await req.text();
      fetchOptions.body = clonedBody;

      const jsonBody = JSON.parse(clonedBody);

      if ((jsonBody?.model ?? "").includes("gpt-4")) {
        return NextResponse.json(
          {
            error: true,
            message: "you are not allowed to use gpt-4 model",
          },
          {
            status: 403,
          },
        );
      }
    } catch (e) {
      console.error("[OpenAI] gpt4 filter", e);
    }
  }

  try {
    const res = await fetch(fetchUrl, fetchOptions);

    // to prevent browser prompt for credentials
    const newHeaders = new Headers(res.headers);
    newHeaders.delete("www-authenticate");

    // to disbale ngnix buffering
    newHeaders.set("X-Accel-Buffering", "no");

    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: newHeaders,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
