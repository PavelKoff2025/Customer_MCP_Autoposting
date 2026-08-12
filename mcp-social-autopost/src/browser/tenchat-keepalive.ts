import { probeSession } from "./tenchat-session.js";

/**
 * Keep-alive сессии TenChat. Запускается по cron (launchd, ~6 ч).
 * Headless заходит на /editor, обновляет storageState (продлевает cookies)
 * и пишет мету lastValidAt. Если сессия протухла — выходит с кодом 1,
 * сигнализируя о необходимости ручного `npm run tenchat:login`.
 */
async function keepalive(): Promise<void> {
  const result = await probeSession({ saveState: true });
  if (!result.valid) {
    console.error(`TenChat keep-alive: сессия невалидна — ${result.reason}`);
    console.error("Требуется ручной вход: npm run tenchat:login");
    process.exit(1);
  }
  console.log(`TenChat keep-alive: ${result.reason}, storageState обновлён`);
  process.exit(0);
}

keepalive().catch((error: unknown) => {
  console.error(
    "TenChat keep-alive: непредвиденная ошибка",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});