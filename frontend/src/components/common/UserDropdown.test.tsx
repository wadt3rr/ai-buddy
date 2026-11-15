import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import * as authApi from "@/api/auth.api"
import { describe, expect, it, vi } from "vitest"
import { AuthProvider } from "@/contexts/AuthContext"
import { LoginPage } from "@/pages/LoginPage"
import { setMediaMatch } from "@/test/media"
import { ProtectedRoute } from "@/components/ProtectedRoute"
import { ThemeProvider } from "@/components/theme-provider"
import { Header } from "./Header"

function renderHeader() {
  localStorage.setItem("ai_buddy_access_token", "test-token")
  return render(
    <ThemeProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={["/chat"]}>
          <Routes>
            <Route element={<ProtectedRoute />}>
              <Route path="/chat" element={<Header />} />
            </Route>
            <Route path="/" element={<LoginPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}

describe("Header and UserDropdown", () => {
  it("shows the authenticated user's name and role and supports keyboard menu navigation", async () => {
    const user = userEvent.setup()
    renderHeader()
    const trigger = await screen.findByRole("button", {
      name: "Меню пользователя",
    })
    expect(screen.getByRole("link", { name: "AI-Buddy" })).toHaveAttribute(
      "href",
      "/"
    )
    expect(screen.getByText("Начни с большего")).toBeInTheDocument()
    trigger.focus()
    await user.keyboard("{Enter}")
    expect(await screen.findByRole("menu")).toBeInTheDocument()
    expect(screen.getByText("intern@avito.ru")).toBeInTheDocument()
    expect(screen.getAllByText("Frontend-разработчик")).toHaveLength(2)
    await user.keyboard("{Escape}")
    await waitFor(() =>
      expect(screen.queryByRole("menu")).not.toBeInTheDocument()
    )
    expect(trigger).toHaveFocus()
  })

  it("switches light, dark and system themes through the real submenu", async () => {
    localStorage.setItem("theme", "light")
    const user = userEvent.setup()
    renderHeader()
    const chooseTheme = async (name: string) => {
      const trigger = await screen.findByRole("button", {
        name: "Меню пользователя",
      })
      if (trigger.getAttribute("aria-expanded") !== "true") {
        trigger.focus()
        await user.keyboard("{Enter}")
      }
      const submenu = await screen.findByRole("menuitem", { name: "Тема" })
      if (submenu.getAttribute("aria-expanded") !== "true") {
        submenu.focus()
        await user.keyboard("{ArrowRight}")
      }
      const option = await screen.findByRole("menuitemradio", { name })
      option.focus()
      await user.keyboard("{Enter}")
    }
    await chooseTheme("Тёмная")
    expect(localStorage.getItem("theme")).toBe("dark")
    expect(document.documentElement).toHaveClass("dark")
    expect(document.documentElement.style.colorScheme).toBe("dark")
    expect(localStorage.getItem("theme")).toBe("dark")
    await chooseTheme("Светлая")
    expect(document.documentElement).not.toHaveClass("dark")
    expect(localStorage.getItem("theme")).toBe("light")
    await chooseTheme("Системная")
    act(() => setMediaMatch("(prefers-color-scheme: dark)", true))
    expect(document.documentElement).toHaveClass("dark")
    act(() => setMediaMatch("(prefers-color-scheme: dark)", false))
    expect(document.documentElement).not.toHaveClass("dark")
    expect(localStorage.getItem("theme")).toBe("system")
  })

  it("shows a logout failure, preserves user access, and allows a successful retry", async () => {
    const user = userEvent.setup()
    const remove = vi
      .spyOn(Storage.prototype, "removeItem")
      .mockImplementationOnce(() => {
        throw new Error("Storage failed")
      })
    renderHeader()
    await user.click(
      await screen.findByRole("button", { name: "Меню пользователя" })
    )
    await user.click(await screen.findByRole("menuitem", { name: "Выйти" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Не удалось получить ответ"
    )
    expect(
      screen.getByRole("button", { name: "Меню пользователя" })
    ).toBeInTheDocument()
    remove.mockRestore()
    await user.click(screen.getByRole("button", { name: "Меню пользователя" }))
    await user.click(await screen.findByRole("menuitem", { name: "Выйти" }))
    expect(
      await screen.findByRole("button", { name: "Войти в аккаунт" })
    ).toBeInTheDocument()
    expect(localStorage.getItem("ai_buddy_access_token")).toBeNull()
  })

  it("prevents a second logout while the first request is pending", async () => {
    const user = userEvent.setup()
    let finish: (() => void) | undefined
    let requests = 0
    const pending = new Promise<void>((resolve) => {
      finish = resolve
    })
    vi.spyOn(authApi, "logoutRequest").mockImplementation(async () => {
      requests++
      await pending
      localStorage.removeItem("ai_buddy_access_token")
    })
    renderHeader()
    await user.click(
      await screen.findByRole("button", { name: "Меню пользователя" })
    )
    await user.click(await screen.findByRole("menuitem", { name: "Выйти" }))
    await user.click(screen.getByRole("button", { name: "Меню пользователя" }))
    expect(
      await screen.findByRole("menuitem", { name: "Выходим…" })
    ).toHaveAttribute("aria-disabled", "true")
    expect(requests).toBe(1)
    await act(async () => {
      finish!()
    })
    expect(
      await screen.findByRole("button", { name: "Войти в аккаунт" })
    ).toBeInTheDocument()
  })
})
