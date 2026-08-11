import { z } from "zod";
import { readContentFile } from "../utils/content.js";

export const ReadContentInputSchema = z.object({
  filename: z
    .string()
    .optional()
    .describe("Имя файла. Если пусто — берёт последний."),
  latest: z
    .boolean()
    .default(true)
    .describe("Взять последний файл по дате"),
});

export type ReadContentInput = z.infer<typeof ReadContentInputSchema>;

export async function readContentTool(input: ReadContentInput): Promise<string> {
  const { filename, content, path: filePath } = await readContentFile(
    input.filename,
    input.latest,
  );

  return JSON.stringify(
    {
      filename,
      path: filePath,
      content,
    },
    null,
    2,
  );
}
