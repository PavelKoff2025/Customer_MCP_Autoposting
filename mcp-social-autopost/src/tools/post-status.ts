import { z } from "zod";
import { PlatformEnum } from "../schemas/content.js";
import { getTransport } from "../transport/index.js";

export const PostStatusInputSchema = z.object({
  platform: PlatformEnum,
  post_id: z.string(),
});

export type PostStatusInput = z.infer<typeof PostStatusInputSchema>;

export async function postStatusTool(input: PostStatusInput): Promise<string> {
  const transport = getTransport(input.platform);
  if (!transport.isConfigured()) {
    throw new Error(`Платформа ${input.platform} не настроена`);
  }

  const status = await transport.getPostStatus(input.post_id);
  return JSON.stringify(
    {
      platform: input.platform,
      post_id: input.post_id,
      ...status,
    },
    null,
    2,
  );
}
