import { create } from "zustand";
import { persist } from "zustand/middleware";
import { StoreKey } from "../constant";
import { api } from "../client/api";
import { showToast } from "../components/ui-lib";

export interface UpdateStore {
  used?: number;
  subscription?: number;
  lastUpdateUsage: number;

  updateUsage: (force?: boolean) => Promise<void>;
}

function queryMeta(key: string, defaultValue?: string): string {
  let ret: string;
  if (document) {
    const meta = document.head.querySelector(
      `meta[name='${key}']`,
    ) as HTMLMetaElement;
    ret = meta?.content ?? "";
  } else {
    ret = defaultValue ?? "";
  }

  return ret;
}

const ONE_MINUTE = 60 * 1000;

export const useUpdateStore = create<UpdateStore>()(
  persist(
    (set, get) => ({
      lastUpdate: 0,
      lastUpdateUsage: 0,

      async updateUsage(force = false) {
        const overOneMinute = Date.now() - get().lastUpdateUsage >= ONE_MINUTE;
        if (!overOneMinute && !force) return;

        set(() => ({
          lastUpdateUsage: Date.now(),
        }));

        try {
          const usage = await api.llm.usage();

          if (usage) {
            set(() => ({
              used: usage.used,
              subscription: usage.total,
            }));
          }
        } catch (e) {
          showToast((e as Error).message);
        }
      },
    }),
    {
      name: StoreKey.Update,
      version: 1,
    },
  ),
);
