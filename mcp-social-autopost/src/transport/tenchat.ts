import path from "node:path";
import { chromium, type Page } from "playwright";
import { config } from "../config.js";
import type { Content } from "../schemas/content.js";
import {
  TransportAdapter,
  type PostResult,
  type PublishOptions,
} from "./base.js";
import {
  sessionFileExists,
  validateTenchatSession,
  writeSessionMeta,
} from "../browser/tenchat-session.js";
import { formatTenchatHashtags } from "../utils/hashtag.js";
import { ensureDir } from "../utils/image.js";
import { logger } from "../utils/logger.js";

export const TENCHAT_SELECTORS = {
  // TenChat убрал инлайн-композер с /feed — посты создаются на /editor.
  // Тело поста — Quill-редактор .ql-editor[contenteditable=true].
  // Заголовок (первый contenteditable) необязателен, публикуем body-only.
  postInput: '.ql-editor[contenteditable="true"]',
  imageUpload: 'input[type="file"]',
  publishButton: 'button:has-text("Опубликовать")',
  // После публикации /editor редиректит на /media/<id>-<slug>.
  editorUrl: "https://tenchat.ru/editor",
} as const;

export function formatTenchatText(
  post: Content["social"]["tenchat"],
): string {
  const hashtags = formatTenchatHashtags(post.hashtags);
  const parts = [post.thesis, post.draft, post.cta];
  if (hashtags) parts.push(hashtags);
  return parts.join("\n\n");
}

