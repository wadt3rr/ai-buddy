import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  return {
    server: {
      proxy: {
        "/api": {
          target: env.BACKEND_URL || "http://localhost:8080",
          changeOrigin: true,
        },
        "/health": {
          target: env.BACKEND_URL || "http://localhost:8080",
          changeOrigin: true,
        },
      },
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": resolve(import.meta.dirname, "./src"),
      },
    },
  }
})
