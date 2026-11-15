import { resolve } from "node:path"
import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": resolve(import.meta.dirname, "./src") } },
  test: {
    environment: "jsdom",
    environmentOptions: { jsdom: { url: "http://localhost:3000/" } },
    setupFiles: ["./src/test/setup.ts"],
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      // Measure runtime code, including local UI wrappers and entry points.
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/*.spec.{ts,tsx}",
        "src/test/**",
        "src/mocks/**",
        "src/**/*.d.ts",
      ],
      reporter: ["text", "html", "json-summary", "json"],
      reportsDirectory: "./coverage",
      thresholds: { lines: 80.01 },
    },
  },
})
