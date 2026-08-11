# Customer MCP Autoposting

**Один MCP-сервер — посты сразу в Telegram, ВКонтакте и TenChat.**

AI пишет текст → вы говорите ассистенту «опубликуй» → сервер сам разносит контент по площадкам. Без копипаста, без ручных вкладок, с идемпотентностью и dry-run.

[![MCP](https://img.shields.io/badge/MCP-stdio-black)](https://modelcontextprotocol.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-Private-lightgrey)](#лицензия)

---

## Зачем это

Маркетологу и солопренёру не нужна ещё одна админка. Нужен мост между AI-контентом и живыми соцсетями:

| Было | Стало |
|------|--------|
| Скопировать текст в 3 окна | Один вызов `publish_all` |
| Забыть, куда уже постили | Состояние в `storage/state/` |
| Сломать вёрстку TenChat вручную | Playwright + сохранённая сессия |
| «А вдруг отправится криво?» | `dry_run: true` перед боем |

---

## Платформы

| Площадка | Как публикует | Особенности |
|----------|---------------|-------------|
| **Telegram** | Bot API | Канал / группа, текст + фото |
| **ВКонтакте** | VK API | Две цели сразу: **группа** и **личная стена** |
| **TenChat** | Playwright | Нет публичного API — браузерная автоматизация |

---

## Возможности

- **MCP tools** — `read_content_file`, `list_platforms`, `generate_image`, `create_post`, `publish_all`, `post_status`, `delete_post`
- **MCP resources** — `content://files`, `content://platforms`, `content://history`
- **Идемпотентность** — повторный пост не дублирует уже опубликованные таргеты
- **Генерация обложек** — через ваш `IMAGE_API_URL`
- **Готово к Claude Code / Cursor** — конфиг в `.claude/mcp.json`

---

## Быстрый старт

```bash
git clone https://github.com/PavelKoff2025/Customer_MCP_Autoposting.git
cd Customer_MCP_Autoposting/mcp-social-autopost

npm install
cp .env.example .env   # заполните токены
npm run build
npm test
```

Запуск MCP (stdio):

```bash
npm start
# или для разработки:
npm run dev
```

TenChat (один раз войти в аккаунт):

```bash
npm run tenchat:login
```

---

## Подключение к Claude Code / Cursor

Файл `.claude/mcp.json` уже в репозитории:

```json
{
  "mcpServers": {
    "social-autopost": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "./mcp-social-autopost"
    }
  }
}
```

После `npm run build` перезапустите IDE. Переменные окружения — из `.env` или из блока `env` в MCP-конфиге.

---

## Пример: публикация

Проверка площадок:

```json
{}
```

→ tool `list_platforms`

Dry-run в Telegram:

```json
{
  "content_file": "2026-08-11-news-slug-social-content.json",
  "platform": "telegram",
  "dry_run": true
}
```

→ tool `create_post`

Во все настроенные платформы:

```json
{
  "content_file": "2026-08-11-news-slug-social-content.json",
  "stop_on_error": false
}
```

→ tool `publish_all`

Подробные гайды по токенам Telegram / VK / TenChat — в [`mcp-social-autopost/README.md`](./mcp-social-autopost/README.md).

---

## Структура репозитория

```
Customer_MCP_Autoposting/
├── README.md                 ← вы здесь
├── .claude/mcp.json          ← подключение MCP
└── mcp-social-autopost/      ← сервер
    ├── src/
    │   ├── tools/            ← MCP tools
    │   ├── transport/        ← Telegram, VK, TenChat
    │   ├── resources/        ← content://…
    │   └── browser/          ← логин TenChat
    ├── storage/              ← сессии, стейт, картинки (gitignore)
    ├── tests/
    └── .env.example
```

---

## Стек

- **TypeScript** + Node.js (ESM)
- **[@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk)** — stdio MCP
- **Zod** — валидация входов
- **Playwright** — TenChat
- **Vitest** — тесты
- **Pino** — логи

---

## Чек-лист первого запуска

1. `npm install` && `npm run build`
2. Заполнить `.env` (минимум Telegram)
3. `npm run tenchat:login` — если нужен TenChat
4. `list_platforms` — убедиться, что ключи живые
5. `create_post` с `dry_run: true`
6. Боевой `create_post` / `publish_all`

---

## Безопасность

- `.env`, сессии браузера и история постов **не коммитятся**
- В репозитории только `.env.example`
- Path traversal к контенту закрыт: только файлы внутри `CONTENT_DIR`

---

## Лицензия

Private / для личного и клиентского использования.

---

<p align="center">
  <b>Контент пишется AI — публикация остаётся вашей.</b><br>
  MCP Autoposting · Telegram · VK · TenChat
</p>