async function takeErrorScreenshot(page: Page, label: string): Promise<string> {
  const dir = path.join(config.storageDir, "images");
  await ensureDir(dir);
  const file = path.join(
    dir,
    `tenchat-error-${label}-${Date.now()}.png`,
  );
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

export class TenchatTransport extends TransportAdapter {
  readonly platform = "tenchat";
  readonly displayName = "TenChat";

  /** Кешированная причина последней неудачи валидации (для list_platforms). */
  private _lastValidateError = "";

  isConfigured(): boolean {
    return Boolean(config.tenchat.sessionPath);
  }

  /**
   * Гибридная валидация: по свежей мете (keep-alive) — без Playwright,
   * иначе реальная headless-проверка. См. browser/tenchat-session.ts.
   */
  async validateCredentials(): Promise<boolean> {
    if (!this.isConfigured()) return false;
    const { valid, reason } = await validateTenchatSession();
    this._lastValidateError = valid ? "" : reason;
    return valid;
  }

  lastValidateError(): string {
    return this._lastValidateError;
  }

  async uploadImage(imagePath: string): Promise<string> {
    return imagePath;
  }

  async publish(options: PublishOptions): Promise<PostResult[]> {
    return [await this.publishOne(options)];
  }

  async publishOne(options: PublishOptions): Promise<PostResult> {
    // Быстрая проверка наличия файла сессии. Реальная валидность определяется
    // далее через goto /editor — чтобы не запускать браузер дважды (validateCredentials
    // тоже запускал бы Playwright при устаревшей мете).
    const sessionExists = sessionFileExists();
    if (!sessionExists) {
      return {
        success: false,
        platform: this.platform,
        error:
          "Запустите npm run tenchat:login для повторной авторизации",
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
        await page.goto(TENCHAT_SELECTORS.editorUrl, {
          waitUntil: "domcontentloaded",
        });
      } catch {
        const shot = await takeErrorScreenshot(page, "nav");
        return {
          success: false,
          platform: this.platform,
          error: `TenChat не отвечает (таймаут навигации). Скриншот: ${shot}`,
        };
      }

      // Session expired heuristic: TenChat редиректит на oauth.tenchat.ru/auth/sign-in
      const url = page.url();
      if (
        url.includes("/login") ||
        url.includes("/sign-in") ||
        url.includes("oauth.tenchat.ru/auth")
      ) {
        await writeSessionMeta(false, "редирект на авторизацию при публикации");
        return {
          success: false,
          platform: this.platform,
          error:
            "Сессия истекла. Запустите npm run tenchat:login для повторной авторизации",
        };
      }

      // Сессия валидна — обновляем мету, чтобы list_platforms следующий раз
      // не запускал Playwright (пока мата свежая — в пределах TENCHAT_SESSION_TTL_HOURS).
      await writeSessionMeta(true, null);

      const input = page.locator(TENCHAT_SELECTORS.postInput).first();
      try {
        await input.waitFor({ state: "visible" });
      } catch {
        const shot = await takeErrorScreenshot(page, "input");
        return {
          success: false,
          platform: this.platform,
          error: `Элемент поля ввода поста не найден. Скриншот: ${shot}`,
        };
      }

      await input.click();
      await input.fill(options.text);
      // Проверяем, что Quill реально принял текст (иначе публикация уйдёт пустой)
      const enteredText = await input.innerText();
      if (!enteredText || !enteredText.trim()) {
        const shot = await takeErrorScreenshot(page, "input-empty");
        return {
          success: false,
          platform: this.platform,
          error: `Текст не введён в редактор TenChat. Скриншот: ${shot}`,
        };
      }

      if (options.image_path) {
        const fileInput = page.locator(TENCHAT_SELECTORS.imageUpload).first();
        const count = await fileInput.count();
        if (count > 0) {
          await fileInput.setInputFiles(options.image_path);
        } else {
          logger.warn("TenChat: input[type=file] не найден, публикуем без фото");
        }
      }

      const publishBtn = page.locator(TENCHAT_SELECTORS.publishButton).first();
      try {
        await publishBtn.waitFor({ state: "visible" });
        const disabled = await publishBtn.getAttribute("disabled");
        if (disabled !== null) {
          const shot = await takeErrorScreenshot(page, "publish-disabled");
          return {
            success: false,
            platform: this.platform,
            error: `Кнопка «Опубликовать» неактивна (возможно, не заполнено обязательное поле). Скриншот: ${shot}`,
          };
        }
        await publishBtn.click();
      } catch {
        const shot = await takeErrorScreenshot(page, "publish");
        return {
          success: false,
          platform: this.platform,
          error: `Кнопка «Опубликовать» не найдена. Скриншот: ${shot}`,
        };
      }

      // Успех = уход с /editor (редирект на /media/<id>-<slug> или иную страницу).
      let publishedUrl = "";
      try {
        await page.waitForURL(
          (u) => !u.toString().includes("/editor"),
          { timeout: config.playwrightNavTimeoutMs },
        );
        publishedUrl = page.url();
      } catch {
        // Не всегда редиректит — не считаем фатальным, фиксируем по скриншоту ниже
        logger.warn("TenChat: не дождались ухода с /editor после публикации");
      }

      const verifyDir = path.join(config.storageDir, "images");
      await ensureDir(verifyDir);
      const screenshotPath = path.join(
        verifyDir,
        `tenchat-ok-${Date.now()}.png`,
      );
      await page.screenshot({ path: screenshotPath, fullPage: true });

      // Извлекаем id публикации из URL вида /media/<id>-<slug>
      let postId = `tenchat-${Date.now()}`;
      const mediaMatch = publishedUrl.match(/\/media\/(\d+)/);
      if (mediaMatch) {
        postId = mediaMatch[1];
      }
      return {
        success: true,
        platform: this.platform,
        post_id: postId,
        url: publishedUrl || screenshotPath,
      };
    } catch (error) {
      return {
        success: false,
        platform: this.platform,
        error:
          error instanceof Error
            ? error.message
            : "Неизвестная ошибка TenChat",
      };
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  async getPostStatus(postId: string): Promise<{ status: string; url?: string }> {
    return { status: "unknown", url: postId };
  }

  async deletePost(_postId: string): Promise<boolean> {
    logger.warn("TenChat: удаление через автоматизацию не реализовано");
    return false;
  }
}
