import { z } from "zod";
import { PlatformEnum, type Content, type PlatformName } from "../schemas/content.js";
import { getTransport } from "../transport/index.js";
import { formatTelegramText } from "../transport/telegram.js";
import { formatVkText, VK_GROUP_TAG, VK_USER_TAG } from "../transport/vk.js";
import { formatTenchatText } from "../transport/tenchat.js";
import {
  readContentFile,
  readPublicationState,
  writePublicationState,
} from "../utils/content.js";
import type { PublishOptions, PostResult } from "../transport/base.js";

export const CreatePostInputSchema = z.object({
  content_file: z.string(),
  platform: PlatformEnum,
  image_path: z.string().optional(),
  scheduled_at: z
    .string()
    .optional()
    .describe("ISO 8601 для отложенной публикации"),
  dry_run: z
    .boolean()
    .default(false)
    .describe("Показать что будет отправлено, не публикуя"),
});

export type CreatePostInput = z.infer<typeof CreatePostInputSchema>;

/** Теги целей публикации для платформы (VK — два таргета, прочие — один). */
export function targetTagsFor(platform: PlatformName): string[] {
  if (platform === "vk") return [VK_GROUP_TAG, VK_USER_TAG];
  return [platform];
}

export function buildPublishOptions(
  content: Content,
  platform: PlatformName,
  imagePath?: string,
  scheduledAt?: string,
  skipTargets?: string[],
): PublishOptions {
  const base = { image_path: imagePath, scheduled_at: scheduledAt, skip_targets: skipTargets };
  switch (platform) {
    case "telegram": {
      return {
        ...base,
        text: formatTelegramText(content.social.telegram),
        title: content.social.telegram.title,
      };
    }
    case "vk": {
      return {
        ...base,
        text: formatVkText(content.social.vk),
        hashtags: content.social.vk.hashtags,
        poll: content.social.vk.poll,
      };
    }
    case "tenchat": {
      return {
        ...base,
        text: formatTenchatText(content.social.tenchat),
        hashtags: content.social.tenchat.hashtags,
      };
    }
  }
}

export async function createPostTool(input: CreatePostInput): Promise<string> {
  const { filename, content } = await readContentFile(input.content_file, false);
  const platform = input.platform;

  if (content.platform_status[platform] !== "ready") {
    throw new Error(
      `Платформа ${platform} не готова к публикации (status=${content.platform_status[platform]})`,
    );
  }

  const tags = targetTagsFor(platform);

  // Идемпотентность: какие теги уже опубликованы успешно — их пропускаем.
  const alreadyPublished: PostResult[] = [];
  const skipTargets: string[] = [];
  if (!input.dry_run) {
    for (const tag of tags) {
      const existing = await readPublicationState(filename, tag);
      if (existing?.success && existing.post_id) {
        alreadyPublished.push({
          success: true,
          platform: tag,
          post_id: existing.post_id,
          url: existing.url,
          already_published: true,
          error: `Уже опубликован (${existing.published_at}). Используйте существующий post_id.`,
        });
        skipTargets.push(tag);
      }
    }
  }

  const options = buildPublishOptions(
    content,
    platform,
    input.image_path,
    input.scheduled_at,
    skipTargets,
  );

  if (input.dry_run) {
    const dry: Array<PostResult & { preview: PublishOptions; targets: string[] }> = [
      {
        success: true,
        platform,
        dry_run: true,
        preview: options,
        targets: tags,
      },
    ];
    return JSON.stringify(dry, null, 2);
  }

  const transport = getTransport(platform);
  const published = await transport.publish(options);
  const results: PostResult[] = [...alreadyPublished, ...published];

  for (const r of results) {
    if (r.success && r.post_id && !r.already_published) {
      await writePublicationState({
        platform: r.platform,
        content_file: filename,
        post_id: r.post_id,
        url: r.url,
        success: r.success,
        error: r.error,
        published_at: new Date().toISOString(),
      });
    }
  }

  return JSON.stringify(results, null, 2);
}