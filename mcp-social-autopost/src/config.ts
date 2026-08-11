import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(projectRoot, ".env") });

function expandHome(p: string): string {
  if (p.startsWith("~/") || p === "~") {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

const EnvSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().optional().default(""),
  TELEGRAM_CHAT_ID: z.string().optional().default(""),

  VK_ACCESS_TOKEN: z.string().optional().default(""),
  VK_GROUP_ID: z.string().optional().default(""),
  VK_USER_TOKEN: z.string().optional().default(""),
  VK_USER_ID: z.string().optional().default(""),
  VK_API_VERSION: z.string().optional().default("5.199"),

  TENCHAT_HEADLESS: z
    .string()
    .optional()
    .default("true")
    .transform((v) => v !== "false" && v !== "0"),
  TENCHAT_SESSION_PATH: z.string().optional().default("./storage/sessions/tenchat.json"),

  IMAGE_API_URL: z.string().optional().default(""),
  IMAGE_API_KEY: z.string().optional().default(""),

  CONTENT_DIR: z.string().optional().default("~/course_claude_code/posts"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .optional()
    .default("info"),
  STORAGE_DIR: z.string().optional().default("./storage"),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((i) => `${i.path.join(".")}: ${i.message}`)
    .join("; ");
  throw new Error(`Неверная конфигурация окружения: ${details}`);
}

const raw = parsed.data;

function resolvePath(p: string): string {
  const expanded = expandHome(p);
  return path.isAbsolute(expanded) ? expanded : path.resolve(projectRoot, expanded);
}

export const config = {
  projectRoot,
  telegram: {
    botToken: raw.TELEGRAM_BOT_TOKEN,
    chatId: raw.TELEGRAM_CHAT_ID,
  },
  vk: {
    accessToken: raw.VK_ACCESS_TOKEN,
    groupId: raw.VK_GROUP_ID,
    userToken: raw.VK_USER_TOKEN,
    userId: raw.VK_USER_ID,
    apiVersion: raw.VK_API_VERSION,
  },
  tenchat: {
    headless: raw.TENCHAT_HEADLESS,
    sessionPath: resolvePath(raw.TENCHAT_SESSION_PATH),
  },
  image: {
    apiUrl: raw.IMAGE_API_URL,
    apiKey: raw.IMAGE_API_KEY,
  },
  contentDir: resolvePath(raw.CONTENT_DIR),
  storageDir: resolvePath(raw.STORAGE_DIR),
  logLevel: raw.LOG_LEVEL,
  httpTimeoutMs: 30_000,
  playwrightNavTimeoutMs: 30_000,
  playwrightElementTimeoutMs: 10_000,
} as const;

export type AppConfig = typeof config;
