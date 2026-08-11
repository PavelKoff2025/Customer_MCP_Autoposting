import { z } from "zod";
import { PlatformEnum } from "../schemas/content.js";
import { getTransport } from "../transport/index.js";

export const DeletePostInputSchema = z.object({
  platform: PlatformEnum,
  post_id: z.string(),
});

export type DeletePostInput = z.infer<typeof DeletePostInputSchema>;

export async function deletePostTool(input: DeletePostInput): Promise<string> {
  const transport = getTransport(input.platform);
  if (!transport.isConfigured()) {
    throw new Error(`Платформа ${input.platform} не настроена`);
  }

  const deleted = await transport.deletePost(input.post_id);
  return JSON.stringify(
    {
      platform: input.platform,
      post_id: input.post_id,
      deleted,
      message: deleted
        ? "Пост удалён"
        : "Не удалось удалить пост (API не поддерживает или ошибка)",
    },
    null,
    2,
  );
}
