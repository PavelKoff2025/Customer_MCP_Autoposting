import fs from "node:fs";
import axios, { AxiosError } from "axios";
import FormData from "form-data";
import { config } from "../config.js";
import type { Content } from "../schemas/content.js";
import {
  TransportAdapter,
  type PostResult,
  type PublishOptions,
} from "./base.js";
import { compressImageIfNeeded } from "../utils/image.js";
import { logger } from "../utils/logger.js";
import { withRetry } from "../utils/retry.js";

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
  parameters?: { retry_after?: number };
}

interface TelegramMessage {
  message_id: number;
  chat: { id: number };
}

interface TelegramUser {
  id: number;
  is_bot: boolean;
  username?: string;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatTelegramText(
  post: Content["social"]["telegram"],
): string {
  // Футер — хэштеги из JSON (управляются скиллом ai_news_to_Social_media).
  // Промо-блок убран: скилл сам задаёт хэштеги в поле social.telegram.hashtags.
  const hashtags = (post.hashtags ?? []).filter(Boolean).join(" ");
  const body = `<b>${escapeHtml(post.title)}</b>\n\n${post.draft}\n\n${post.cta}`;
  return hashtags ? `${body}\n\n${hashtags}` : body;
}

function mapTelegramError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const ax = error as AxiosError<TelegramApiResponse<unknown>>;
    const status = ax.response?.status;
    const data = ax.response?.data;
    const description = (data?.description ?? ax.message).toLowerCase();

    if (status === 401 || data?.error_code === 401) {
      return "Неверный токен бота";
    }
    if (status === 403 || data?.error_code === 403) {
      return "Бот заблокирован в чате";
    }
    if (
      status === 400 &&
      (description.includes("chat not found") ||
        description.includes("chat_id is empty"))
    ) {
      return "Бот не добавлен в чат или неверный chat_id";
    }
    if (status === 429 || data?.error_code === 429) {
      return "Превышен лимит запросов Telegram";
    }
    return data?.description ?? ax.message;
  }
  if (error instanceof Error) return error.message;
  return "Неизвестная ошибка Telegram";
}

export class TelegramTransport extends TransportAdapter {
  readonly platform = "telegram";
  readonly displayName = "Telegram";

  private get baseUrl(): string {
    return `https://api.telegram.org/bot${config.telegram.botToken}`;
  }

  isConfigured(): boolean {
    return Boolean(config.telegram.botToken && config.telegram.chatId);
  }

  async validateCredentials(): Promise<boolean> {
    if (!this.isConfigured()) return false;
    try {
      const { data } = await axios.get<TelegramApiResponse<TelegramUser>>(
        `${this.baseUrl}/getMe`,
        { timeout: config.httpTimeoutMs },
      );
      return data.ok === true;
    } catch (error) {
      logger.warn({ err: mapTelegramError(error) }, "Telegram: проверка токена не удалась");
      return false;
    }
  }

  async uploadImage(imagePath: string): Promise<string> {
    return imagePath;
  }

  async publish(options: PublishOptions): Promise<PostResult[]> {
    return [await this.publishOne(options)];
  }

  async publishOne(options: PublishOptions): Promise<PostResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        platform: this.platform,
        error: "Telegram не настроен: задайте TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID",
      };
    }

    try {
      const result = await withRetry(async () => {
        if (options.image_path) {
          return this.sendPhoto(options.image_path, options.text);
        }
        return this.sendMessage(options.text);
      });

      return {
        success: true,
        platform: this.platform,
        post_id: String(result.message_id),
        url: `https://t.me/c/${String(config.telegram.chatId).replace(/^-100/, "")}/${result.message_id}`,
      };
    } catch (error) {
      return {
        success: false,
        platform: this.platform,
        error: mapTelegramError(error),
      };
    }
  }

  async getPostStatus(postId: string): Promise<{ status: string; url?: string }> {
    return {
      status: "published",
      url: `https://t.me/c/${String(config.telegram.chatId).replace(/^-100/, "")}/${postId}`,
    };
  }

  async deletePost(postId: string): Promise<boolean> {
    try {
      const { data } = await axios.post<TelegramApiResponse<boolean>>(
        `${this.baseUrl}/deleteMessage`,
        {
          chat_id: config.telegram.chatId,
          message_id: Number(postId),
        },
        { timeout: config.httpTimeoutMs },
      );
      return data.ok === true;
    } catch (error) {
      logger.error({ err: mapTelegramError(error) }, "Telegram: ошибка удаления");
      return false;
    }
  }

  private async sendMessage(text: string): Promise<TelegramMessage> {
    const { data } = await axios.post<TelegramApiResponse<TelegramMessage>>(
      `${this.baseUrl}/sendMessage`,
      {
        chat_id: config.telegram.chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: false,
      },
      { timeout: config.httpTimeoutMs },
    );

    if (!data.ok || !data.result) {
      const err = new Error(data.description ?? "Ошибка sendMessage") as Error & {
        response?: { status?: number; data?: TelegramApiResponse<unknown> };
      };
      err.response = { status: data.error_code, data };
      throw err;
    }
    return data.result;
  }

  private async sendPhoto(
    imagePath: string,
    caption: string,
  ): Promise<TelegramMessage> {
    const compressed = await compressImageIfNeeded(imagePath);
    const form = new FormData();
    form.append("chat_id", config.telegram.chatId);
    form.append("caption", caption);
    form.append("parse_mode", "HTML");
    form.append("photo", fs.createReadStream(compressed));

    const { data } = await axios.post<TelegramApiResponse<TelegramMessage>>(
      `${this.baseUrl}/sendPhoto`,
      form,
      {
        headers: form.getHeaders(),
        timeout: config.httpTimeoutMs,
        maxBodyLength: Infinity,
      },
    );

    if (!data.ok || !data.result) {
      const err = new Error(data.description ?? "Ошибка sendPhoto") as Error & {
        response?: { status?: number; data?: TelegramApiResponse<unknown> };
      };
      err.response = { status: data.error_code, data };
      throw err;
    }
    return data.result;
  }
}
