import fs from "node:fs";
import axios from "axios";
import FormData from "form-data";
import { config } from "../config.js";
import type { Content } from "../schemas/content.js";
import {
  TransportAdapter,
  type PostResult,
  type PublishOptions,
  type PlatformStatusRow,
} from "./base.js";
import { formatVkHashtags } from "../utils/hashtag.js";
import { logger } from "../utils/logger.js";
import { withRetry } from "../utils/retry.js";

interface VkError {
  error_code: number;
  error_msg: string;
}

interface VkResponse<T> {
  response?: T;
  error?: VkError;
}

interface VkUploadServer {
  upload_url: string;
}

interface VkUploadResult {
  server: number;
  photo: string;
  hash: string;
}

interface VkSavedPhoto {
  id: number;
  owner_id: number;
  access_key?: string;
}

interface VkWallPost {
  post_id: number;
}

interface VkUser {
  id: number;
}

interface VkGroupsResponse {
  groups?: Array<{ id: number }>;
}

export function formatVkText(post: Content["social"]["vk"]): string {
  const hashtags = formatVkHashtags(post.hashtags);
  const parts = [post.hook, post.draft, post.cta];
  if (hashtags) parts.push(hashtags);
  return parts.join("\n\n");
}

/** Тег цели VK, используется в PostResult.platform и идемпотентности. */
export const VK_GROUP_TAG = "vk-group";
export const VK_USER_TAG = "vk-user";

type VkKind = "group" | "user";

function mapVkError(error: VkError | undefined, fallback: string): string {
  if (!error) return fallback;
  switch (error.error_code) {
    case 5:
      return "Токен недействителен или истёк";
    case 15:
      return "Нет доступа к стене группы";
    case 214:
      return "Превышен лимит постов";
    case 6:
      return "Слишком много запросов";
    default:
      return error.error_msg || fallback;
  }
}

export class VkTransport extends TransportAdapter {
  readonly platform = "vk";
  readonly displayName = "VK";

  private get apiBase(): string {
    return "https://api.vk.com/method";
  }

  private get groupOwnerId(): number {
    return -Math.abs(Number(config.vk.groupId));
  }

  private get userOwnerId(): number {
    return Number(config.vk.userId);
  }

  isGroupConfigured(): boolean {
    return Boolean(config.vk.accessToken && config.vk.groupId);
  }

  isUserConfigured(): boolean {
    return Boolean(config.vk.userToken && config.vk.userId);
  }

  isConfigured(): boolean {
    return this.isGroupConfigured() || this.isUserConfigured();
  }

  /** Проверка валидности токена группы через groups.getById. */
  async validateGroup(): Promise<boolean> {
    if (!this.isGroupConfigured()) return false;
    try {
      const data = await this.call<VkGroupsResponse>(
        "groups.getById",
        { group_id: config.vk.groupId },
        config.vk.accessToken,
      );
      return Boolean(data && data.groups && data.groups[0] && data.groups[0].id);
    } catch {
      return false;
    }
  }

  /** Проверка валидности пользовательского токена через users.get. */
  async validateUser(): Promise<boolean> {
    if (!this.isUserConfigured()) return false;
    try {
      const data = await this.call<VkUser[]>(
        "users.get",
        { user_ids: config.vk.userId },
        config.vk.userToken,
      );
      return Boolean(data && data.length > 0 && data[0].id);
    } catch {
      return false;
    }
  }

  async validateCredentials(): Promise<boolean> {
    if (this.isGroupConfigured()) return this.validateGroup();
    if (this.isUserConfigured()) return this.validateUser();
    return false;
  }

  async uploadImage(
    imagePath: string,
    kind: VkKind = "group",
  ): Promise<string> {
    const isGroup = kind === "group";
    const token = isGroup ? config.vk.accessToken : config.vk.userToken;

    const serverParams: Record<string, string | number> = {};
    if (isGroup) serverParams.group_id = config.vk.groupId;

    const server = await this.call<VkUploadServer>(
      "photos.getWallUploadServer",
      serverParams,
      token,
    );

    const form = new FormData();
    form.append("photo", fs.createReadStream(imagePath));

    const upload = await axios.post<VkUploadResult>(server.upload_url, form, {
      headers: form.getHeaders(),
      timeout: config.httpTimeoutMs,
      maxBodyLength: Infinity,
    });

    const saveParams: Record<string, string | number> = {
      server: upload.data.server,
      photo: upload.data.photo,
      hash: upload.data.hash,
    };
    if (isGroup) saveParams.group_id = config.vk.groupId;

    const saved = await this.call<VkSavedPhoto[]>(
      "photos.saveWallPhoto",
      saveParams,
      token,
    );

    const photo = saved[0];
    if (!photo) {
      throw new Error("VK не вернул сохранённое фото");
    }
    return `photo${photo.owner_id}_${photo.id}`;
  }

