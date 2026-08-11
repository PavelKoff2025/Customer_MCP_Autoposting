import { describe, expect, it } from "vitest";
import { ContentSchema } from "../src/schemas/content.js";
import { formatTelegramText, escapeHtml } from "../src/transport/telegram.js";
import { formatVkText } from "../src/transport/vk.js";
import { formatTenchatText } from "../src/transport/tenchat.js";
import {
  formatVkHashtags,
} from "../src/utils/hashtag.js";

const sample = {
  image_prompt: "AI news illustration",
  platform_status: {
    telegram: "ready",
    vk: "ready",
    tenchat: "ready",
    blog: "skipped",
  },
  summary: {
    title: "Новость",
    source_url: "https://example.com",
    news_type: "positive",
    main_point: "Главное",
    why_it_matters: "Важно",
    facts_used: ["факт 1"],
  },
  social: {
    telegram: {
      title: "Заголовок <тест>",
      draft: "Текст поста",
      cta: "Читать дальше",
      hashtags: ["#соло", "#промпт"],
    },
    vk: {
      hook: "Хук VK",
      draft: "Черновик VK",
      hashtags: ["ai", "#marketing"],
      poll: null,
      cta: "Подписывайтесь",
    },
    tenchat: {
      thesis: "Тезис",
      draft: "Текст TenChat",
      hashtags: ["tenchat", "ai"],
      cta: "Обсудим?",
    },
  },
  blog: {
    site: "pavelkarikoff.ru",
    target_word_count: 1200,
    seo: {
      h1: "H1",
      meta_description: "meta",
      slug: "ai-news",
      keywords: ["ai"],
      schema_type: "NewsArticle",
      canonical_url: "https://pavelkarikoff.ru/blog/ai-news",
      alt_text_image: "alt",
      internal_links: ["/course"],
      h2: ["Раздел 1"],
      h3: ["Подраздел"],
    },
    draft: "Блог текст",
  },
} as const;

describe("ContentSchema", () => {
  it("валидирует корректный контент", () => {
    const parsed = ContentSchema.parse(sample);
    expect(parsed.summary.title).toBe("Новость");
    expect(parsed.social.telegram.title).toContain("тест");
  });

  it("отклоняет неверный platform_status", () => {
    expect(() =>
      ContentSchema.parse({
        ...sample,
        platform_status: { ...sample.platform_status, telegram: "done" },
      }),
    ).toThrow();
  });
});

describe("formatters", () => {
  it("formatTelegramText экранирует HTML и добавляет хэштеги футером", () => {
    const text = formatTelegramText(sample.social.telegram);
    expect(text).toContain("<b>Заголовок &lt;тест&gt;</b>");
    expect(text).toContain("#соло");
    expect(text).toContain("#промпт");
    // промо-футер убран
    expect(text).not.toContain("@pavelkarikoff");
    expect(text).not.toContain("pavelkarikoff.ru/course");
  });

  it("escapeHtml экранирует спецсимволы", () => {
    expect(escapeHtml(`a<b>&"c`)).toBe("a&lt;b&gt;&amp;&quot;c");
  });

  it("formatVkText включает хэштеги", () => {
    const text = formatVkText(sample.social.vk);
    expect(text).toContain("Хук VK");
    expect(text).toContain("#ai");
    expect(text).toContain("#marketing");
  });

  it("formatTenchatText собирает thesis/draft/cta/hashtags", () => {
    const text = formatTenchatText(sample.social.tenchat);
    expect(text).toContain("Тезис");
    expect(text).toContain("#tenchat");
    expect(text).toContain("Обсудим?");
  });
});

describe("hashtags", () => {
  it("formatVkHashtags нормализует #", () => {
    expect(formatVkHashtags(["ai", "#ok"])).toBe("#ai #ok");
  });
});
