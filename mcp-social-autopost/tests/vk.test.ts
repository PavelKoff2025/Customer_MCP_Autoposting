import { describe, expect, it } from "vitest";
import { formatVkText } from "../src/transport/vk.js";
import { formatVkHashtags } from "../src/utils/hashtag.js";

describe("vk formatter smoke", () => {
  it("собирает пост и хэштеги", () => {
    const text = formatVkText({
      hook: "Hook",
      draft: "Draft",
      hashtags: ["vk"],
      poll: "Вопрос?",
      cta: "CTA",
    });
    expect(text.startsWith("Hook")).toBe(true);
    expect(text).toContain("#vk");
    expect(formatVkHashtags(["x"])).toBe("#x");
  });
});
