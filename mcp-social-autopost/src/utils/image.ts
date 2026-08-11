import fs from "node:fs/promises";
import path from "node:path";
import axios from "axios";
import sharp from "sharp";
import { config } from "../config.js";
import { logger } from "./logger.js";

const TEN_MB = 10 * 1024 * 1024;

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function compressImageIfNeeded(
  imagePath: string,
  maxBytes = TEN_MB,
  maxDimension = 2048,
): Promise<string> {
  const stat = await fs.stat(imagePath);
  if (stat.size <= maxBytes) {
    return imagePath;
  }

  logger.info({ imagePath, size: stat.size }, "Сжатие изображения");
  const imagesDir = path.join(config.storageDir, "images");
  await ensureDir(imagesDir);

  const outPath = path.join(
    imagesDir,
    `compressed-${path.basename(imagePath, path.extname(imagePath))}.jpg`,
  );

  await sharp(imagePath)
    .rotate()
    .resize({
      width: maxDimension,
      height: maxDimension,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85, mozjpeg: true })
    .toFile(outPath);

  return outPath;
}

export async function generateImageFromApi(
  prompt: string,
  width: number,
  height: number,
  outputPath: string,
): Promise<string> {
  if (!config.image.apiUrl) {
    throw new Error("IMAGE_API_URL не задан в .env");
  }

  await ensureDir(path.dirname(outputPath));

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.image.apiKey) {
    headers["Authorization"] = `Bearer ${config.image.apiKey}`;
  }

  const response = await axios.post(
    config.image.apiUrl,
    { prompt, width, height },
    {
      headers,
      timeout: config.httpTimeoutMs,
      responseType: "arraybuffer",
      validateStatus: () => true,
    },
  );

  if (response.status >= 400) {
    let message = `Ошибка генерации изображения: HTTP ${response.status}`;
    try {
      const text = Buffer.from(response.data as ArrayBuffer).toString("utf8");
      const parsed = JSON.parse(text) as { error?: string; message?: string };
      message = parsed.error ?? parsed.message ?? message;
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }

  const contentType = String(response.headers["content-type"] ?? "");
  if (contentType.includes("application/json")) {
    const text = Buffer.from(response.data as ArrayBuffer).toString("utf8");
    const parsed = JSON.parse(text) as {
      url?: string;
      image_url?: string;
      b64_json?: string;
      data?: Array<{ url?: string; b64_json?: string }>;
    };
    const url = parsed.url ?? parsed.image_url ?? parsed.data?.[0]?.url;
    const b64 = parsed.b64_json ?? parsed.data?.[0]?.b64_json;
    if (b64) {
      await fs.writeFile(outputPath, Buffer.from(b64, "base64"));
      return outputPath;
    }
    if (url) {
      const img = await axios.get<ArrayBuffer>(url, {
        responseType: "arraybuffer",
        timeout: config.httpTimeoutMs,
      });
      await fs.writeFile(outputPath, Buffer.from(img.data));
      return outputPath;
    }
    throw new Error("IMAGE_API вернул JSON без url/b64_json");
  }

  await fs.writeFile(outputPath, Buffer.from(response.data as ArrayBuffer));
  return outputPath;
}

export function buildImageOutputPath(slug: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const safeSlug = slug.replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 80) || "image";
  return path.join(config.storageDir, "images", `${date}-${safeSlug}.png`);
}
