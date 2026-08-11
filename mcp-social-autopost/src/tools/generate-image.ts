import { z } from "zod";
import { readContentFile } from "../utils/content.js";
import {
  buildImageOutputPath,
  generateImageFromApi,
} from "../utils/image.js";

export const GenerateImageInputSchema = z.object({
  prompt: z.string().optional().describe("Промпт для генерации"),
  content_file: z
    .string()
    .optional()
    .describe("Имя JSON (для извлечения image_prompt)"),
  width: z.number().default(1920),
  height: z.number().default(1080),
});

export type GenerateImageInput = z.infer<typeof GenerateImageInputSchema>;

export async function generateImageTool(
  input: GenerateImageInput,
): Promise<string> {
  let prompt = input.prompt?.trim() ?? "";
  let slug = "generated";

  if (!prompt) {
    if (!input.content_file) {
      throw new Error("Укажите prompt или content_file");
    }
    const { content, filename } = await readContentFile(input.content_file, false);
    prompt = content.image_prompt;
    slug = content.blog.seo.slug || filename.replace(/\.json$/i, "");
  } else if (input.content_file) {
    const { content, filename } = await readContentFile(input.content_file, false);
    slug = content.blog.seo.slug || filename.replace(/\.json$/i, "");
  }

  if (!prompt) {
    throw new Error("Пустой промпт для генерации изображения");
  }

  const outputPath = buildImageOutputPath(slug);
  const saved = await generateImageFromApi(
    prompt,
    input.width,
    input.height,
    outputPath,
  );

  return JSON.stringify(
    {
      success: true,
      path: saved,
      prompt,
      width: input.width,
      height: input.height,
    },
    null,
    2,
  );
}
