import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ReadContentInputSchema, readContentTool } from "./tools/read-content.js";
import {
  ListPlatformsInputSchema,
  listPlatformsTool,
} from "./tools/list-platforms.js";
import {
  GenerateImageInputSchema,
  generateImageTool,
} from "./tools/generate-image.js";
import { CreatePostInputSchema, createPostTool } from "./tools/create-post.js";
import { PublishAllInputSchema, publishAllTool } from "./tools/publish-all.js";
import { PostStatusInputSchema, postStatusTool } from "./tools/post-status.js";
import { DeletePostInputSchema, deletePostTool } from "./tools/delete-post.js";
import { getContentFilesResource } from "./resources/content-files.js";
import {
  getPlatformStatusResource,
  getHistoryResource,
} from "./resources/platform-status.js";
import { logger } from "./utils/logger.js";

function ok(text: string) {
  return {
    content: [{ type: "text" as const, text }],
  };
}

function fail(error: unknown) {
  const text =
    error instanceof Error ? error.message : `Неизвестная ошибка: ${String(error)}`;
  logger.error({ err: text }, "Ошибка tool");
  return {
    content: [{ type: "text" as const, text }],
    isError: true as const,
  };
}

export function createServer(): McpServer {
  const server = new McpServer({
    name: "social-autopost",
    version: "1.0.0",
  });

  server.tool(
    "read_content_file",
    "Читает JSON-файл контента, сгенерированный скиллом ai_news_to_Social_media",
    ReadContentInputSchema.shape,
    async (args) => {
      try {
        const input = ReadContentInputSchema.parse(args);
        return ok(await readContentTool(input));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.tool(
    "list_platforms",
    "Проверяет, какие платформы настроены и доступны",
    ListPlatformsInputSchema.shape,
    async (args) => {
      try {
        const input = ListPlatformsInputSchema.parse(args);
        return ok(await listPlatformsTool(input));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.tool(
    "generate_image",
    "Генерирует изображение по промпту и сохраняет локально",
    GenerateImageInputSchema.shape,
    async (args) => {
      try {
        const input = GenerateImageInputSchema.parse(args);
        return ok(await generateImageTool(input));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.tool(
    "create_post",
    "Публикует пост на одну платформу",
    CreatePostInputSchema.shape,
    async (args) => {
      try {
        const input = CreatePostInputSchema.parse(args);
        return ok(await createPostTool(input));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.tool(
    "publish_all",
    'Публикует на все платформы со статусом "ready"',
    PublishAllInputSchema.shape,
    async (args) => {
      try {
        const input = PublishAllInputSchema.parse(args);
        return ok(await publishAllTool(input));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.tool(
    "post_status",
    "Проверяет статус опубликованного поста",
    PostStatusInputSchema.shape,
    async (args) => {
      try {
        const input = PostStatusInputSchema.parse(args);
        return ok(await postStatusTool(input));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.tool(
    "delete_post",
    "Удаляет или отменяет пост на платформе",
    DeletePostInputSchema.shape,
    async (args) => {
      try {
        const input = DeletePostInputSchema.parse(args);
        return ok(await deletePostTool(input));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.resource(
    "content-files",
    "content://files",
    {
      description: "Список всех JSON-файлов в CONTENT_DIR с датами",
      mimeType: "application/json",
    },
    async () => ({
      contents: [
        {
          uri: "content://files",
          mimeType: "application/json",
          text: await getContentFilesResource(),
        },
      ],
    }),
  );

  server.resource(
    "platform-status",
    "content://platforms",
    {
      description: "Статус подключений всех платформ",
      mimeType: "text/markdown",
    },
    async () => ({
      contents: [
        {
          uri: "content://platforms",
          mimeType: "text/markdown",
          text: await getPlatformStatusResource(),
        },
      ],
    }),
  );

  server.resource(
    "history",
    "content://history",
    {
      description: "История публикаций из storage/state/",
      mimeType: "application/json",
    },
    async () => ({
      contents: [
        {
          uri: "content://history",
          mimeType: "application/json",
          text: await getHistoryResource(),
        },
      ],
    }),
  );

  return server;
}
