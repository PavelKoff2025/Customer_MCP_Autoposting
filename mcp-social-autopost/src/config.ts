import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const envPath = path.join(projectRoot, ".env");

// Первичная загрузка .env в process.env.
dotenv.config({ path: envPath });

function expandHome(p: string): string {
  if (p.startsWith("~/") || p === "~") {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

const EnvSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().optional().default(""),
  TELEGRAM_CHAT_ID: z.string().optional().default(""),
  // Прокси для доступа к Telegram Bot API без системного VPN.
  // Поддерживаются http(s)://[user:pass@]host:port и socks5://[user:pass@]host:port.
  // Если пусто — запросы идут напрямую (как прежде).
  TELEGRAM_PROXY_URL: z.string().optional().default(""),

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
  // Время жизни сессии TenChat (часы). Пока mtime меты свежее — validateCredentials
  // не запускает Playwright, а опирается на keep-alive по cron. Если мета устарела —
  // запускается реальная headless-проверка (фоллбэк).
  TENCHAT_SESSION_TTL_HOURS: z
    .string()
    .optional()
    .default("10")
    .transform((v) => Number(v) * 3_600_000),

  IMAGE_API_URL: z.string().optional().default(""),
  IMAGE_API_KEY: z.string().optional().default(""),

  CONTENT_DIR: z.string().optional().default("~/course_claude_code/posts"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .optional()
    .default("info"),
  STORAGE_DIR: z.string().optional().default("./storage"),
});

type RawConfig = z.infer<typeof EnvSchema>;

export interface AppConfig {
  projectRoot: string;
  telegram: {
    botToken: string;
    chatId: string;
    proxyUrl: string;
  };
  vk: {
    accessToken: string;
    groupId: string;
    userToken: string;
    userId: string;
    apiVersion: string;
  };
  tenchat: {
    headless: boolean;
    sessionPath: string;
    /** TTL меты сессии в мс. Если мета свежее — validateCredentials без Playwright. */
    sessionTtlMs: number;
  };
  image: {
    apiUrl: string;
    apiKey: string;
  };
  contentDir: string;
  storageDir: string;
  logLevel: string;
  httpTimeoutMs: number;
  playwrightNavTimeoutMs: number;
  playwrightElementTimeoutMs: number;
}

function resolvePath(p: string): string {
  const expanded = expandHome(p);
  return path.isAbsolute(expanded) ? expanded : path.resolve(projectRoot, expanded);
}

function buildConfig(raw: RawConfig): AppConfig {
  return {
    projectRoot,
    telegram: {
      botToken: raw.TELEGRAM_BOT_TOKEN,
      chatId: raw.TELEGRAM_CHAT_ID,
      proxyUrl: raw.TELEGRAM_PROXY_URL,
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
      sessionTtlMs: raw.TENCHAT_SESSION_TTL_HOURS,
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
  };
}

function parseEnvOrThrow(): RawConfig {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Неверная конфигурация окружения: ${details}`);
  }
  return parsed.data;
}

// Инициализация (бросает при первом старте с невалидным .env).
let rawConfig: RawConfig = parseEnvOrThrow();
let lastEnvMtime = safeEnvMtime();

// Mutable конфиг: reloadConfigIfChanged() переприсваивает целиком.
export let config: AppConfig = buildConfig(rawConfig);

function safeEnvMtime(): number {
  try {
    return fs.statSync(envPath).mtimeMs;
  } catch {
    return -1;
  }
}

/**
 * Перечитывает .env, если его mtime изменилась, и пересобирает `config`.
 * Вызывается перед каждой MCP-операцией, чтобы смена токенов/прокси в .env
 * подхватывалась без перезапуска MCP-сервера (без /mcp reconnect).
 * При ошибке парсинга — оставляет прежний config (не валит запрос).
 */
export function reloadConfigIfChanged(): void {
  const mtime = safeEnvMtime();
  if (mtime === lastEnvMtime || mtime === -1) return;

  // Перечитываем .env с override, чтобы подхватить изменённые значения.
  dotenv.config({ path: envPath, override: true });
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    // logger нельзя импортировать здесь (цикл config↔logger), логируем в stderr.
    console.warn(`[config] .env перечитывание не удалось, оставляю прежнюю: ${details}`);
    lastEnvMtime = mtime;
    return;
  }
  rawConfig = parsed.data;
  config = buildConfig(rawConfig);
  lastEnvMtime = mtime;
  console.info("[config] Конфигурация .env перечитана");
}