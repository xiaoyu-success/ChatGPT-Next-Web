// 页面信息
export const WEB_TITLE = "知林AI小助手"; // 页面标题
export const SUBTITLE = "Build your own AI assistant!"; // 页面副标题

// 个人GitHub仓库信息
export const OWNER = "xiaoyu-success"; // GitHub用户名
export const REPO = "ChatGPT-Next-Web"; // GitHub仓库名称
export const REPO_URL = `https://github.com/${OWNER}/${REPO}`;
export const ISSUE_URL = `https://github.com/${OWNER}/${REPO}/issues`;
export const RUNTIME_CONFIG_DOM = "danger-runtime-config";

// 导出图片/文件信息
export const EXPOETER_TITLE = WEB_TITLE; // 导出图片的标题，可修改string类型
export const EXPOETER_SUBTITLE = REPO_URL; // 导出图片的副标题，可修改string类型

//以下请勿修改！！！
export enum Path {
  Home = "/",
  Chat = "/chat",
  Settings = "/settings",
  NewChat = "/new-chat",
  Masks = "/masks",
}

export enum SlotID {
  AppBody = "app-body",
}

export enum FileName {
  Masks = "masks.json",
  Prompts = "prompts.json",
}

export enum StoreKey {
  Chat = "chat-next-web-store",
  Access = "access-control",
  Config = "app-config",
  Mask = "mask-store",
  Prompt = "prompt-store",
  Update = "chat-update",
}

export const MAX_SIDEBAR_WIDTH = 500;
export const MIN_SIDEBAR_WIDTH = 230;
export const NARROW_SIDEBAR_WIDTH = 100;

export const ACCESS_CODE_PREFIX = "ak-";

export const LAST_INPUT_KEY = "last-input";

export const REQUEST_TIMEOUT_MS = 60000;

export const EXPORT_MESSAGE_CLASS_NAME = "export-markdown";
