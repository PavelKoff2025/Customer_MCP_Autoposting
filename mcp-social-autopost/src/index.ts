import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { logger } from "./utils/logger.js";
import { config } from "./config.js";
import fs from "node:fs/promises";

async function ensureStorage(): Promise<void> {
  await fs.mkdir(config.storageDir, { recursive: true });
  await fs.mkdir(`${config.storageDir}/sessions`, { recursive: true });
  await fs.mkdir(`${config.storageDir}/images`, { recursive: true });
  await fs.mkdir(`${config.storageDir}/state`, { recursive: true });
}

async function main(): Promise<void> {
  await ensureStorage();
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("MCP social-autopost запущен (stdio)");
}

main().catch((error: unknown) => {
  logger.error(
    { err: error instanceof Error ? error.message : String(error) },
    "Критическая ошибка запуска MCP",
  );
  process.exit(1);
});
