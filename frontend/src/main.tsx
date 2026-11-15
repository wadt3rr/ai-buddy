import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./routers/App.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { AuthProvider } from "@/contexts/AuthContext"

async function bootstrap() {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ThemeProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ThemeProvider>
    </StrictMode>
  )
}

void bootstrap().catch(() => {
  const root = document.getElementById("root")
  if (root) {
    root.setAttribute("role", "alert")
    root.textContent =
      "Не удалось запустить приложение. Попробуй перезагрузить страницу."
  }
})
