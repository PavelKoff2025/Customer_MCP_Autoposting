import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { config } from "../config.js";

/**
 * Гибридная валидация сессии TenChat.
 *
 * Идея: keep-alive по cron (launchd) каждые ~6 ч заходит на TenChat headless,
 * обновляет storageState и пишет мету `lastValidAt`. Тогда validateCredentials
 * в list_platforms не запускает Playwright (медленно, ~8 с), а быстро вернёт true
 * по свежей мете. Если мета устарела (Mac спал, cron не отработал) — фоллбэк на
 * реальную headless-проверку, чтобы узнать о протухании до публикации, а не в момент.
 */

const EDITOR_URL = "https://tenchat.ru/editor";

interface SessionMeta {
  /** ISO-время последней успешной проверки сессии. */
  lastValidAt: string | null;
  /** Причина последней неудачи — для диагностики. */
  lastReason: string | null;
}

function metaPath(): string {
  return path.join(
    path.dirname(config.tenchat.sessionPath),
    "tenchat-session.meta.json",
  );
}

async function readSessionMeta(): Promise<SessionMeta> {
  try {
    const raw = await fs.readFile(metaPath(), "utf8");
    const m = JSON.parse(raw) as Partial<SessionMeta>;
    return {
      lastValidAt: m.lastValidAt ?? null,
      lastReason: m.lastReason ?? null,
    };
  } catch {
    return { lastValidAt: null, lastReason: null };
  }
}

export async function writeSessionMeta(
  valid: boolean,
  reason: string | null,
): Promise<void> {
  const meta: SessionMeta = {
    lastValidAt: valid ? new Date().toISOString() : null,
    lastReason: reason,
  };
  try {
    await fs.writeFile(metaPath(), JSON.stringify(meta, null, 2), "utf8");
  } catch {
    // Мета — оптимизация, не валим запрос из-за неё.
  }
}

export function sessionFileExists(): boolean {
  return existsSync(config.tenchat.sessionPath);
}

/**
 * Гибридная валидация: если мета свежее (< sessionTtlMs) — true без Playwright.
 * Иначе — реальная headless-проверка через probeSession.
 */
export async function validateTenchatSession(): Promise<{
  valid: boolean;
  reason: string;
}> {
  if (!sessionFileExists()) {
    return {
      valid: false,
      reason: "Файл сессии не найден — запустите npm run tenchat:login",
    };
  }

  const meta = await readSessionMeta();
  if (meta.lastValidAt) {
    const ts = new Date(meta.lastValidAt).getTime();
    const age = Date.now() - ts;
    if (Number.isFinite(age) && age >= 0 && age < config.tenchat.sessionTtlMs) {
      return {
        valid: true,
        reason: `сессия подтверждена keep-alive (мета ${Math.round(age / 3_600_000)} ч назад)`,
      };
    }
  }

  // Мета устарела или отсутствует — реальная проверка.
  return probeSession({ saveState: true });
}

/**
 * Реальная headless-проверка сессии TenChat.
 * Заходит на /editor и смотрит, не редиректнуло ли на /login|/sign-in|oauth.
 * При saveState и валидности — сохраняет storageState (продлевает cookies).
 * Всегда обновляет мету.
 */
export async function probeSession(opts: {
  saveState?: boolean;
} = {}): Promise<{ valid: boolean; reason: string }> {
  if (!sessionFileExists()) {
    return {
      valid: false,
      reason: "Файл сессии не найден — запустите npm run tenchat:login",
    };
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: config.tenchat.headless });
    const context = await browser.newContext({
      storageState: config.tenchat.sessionPath,
    });
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(config.playwrightNavTimeoutMs);
    page.setDefaultTimeout(config.playwrightElementTimeoutMs);

    try {
      await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded" });
    } catch {
      await writeSessionMeta(false, "таймаут навигации к /editor");
      return { valid: false, reason: "TenChat не отвечает (таймаут навигации)" };
    }

    const url = page.url();
    const expired =
      url.includes("/login") ||
      url.includes("/sign-in") ||
      url.includes("oauth.tenchat.ru/auth");
    if (expired) {
      await writeSessionMeta(false, "редирект на авторизацию");
      return {
        valid: false,
        reason: "Сессия истекла — запустите npm run tenchat:login",
      };
    }

    if (opts.saveState) {
      try {
        await context.storageState({ path: config.tenchat.sessionPath });
      } catch {
        // Обновление storageState — бонус, не критично.
      }
    }
    await writeSessionMeta(true, null);
    return { valid: true, reason: "сессия валидна (реальная проверка)" };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "неизвестная ошибка";
    await writeSessionMeta(false, reason);
    return { valid: false, reason: `Ошибка проверки сессии: ${reason}` };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}