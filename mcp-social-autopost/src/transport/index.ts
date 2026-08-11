import { TelegramTransport } from "./telegram.js";
import { VkTransport } from "./vk.js";
import { TenchatTransport } from "./tenchat.js";
import type { TransportAdapter } from "./base.js";
import type { PlatformName } from "../schemas/content.js";

export function createTransports(): Record<PlatformName, TransportAdapter> {
  return {
    telegram: new TelegramTransport(),
    vk: new VkTransport(),
    tenchat: new TenchatTransport(),
  };
}

export function getTransport(
  platform: PlatformName,
  transports = createTransports(),
): TransportAdapter {
  return transports[platform];
}