  /** Публикация на стену группы (from_group=1, owner_id=-GROUP_ID). */
  private async publishGroup(options: PublishOptions): Promise<PostResult> {
    const ownerId = this.groupOwnerId;
    const result = await withRetry(async () => {
      let attachments: string | undefined;
      if (options.image_path) {
        attachments = await this.uploadImage(options.image_path, "group");
      }
      const params: Record<string, string | number> = {
        owner_id: ownerId,
        from_group: 1,
        message: options.text,
      };
      if (attachments) params.attachments = attachments;
      if (options.scheduled_at) {
        params.publish_date = Math.floor(
          new Date(options.scheduled_at).getTime() / 1000,
        );
      }
      const posted = await this.call<VkWallPost>(
        "wall.post",
        params,
        config.vk.accessToken,
      );

      if (options.poll) {
        try {
          await this.call(
            "board.addPoll",
            { group_id: config.vk.groupId, question: options.poll },
            config.vk.accessToken,
          );
        } catch (pollError) {
          logger.warn(
            { err: pollError instanceof Error ? pollError.message : String(pollError) },
            "VK: не удалось создать опрос",
          );
        }
      }
      return posted;
    }, {
      shouldRetry: (error) => {
        if (error instanceof Error && "vkCode" in error) {
          const code = (error as Error & { vkCode?: number }).vkCode;
          return code === 6;
        }
        return false;
      },
      baseDelayMs: 1000,
    });

    return {
      success: true,
      platform: VK_GROUP_TAG,
      post_id: `group_${result.post_id}`,
      url: `https://vk.com/wall${ownerId}_${result.post_id}`,
    };
  }

  /** Публикация на личную стену (from_group=0, owner_id=USER_ID). */
  private async publishUser(options: PublishOptions): Promise<PostResult> {
    const ownerId = this.userOwnerId;
    const result = await withRetry(async () => {
      let attachments: string | undefined;
      if (options.image_path) {
        attachments = await this.uploadImage(options.image_path, "user");
      }
      const params: Record<string, string | number> = {
        owner_id: ownerId,
        from_group: 0,
        message: options.text,
      };
      if (attachments) params.attachments = attachments;
      if (options.scheduled_at) {
        params.publish_date = Math.floor(
          new Date(options.scheduled_at).getTime() / 1000,
        );
      }
      const posted = await this.call<VkWallPost>(
        "wall.post",
        params,
        config.vk.userToken,
      );
      return posted;
    }, {
      shouldRetry: (error) => {
        if (error instanceof Error && "vkCode" in error) {
          const code = (error as Error & { vkCode?: number }).vkCode;
          return code === 6;
        }
        return false;
      },
      baseDelayMs: 1000,
    });

    return {
      success: true,
      platform: VK_USER_TAG,
      post_id: `user_${result.post_id}`,
      url: `https://vk.com/wall${ownerId}_${result.post_id}`,
    };
  }

  async publish(options: PublishOptions): Promise<PostResult[]> {
    const skip = new Set(options.skip_targets ?? []);
    const results: PostResult[] = [];

    if (this.isGroupConfigured() && !skip.has(VK_GROUP_TAG)) {
      try {
        results.push(await this.publishGroup(options));
      } catch (error) {
        results.push({
          success: false,
          platform: VK_GROUP_TAG,
          error: error instanceof Error ? error.message : "Ошибка VK (группа)",
        });
      }
    }

    if (this.isUserConfigured() && !skip.has(VK_USER_TAG)) {
      try {
        results.push(await this.publishUser(options));
      } catch (error) {
        results.push({
          success: false,
          platform: VK_USER_TAG,
          error: error instanceof Error ? error.message : "Ошибка VK (личная)",
        });
      }
    }

    if (results.length === 0) {
      results.push({
        success: false,
        platform: this.platform,
        error:
          "VK не настроен: задайте VK_ACCESS_TOKEN+VK_GROUP_ID и/или VK_USER_TOKEN+VK_USER_ID",
      });
    }

    return results;
  }

