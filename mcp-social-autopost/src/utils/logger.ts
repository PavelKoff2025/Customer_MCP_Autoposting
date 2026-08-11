import pino from "pino";
import { config } from "../config.js";

const SECRET_KEYS = [
  "token",
  "password",
  "secret",
  "authorization",
  "api_key",
  "apikey",
  "access_token",
  "bot_token",
];

function redact(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(redact);

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const lower = key.toLowerCase();
    if (SECRET_KEYS.some((s) => lower.includes(s))) {
      result[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      result[key] = redact(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// MCP-сервер на stdio обязан писать в stdout только JSON-RPC.
// Любой посторонний вывод в stdout ломает протокол → клиент рвёт соединение.
// Поэтому все логи направляем в stderr (его MCP-клиент не читает).
export const logger = pino(
  {
    level: config.logLevel,
    hooks: {
      logMethod(inputArgs, method) {
        if (inputArgs.length > 0 && typeof inputArgs[0] === "object" && inputArgs[0] !== null) {
          inputArgs[0] = redact(inputArgs[0]);
        }
        return method.apply(this, inputArgs);
      },
    },
  },
  process.stderr,
);
