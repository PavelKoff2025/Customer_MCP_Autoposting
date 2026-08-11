import { z } from "zod";

export const PlatformStatusSchema = z.enum(["ready", "needs_review", "skipped"]);

export const ContentSchema = z.object({
  image_prompt: z.string(),
  platform_status: z.object({
    telegram: PlatformStatusSchema,
    vk: PlatformStatusSchema,
    tenchat: PlatformStatusSchema,
    blog: PlatformStatusSchema,
  }),
  summary: z.object({
    title: z.string(),
    source_url: z.string(),
    news_type: z.enum(["positive", "negative", "neutral", "hype"]),
    main_point: z.string(),
    why_it_matters: z.string(),
    facts_used: z.array(z.string()),
    unverified_claims: z.array(z.string()).optional(),
  }),
  social: z.object({
    telegram: z.object({
      title: z.string(),
      draft: z.string(),
      cta: z.string(),
      hashtags: z.array(z.string()).optional(),
    }),
    vk: z.object({
      hook: z.string(),
      draft: z.string(),
      hashtags: z.array(z.string()),
      poll: z.string().nullable(),
      cta: z.string(),
    }),
    tenchat: z.object({
      thesis: z.string(),
      draft: z.string(),
      hashtags: z.array(z.string()),
      cta: z.string(),
    }),
  }),
  blog: z.object({
    site: z.literal("pavelkarikoff.ru"),
    target_word_count: z.number(),
    seo: z.object({
      h1: z.string(),
      meta_description: z.string(),
      slug: z.string(),
      keywords: z.array(z.string()),
      schema_type: z.enum(["Article", "NewsArticle", "HowTo"]),
      canonical_url: z.string(),
      alt_text_image: z.string(),
      internal_links: z.array(z.string()),
      h2: z.array(z.string()),
      h3: z.array(z.string()),
    }),
    draft: z.string(),
  }),
});

export type Content = z.infer<typeof ContentSchema>;
export type PlatformName = "telegram" | "vk" | "tenchat";

export const PlatformEnum = z.enum([
  "telegram",
  "vk",
  "tenchat",
]);