  /** Разбирает post_id вида "group_<id>" / "user_<id>". */
  private parsePostId(postId: string): { kind: VkKind; id: number; token: string; ownerId: number } {
    if (postId.startsWith("group_")) {
      return {
        kind: "group",
        id: Number(postId.slice("group_".length)),
        token: config.vk.accessToken,
        ownerId: this.groupOwnerId,
      };
    }
    if (postId.startsWith("user_")) {
      return {
        kind: "user",
        id: Number(postId.slice("user_".length)),
        token: config.vk.userToken,
        ownerId: this.userOwnerId,
      };
    }
    throw new Error(
      `Неизвестный формат post_id для VK: ${postId} (ожидается group_<id> или user_<id>)`,
    );
  }

  async getPostStatus(postId: string): Promise<{ status: string; url?: string }> {
    try {
      const { token, ownerId, id } = this.parsePostId(postId);
      const posts = await this.call<Array<{ id: number }>>(
        "wall.getById",
        { posts: `${ownerId}_${id}` },
        token,
      );
      if (posts.length > 0) {
        return {
          status: "published",
          url: `https://vk.com/wall${ownerId}_${id}`,
        };
      }
      return { status: "not_found" };
    } catch (error) {
      return {
        status: "error",
        url: error instanceof Error ? error.message : undefined,
      };
    }
  }

  async deletePost(postId: string): Promise<boolean> {
    try {
      const { token, ownerId, id } = this.parsePostId(postId);
      await this.call<number>(
        "wall.delete",
        { owner_id: ownerId, post_id: id },
        token,
      );
      return true;
    } catch (error) {
      logger.error(
        { err: error instanceof Error ? error.message : String(error) },
        "VK: ошибка удаления",
      );
      return false;
    }
  }

  async listTargetStatuses(): Promise<PlatformStatusRow[]> {
    const rows: PlatformStatusRow[] = [];

    // Группа
    {
      const configured = this.isGroupConfigured();
      let available = false;
      let error = "";
      if (!configured) {
        error = "Нет токена группы / VK_GROUP_ID";
      } else {
        try {
          available = await this.validateGroup();
          if (!available) error = "Токен группы недействителен";
        } catch (err) {
          available = false;
          error = err instanceof Error ? err.message : "Ошибка проверки";
        }
      }
      rows.push({
        platform: VK_GROUP_TAG,
        displayName: "VK (группа)",
        configured,
        available,
        error: available ? "" : error,
      });
    }

    // Личная
    {
      const configured = this.isUserConfigured();
      let available = false;
      let error = "";
      if (!configured) {
        error = "Нет VK_USER_TOKEN / VK_USER_ID";
      } else {
        try {
          available = await this.validateUser();
          if (!available) error = "Пользовательский токен недействителен";
        } catch (err) {
          available = false;
          error = err instanceof Error ? err.message : "Ошибка проверки";
        }
      }
      rows.push({
        platform: VK_USER_TAG,
        displayName: "VK (личная)",
        configured,
        available,
        error: available ? "" : error,
      });
    }

    return rows;
  }

  private async call<T>(
    method: string,
    params: Record<string, string | number | boolean | undefined> = {},
    token: string,
  ): Promise<T> {
    const body = new URLSearchParams();
    body.set("access_token", token);
    body.set("v", config.vk.apiVersion);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) body.set(key, String(value));
    }

    const { data } = await axios.post<VkResponse<T>>(
      `${this.apiBase}/${method}`,
      body.toString(),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: config.httpTimeoutMs,
      },
    );

    if (data.error) {
      const err = new Error(mapVkError(data.error, "Ошибка VK API")) as Error & {
        vkCode?: number;
        code?: number;
      };
      err.vkCode = data.error.error_code;
      err.code = data.error.error_code;
      throw err;
    }

    if (data.response === undefined) {
      throw new Error(`Пустой ответ VK API: ${method}`);
    }

    return data.response;
  }
}