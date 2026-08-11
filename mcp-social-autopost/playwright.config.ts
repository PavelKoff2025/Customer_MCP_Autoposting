import { defineConfig } from "playwright/test";

export default defineConfig({
  timeout: 30_000,
  use: {
    headless: true,
    navigationTimeout: 30_000,
    actionTimeout: 10_000,
  },
});
