import { describe, expect, it, vi } from "vitest";
import {
  VkTransport,
  VK_GROUP_TAG,
  VK_USER_TAG,
} from "../src/transport/vk.js";
import { targetTagsFor } from "../src/tools/create-post.js";
import type { PublishOptions } from "../src/transport/base.js";

describe("VK: два таргета", () => {
  it("targetTagsFor: vk → группа + личная", () => {
    expect(targetTagsFor("vk")).toEqual([VK_GROUP_TAG, VK_USER_TAG]);
    expect(targetTagsFor("telegram")).toEqual(["telegram"]);
    expect(targetTagsFor("tenchat")).toEqual(["tenchat"]);
  });

  it("publish() возвращает массив; каждому таргету — свой префикс post_id и url", async () => {
    const t = new VkTransport() as unknown as {
      call: (m: string, p: Record<string, unknown>, token: string) => Promise<unknown>;
      publish: (o: PublishOptions) => Promise<unknown>;
    };
    t.call = vi.fn(async (method: string) => {
      if (method === "wall.post") return { post_id: 777 };
      throw new Error(`unexpected method ${method}`);
    });

    const res = (await t.publish({ text: "привет" })) as Array<{
      platform: string;
      post_id?: string;
      url?: string;
      success: boolean;
    }>;

    expect(Array.isArray(res)).toBe(true);

    const group = res.find((r) => r.platform === VK_GROUP_TAG);
    if (group) {
      expect(group.success).toBe(true);
      expect(group.post_id).toBe("group_777");
      expect(group.url).toMatch(/wall-\d+_777$/); // owner_id отрицательный
    }

    const user = res.find((r) => r.platform === VK_USER_TAG);
    if (user) {
      expect(user.success).toBe(true);
      expect(user.post_id).toBe("user_777");
      expect(user.url).toMatch(/wall\d+_777$/); // owner_id положительный
    }

    expect(group || user).toBeTruthy();
  });

  it("publish() с skip_targets пропускает таргет и возвращает fallback при пустом результате", async () => {
    const t = new VkTransport() as unknown as {
      call: (m: string) => Promise<unknown>;
      publish: (o: PublishOptions) => Promise<unknown>;
    };
    t.call = vi.fn(async () => ({ post_id: 1 }));

    const res = (await t.publish({
      text: "x",
      skip_targets: [VK_GROUP_TAG, VK_USER_TAG],
    })) as Array<{ platform: string; success: boolean; error?: string }>;

    expect(res).toHaveLength(1);
    expect(res[0].success).toBe(false);
    expect(res[0].platform).toBe("vk");
    expect(res[0].error).toContain("VK не настроен");
  });
});