import { describe, expect, it } from "vitest";
import { formatTelegramText } from "../src/transport/telegram.js";

describe("telegram formatter smoke", () => {
  it("собирает caption", () => {
    const text = formatTelegramText({
      title: "Title",
      draft: "Draft",
      cta: "CTA",
    });
    expect(text).toContain("<b>Title</b>");
    expect(text).toContain("Draft");
    expect(text).toContain("CTA");
  });
});
