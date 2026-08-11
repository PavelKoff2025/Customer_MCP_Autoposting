import { listContentFiles } from "../utils/content.js";
import { config } from "../config.js";

export async function getContentFilesResource(): Promise<string> {
  const files = await listContentFiles();
  const rows = files.map((filename) => {
    const dateMatch = filename.match(/^(\d{4}-\d{2}-\d{2})/);
    return {
      filename,
      date: dateMatch?.[1] ?? null,
    };
  });

  return JSON.stringify(
    {
      content_dir: config.contentDir,
      count: rows.length,
      files: rows,
    },
    null,
    2,
  );
}
