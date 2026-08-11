import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { ContentSchema, type Content } from "../schemas/content.js";

// Файлы контента заканчиваются на "social-content.json" — разделитель перед
// ним может быть как подчёркиванием (по правилу нейминга проекта), так и дефисом
// (по документации скилла ai_news_to_Social_media). Принимаем оба варианта.
const CONTENT_FILE_RE = /[._-]social-content\.json$/i;

export function resolveSafeContentPath(filename: string): string {
  const base = path.resolve(config.contentDir);
  const resolved = path.resolve(base, filename);

  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    throw new Error("Недопустимый путь к файлу (path traversal)");
  }

  if (!path.basename(resolved).endsWith(".json")) {
    throw new Error("Разрешены только JSON-файлы");
  }

  return resolved;
}

export async function listContentFiles(): Promise<string[]> {
  await fs.mkdir(config.contentDir, { recursive: true });
  const entries = await fs.readdir(config.contentDir);
  return entries
    .filter((f) => CONTENT_FILE_RE.test(f))
    .sort()
    .reverse();
}

export async function readContentFile(filename?: string, latest = true): Promise<{
  filename: string;
  content: Content;
  path: string;
}> {
  const files = await listContentFiles();
  if (files.length === 0) {
    throw new Error(`В CONTENT_DIR нет файлов *social-content.json`);
  }

  let target = filename;
  if (!target) {
    if (!latest) {
      throw new Error("Укажите filename или latest=true");
    }
    target = files[0];
  }

  const filePath = resolveSafeContentPath(target);
  const raw = await fs.readFile(filePath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Файл ${target} содержит невалидный JSON`);
  }

  const content = ContentSchema.parse(parsed);
  return { filename: path.basename(filePath), content, path: filePath };
}

export interface PublicationState {
  platform: string;
  content_file: string;
  post_id?: string;
  url?: string;
  success: boolean;
  error?: string;
  published_at: string;
  dry_run?: boolean;
}

function stateFilePath(contentFile: string, platform: string): string {
  const safe = path.basename(contentFile).replace(/\.json$/i, "");
  return path.join(config.storageDir, "state", `${safe}-${platform}.json`);
}

export async function readPublicationState(
  contentFile: string,
  platform: string,
): Promise<PublicationState | null> {
  const file = stateFilePath(contentFile, platform);
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as PublicationState;
  } catch {
    return null;
  }
}

export async function writePublicationState(
  state: PublicationState,
): Promise<string> {
  const file = stateFilePath(state.content_file, state.platform);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(state, null, 2), "utf8");
  return file;
}

export async function listPublicationHistory(): Promise<PublicationState[]> {
  const dir = path.join(config.storageDir, "state");
  await fs.mkdir(dir, { recursive: true });
  const files = await fs.readdir(dir);
  const states: PublicationState[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(dir, file), "utf8");
      states.push(JSON.parse(raw) as PublicationState);
    } catch {
      // skip broken
    }
  }
  return states.sort((a, b) => b.published_at.localeCompare(a.published_at));
}
