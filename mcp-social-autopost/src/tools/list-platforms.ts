import { z } from "zod";
import { createTransports } from "../transport/index.js";
import type { PlatformName } from "../schemas/content.js";

export const ListPlatformsInputSchema = z.object({});

export type ListPlatformsInput = z.infer<typeof ListPlatformsInputSchema>;

export interface PlatformStatusRow {
  platform: string;
  displayName: string;
  configured: boolean;
  available: boolean;
  error: string;
}

export async function listPlatformsTool(
  _input: ListPlatformsInput = {},
): Promise<string> {
  const transports = createTransports();
  const rows: PlatformStatusRow[] = [];

  for (const key of Object.keys(transports) as PlatformName[]) {
    const t = transports[key];

    // Платформы с несколькими целями (VK: группа + личная) отдают свои строки сами.
    const targetRows = await t.listTargetStatuses();
    if (targetRows.length > 0) {
      rows.push(...targetRows);
      continue;
    }

    const configured = t.isConfigured();
    let available = false;
    let error = "";

    if (!configured) {
      error = "Нет токена / не настроено";
    } else {
      try {
        available = await t.validateCredentials();
        if (!available) {
          error = "Токен недействителен или недоступен";
        }
      } catch (err) {
        available = false;
        error = err instanceof Error ? err.message : "Ошибка проверки";
      }
    }

    rows.push({
      platform: t.platform,
      displayName: t.displayName,
      configured,
      available,
      error: available ? "" : error,
    });
  }

  const header =
    "| Платформа  | Настроена | Доступна | Ошибка |\n" +
    "|------------|-----------|----------|--------|";

  const body = rows
    .map((r) => {
      const conf = r.configured ? "✅" : "❌";
      const avail = !r.configured ? "—" : r.available ? "✅" : "❌";
      const err = r.error.replace(/\|/g, "/");
      return `| ${r.displayName.padEnd(10)} | ${conf.padEnd(9)} | ${avail.padEnd(8)} | ${err} |`;
    })
    .join("\n");

  return `${header}\n${body}\n\n\`\`\`json\n${JSON.stringify(rows, null, 2)}\n\`\`\``;
}
