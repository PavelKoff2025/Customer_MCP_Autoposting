import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { config } from "../config.js";

async function login(): Promise<void> {
  const sessionPath = config.tenchat.sessionPath;
  await fs.mkdir(path.dirname(sessionPath), { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("https://tenchat.ru/login", { waitUntil: "domcontentloaded" });

  console.log("Войдите в аккаунт TenChat в открывшемся окне браузера.");
  console.log("После успешного входа нажмите Enter здесь...");

  await new Promise<void>((resolve) => {
    process.stdin.once("data", () => resolve());
  });

  await context.storageState({ path: sessionPath });
  console.log(`Сессия сохранена: ${sessionPath}`);

  await browser.close();
  process.exit(0);
}

login().catch((error: unknown) => {
  console.error(
    "Ошибка авторизации TenChat:",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
