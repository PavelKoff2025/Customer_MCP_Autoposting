# mcp-social-autopost

Production-ready MCP-сервер (stdio) для автопостинга AI-новостей в Telegram, ВКонтакте и TenChat.

## Возможности

- Чтение JSON-контента из `CONTENT_DIR` (скилл `ai_news_to_Social_media`)
- Публикация на одну или все платформы со статусом `ready`
- Генерация изображений через `IMAGE_API_URL`
- TenChat через Playwright (публичного API нет)
- Идемпотентность публикаций (`storage/state/`)
- Resources: `content://files`, `content://platforms`, `content://history`

## Установка

```bash
cd mcp-social-autopost
npm install
cp .env.example .env
npm run build
```

Проверка:

```bash
npm test
npm run dev   # ждёт stdin (stdio MCP)
```

## Настройка .env

Скопируйте `.env.example` и заполните нужные платформы.

### Telegram

1. Создайте бота у [@BotFather](https://t.me/BotFather)
2. Добавьте бота в канал/группу как администратора
3. Укажите `TELEGRAM_BOT_TOKEN` и `TELEGRAM_CHAT_ID` (для супергрупп обычно `-100...`)

### ВКонтакте

VK-transport постит одновременно в **две независимые цели** (если обе настроены),
каждая в своём `try/catch` — падение одной не блокирует вторую:

- **Группа (сообщество/паблик):** `VK_ACCESS_TOKEN` (токен сообщества, права `wall`, `photos`) + `VK_GROUP_ID`.
  Публикация через `wall.post` с `owner_id = -VK_GROUP_ID`, `from_group = 1`.
  Фото — через `photos.getWallUploadServer` с токеном группы.
- **Личная страница:** `VK_USER_TOKEN` (пользовательский токен, права `wall`, `photos`, `offline`) + `VK_USER_ID`.
  Публикация через `wall.post` с `owner_id = VK_USER_ID`, `from_group = 0`.
  Фото — через `photos.getWallUploadServer` с токеном пользователя (без `group_id`).

Переменные (все опциональны, кроме `VK_API_VERSION`):

```
VK_ACCESS_TOKEN=      # токен сообщества (для группы)
VK_GROUP_ID=          # числовой ID группы, напр. 166522640
VK_USER_TOKEN=        # пользовательский токен (для личной стены)
VK_USER_ID=           # числовой ID пользователя, напр. 12809729
VK_API_VERSION=5.199
```

> Достаточно настроить одну пару — `isConfigured()` вернёт `true`, если настроена хотя бы одна.

Результат `create_post`/`publish_all` для VK — массив из двух `PostResult`:

```json
[
  { "platform": "vk-group", "post_id": "group_123", "url": "https://vk.com/wall-166522640_123" },
  { "platform": "vk-user",  "post_id": "user_456",  "url": "https://vk.com/wall12809729_456" }
]
```

`post_status` и `delete_post` разбирают префикс `post_id`:
`group_<id>` → токен группы, `owner_id = -GROUP_ID`;
`user_<id>` → токен пользователя, `owner_id = USER_ID`.

`list_platforms` показывает VK двумя строками: «VK (группа)» и «VK (личная)»,
каждая со своей проверкой токена (`groups.getById` / `users.get`).

Идемпотентность: состояние публикации хранится отдельно для каждого таргета
(`storage/state/<file>-vk-group.json` и `...-vk-user.json`). Повторный вызов
`create_post` пропускает уже опубликованные таргеты (через `skip_targets`).

#### Получение пользовательского токена (для личной стены)

1. Создайте standalone-приложение: `https://vk.com/editapp?act=create` (тип **Standalone**).
2. Скопируйте `client_id` (ID приложения).
3. Откройте в браузере (подставив `client_id`):
   `https://oauth.vk.com/authorize?client_id=ID&redirect_uri=https://oauth.vk.com/blank.html&display=page&scope=wall,photos,offline&response_type=token&v=5.199`
4. Разрешите доступ → в адресной строке `#access_token=...&user_id=...`.
5. `VK_USER_TOKEN` = `access_token`, `VK_USER_ID` = `user_id`.

#### Получение токена сообщества (для группы)

Управление сообществом → «Работа с API» → «Ключи доступа» → создать ключ
с правами `wall`, `photos`. `VK_ACCESS_TOKEN` = ключ, `VK_GROUP_ID` = числовой ID
сообщества (из URL `vk.com/club<ID>` или настроек).

### TenChat

```bash
npm run tenchat:login
```

Откроется браузер → войдите → нажмите Enter в терминале. Сессия сохранится в `storage/sessions/tenchat.json`.

Селекторы UI вынесены в `TENCHAT_SELECTORS` (`src/transport/tenchat.ts`) — при смене вёрстки TenChat обновите их.

### Генерация изображений

- `IMAGE_API_URL` — endpoint, принимающий `{ prompt, width, height }`
- `IMAGE_API_KEY` — опционально (Bearer)

## Claude Code

Файл `.claude/mcp.json` в корне репозитория:

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

После `npm run build` перезапустите Claude Code.

## Примеры вызовов tools

### list_platforms

```json
{}
```

### read_content_file

```json
{ "latest": true }
```

или

```json
{ "filename": "2026-08-11-news-slug-social-content.json" }
```

### create_post (dry run)

```json
{
  "content_file": "2026-08-11-news-slug-social-content.json",
  "platform": "telegram",
  "dry_run": true
}
```

### create_post (Telegram)

```json
{
  "content_file": "2026-08-11-news-slug-social-content.json",
  "platform": "telegram",
  "image_path": "./storage/images/2026-08-11-slug.png"
}
```

### publish_all

```json
{
  "content_file": "2026-08-11-news-slug-social-content.json",
  "image_path": "./storage/images/2026-08-11-slug.png",
  "stop_on_error": false
}
```

### generate_image

```json
{
  "content_file": "2026-08-11-news-slug-social-content.json",
  "width": 1920,
  "height": 1080
}
```

## Resources

| URI | Описание |
|-----|----------|
| `content://files` | Список JSON в CONTENT_DIR |
| `content://platforms` | Статус API-ключей |
| `content://history` | История из `storage/state/` |

## Структура

```
mcp-social-autopost/
├── src/
│   ├── index.ts
│   ├── server.ts
│   ├── config.ts
│   ├── schemas/
│   ├── transport/
│   ├── tools/
│   ├── resources/
│   ├── utils/
│   └── browser/
├── storage/
├── tests/
└── README.md
```

## Troubleshooting

| Проблема | Решение |
|----------|---------|
| `Неверный токен бота` | Проверьте `TELEGRAM_BOT_TOKEN` |
| `Бот не добавлен в чат` | Добавьте бота админом, проверьте `TELEGRAM_CHAT_ID` |
| TenChat: сессия истекла | `npm run tenchat:login` |
| TenChat: элемент не найден | Обновите селекторы + смотрите скриншот в `storage/images/` |
| Path traversal | Указывайте только имя файла внутри `CONTENT_DIR` |
| Повторная публикация | Идемпотентность: смотрите `storage/state/` |

## Чек-лист

1. `npm install`
2. `npm run build`
3. `npm run dev` — сервер ждёт stdin
4. Заполнить `.env` (минимум Telegram)
5. `npm run tenchat:login` (если нужен TenChat)
6. `list_platforms`
7. `read_content_file`
8. `create_post` с `dry_run: true`
9. `create_post` для Telegram
10. `publish_all`

## Лицензия

Private / для личного использования.
