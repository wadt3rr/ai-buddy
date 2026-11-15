import { StrictMode } from "react"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { describe, expect, it } from "vitest"
import { delay, http, HttpResponse } from "msw"
import { apiUrl, client } from "@/api/client"
import { AuthProvider } from "@/contexts/AuthContext"
import { ProtectedRoute } from "@/components/ProtectedRoute"
import { LoginPage } from "@/pages/LoginPage"
import { DEMO_COOKIE } from "@/mocks/handlers"
import { mockUser } from "@/mocks/data"
import { server } from "@/test/server"
import { useAuth } from "./useAuth"
import { useLogout } from "./useLogout"

function AnotherConsumer() {
  const { user } = useAuth()
  return <span>{user?.role}</span>
}

function ChatFixture() {
  const { user } = useAuth()
  const { logout, isLoading, error } = useLogout()
  return (
    <>
      <h1>Чат {user?.name}</h1>
      <AnotherConsumer />
      <button disabled={isLoading} onClick={() => void logout()}>
        Выйти
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  )
}

function renderApp(path = "/chat") {
  return render(
    <StrictMode>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route element={<ProtectedRoute guestOnly />}>
              <Route path="/" element={<LoginPage />} />
            </Route>
            <Route element={<ProtectedRoute />}>
              <Route path="/chat" element={<ChatFixture />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </StrictMode>
  )
}

async function submitLogin(
  email = "intern@avito.ru",
  password = "password123"
) {
  fireEvent.change(await screen.findByLabelText("Корпоративная почта"), {
    target: { value: email },
  })
  fireEvent.change(screen.getByLabelText("Пароль", { selector: "input" }), {
    target: { value: password },
  })
  fireEvent.click(screen.getByRole("button", { name: "Войти в аккаунт" }))
}

describe("cookie authentication and protected routes", () => {
  it("hides protected content during the session check and redirects guests", async () => {
    renderApp()
    expect(
      screen.getByRole("status", { name: "Проверка авторизации" })
    ).toHaveTextContent("Проверяем сессию")
    expect(screen.queryByText(/Чат/)).not.toBeInTheDocument()
    expect(
      await screen.findByRole("button", { name: "Войти в аккаунт" })
    ).toBeInTheDocument()
  })

  it("logs in with Axios, blocks duplicate submits and populates all auth consumers", async () => {
    let requests = 0
    server.use(
      http.post(apiUrl("/auth/login"), async () => {
        requests++
        await delay(100)
        return HttpResponse.json({ user: mockUser })
      })
    )
    renderApp("/")
    await submitLogin()
    expect(screen.getByRole("button", { name: "Входим…" })).toBeDisabled()
    fireEvent.submit(
      screen.getByRole("button", { name: "Входим…" }).closest("form")!
    )
    expect(
      await screen.findByRole("heading", { name: "Чат Анна Иванова" })
    ).toBeInTheDocument()
    expect(screen.getByText(mockUser.role)).toBeInTheDocument()
    expect(requests).toBe(1)
    expect(client.defaults.withCredentials).toBe(true)
  })

  it.each([
    ["intern@avito.ru", "wrong", "Неверная почта или пароль"],
    ["server-error@avito.ru", "password123", "Сервер временно недоступен"],
    ["network-error@avito.ru", "password123", "Не удалось связаться"],
  ])("shows the login error for %s / %s", async (email, password, error) => {
    renderApp("/")
    await submitLogin(email, password)
    expect(await screen.findByRole("alert")).toHaveTextContent(error)
    expect(
      screen.getByRole("button", { name: "Войти в аккаунт" })
    ).toBeEnabled()
  })

  it("restores the session after remount, checks me only once per provider even in StrictMode, and redirects from login", async () => {
    document.cookie = `${DEMO_COOKIE}=active; Path=/`
    let requests = 0
    server.use(
      http.get(apiUrl("/auth/me"), () => {
        requests++
        return HttpResponse.json({ user: mockUser })
      })
    )
    const first = renderApp("/")
    expect(
      await screen.findByRole("heading", { name: "Чат Анна Иванова" })
    ).toBeInTheDocument()
    expect(requests).toBe(1)
    first.unmount()
    renderApp()
    expect(
      await screen.findByRole("heading", { name: "Чат Анна Иванова" })
    ).toBeInTheDocument()
    expect(requests).toBe(2)
  })

  it("persists the mock session across reloads and removes it on logout", async () => {
    const first = renderApp("/")
    await submitLogin()
    await screen.findByRole("heading", { name: "Чат Анна Иванова" })
    expect(document.cookie).toContain(`${DEMO_COOKIE}=active`)
    first.unmount()
    const second = renderApp()
    fireEvent.click(await screen.findByRole("button", { name: "Выйти" }))
    await screen.findByRole("button", { name: "Войти в аккаунт" })
    expect(document.cookie).not.toContain(DEMO_COOKIE)
    second.unmount()
    renderApp()
    expect(
      await screen.findByRole("button", { name: "Войти в аккаунт" })
    ).toBeInTheDocument()
  })

  it("keeps the current user when logout fails and permits retry", async () => {
    document.cookie = `${DEMO_COOKIE}=active; Path=/`
    document.cookie = "avito_buddy_mock_failure=logout; Path=/"
    renderApp()
    fireEvent.click(await screen.findByRole("button", { name: "Выйти" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Сервер временно недоступен"
    )
    expect(
      screen.getByRole("heading", { name: "Чат Анна Иванова" })
    ).toBeInTheDocument()
    document.cookie = "avito_buddy_mock_failure=; Max-Age=0; Path=/"
    fireEvent.click(screen.getByRole("button", { name: "Выйти" }))
    expect(
      await screen.findByRole("button", { name: "Войти в аккаунт" })
    ).toBeInTheDocument()
  })

  it("shows session-check failures with a retry instead of flashing login or protected content", async () => {
    document.cookie = `${DEMO_COOKIE}=active; Path=/`
    document.cookie = "avito_buddy_mock_failure=me; Path=/"
    renderApp()
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Сервер временно недоступен"
    )
    expect(
      screen.queryByRole("button", { name: "Войти в аккаунт" })
    ).not.toBeInTheDocument()
    document.cookie = "avito_buddy_mock_failure=; Max-Age=0; Path=/"
    fireEvent.click(screen.getByRole("button", { name: "Повторить проверку" }))
    expect(
      await screen.findByRole("heading", { name: "Чат Анна Иванова" })
    ).toBeInTheDocument()
  })

  it("invalidates the session when a protected API returns 401", async () => {
    document.cookie = `${DEMO_COOKIE}=active; Path=/`
    renderApp()
    await screen.findByRole("heading", { name: "Чат Анна Иванова" })
    server.use(
      http.post(
        apiUrl("/auth/logout"),
        () => new HttpResponse(null, { status: 401 })
      )
    )
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Выйти" }))
    })
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Войти в аккаунт" })
      ).toBeInTheDocument()
    )
  })
})
