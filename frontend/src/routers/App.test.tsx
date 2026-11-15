import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { expect, it } from "vitest"
import { AuthProvider } from "@/contexts/AuthContext"
import { ThemeProvider } from "@/components/theme-provider"
import App from "./App"

it("runs the login, protected chat and logout flow through the actual browser router", async () => {
  const user = userEvent.setup()
  render(
    <ThemeProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
  )
  await user.type(
    await screen.findByLabelText("Корпоративная почта"),
    "intern@avito.ru"
  )
  await user.type(
    screen.getByLabelText("Пароль", { selector: "input" }),
    "password123"
  )
  await user.click(screen.getByRole("button", { name: "Войти в аккаунт" }))
  expect(
    await screen.findByRole("textbox", { name: "Сообщение для AI Buddy" })
  ).toBeInTheDocument()
  expect(window.location.pathname).toBe("/chat")
  await user.click(screen.getByRole("button", { name: "Меню пользователя" }))
  await user.click(await screen.findByRole("menuitem", { name: "Выйти" }))
  expect(
    await screen.findByRole("button", { name: "Войти в аккаунт" })
  ).toBeInTheDocument()
  expect(window.location.pathname).toBe("/")
})
