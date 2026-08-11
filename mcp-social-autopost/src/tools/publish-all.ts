import { z } from "zod";
import { PlatformEnum, type PlatformName } from "../schemas/content.js";
import { readContentFile } from "../utils/content.js";
import { createPostTool, CreatePostInputSchema } from "./create-post.js";
import type { PostResult } from "../transport/base.js";

export const PublishAllInputSchema = z.object({
  content_file: z.string(),
  platforms: z.array(PlatformEnum).optional(),
  image_path: z.string().optional(),
  schedule: z
    .record(z.string())
    .optional()
    .describe("{ telegram: ISO8601, ... }"),
  dry_run: z.boolean().default(false),
  stop_on_error: z
    .boolean()
    .default(false)
    .describe("Остановиться при первой ошибке"),
});

export type PublishAllInput = z.infer<typeof PublishAllInputSchema>;

function formatSummaryLine(result: PostResult, scheduled?: string): string {
  if (result.dry_run) {
    return `🔎 ${result.platform}: dry_run — текст сформирован`;
  }
  if (scheduled && !result.success) {
    return `⏳ ${result.platform}: запланировано на ${scheduled}`;
  }
  if (result.already_published) {
    return `⚠️ ${result.platform}: уже опубликовано, post_id=${result.post_id ?? "—"}`;
  }
  if (result.success) {
    return `✅ ${result.platform}: опубликовано, post_id=${result.post_id ?? "—"}`;
  }
  return `❌ ${result.platform}: ошибка — ${result.error ?? "неизвестно"}`;
}

export async function publishAllTool(input: PublishAllInput): Promise<string> {
  const { content } = await readContentFile(input.content_file, false);

  const candidates: PlatformName[] =
    input.platforms ??
    (["telegram", "vk", "tenchat"] as PlatformName[]);

  const platforms = candidates.filter(
    (p) => content.platform_status[p] === "ready",
  );

  if (platforms.length === 0) {
    throw new Error('Нет платформ со статусом "ready" для публикации');
  }

  const results: PostResult[] = [];
  const lines: string[] = [];

  for (const platform of platforms) {
    const scheduledAt = input.schedule?.[platform];
    try {
      const payload = CreatePostInputSchema.parse({
        content_file: input.content_file,
        platform,
        image_path: input.image_path,
        scheduled_at: scheduledAt,
        dry_run: input.dry_run,
      });
      const raw = await createPostTool(payload);
      const arr = JSON.parse(raw) as PostResult[];
      results.push(...arr);
      for (const result of arr) {
        lines.push(formatSummaryLine(result, scheduledAt));
      }

      if (arr.some((r) => !r.success) && input.stop_on_error) {
        lines.push("⏹ Остановлено из-за stop_on_error");
        break;
      }
    } catch (error) {
      const result: PostResult = {
        success: false,
        platform,
        error: error instanceof Error ? error.message : String(error),
      };
      results.push(result);
      lines.push(formatSummaryLine(result, scheduledAt));
      if (input.stop_on_error) {
        lines.push("⏹ Остановлено из-за stop_on_error");
        break;
      }
    }
  }

  return `${lines.join("\n")}\n\n\`\`\`json\n${JSON.stringify(results, null, 2)}\n\`\`\``;
}
