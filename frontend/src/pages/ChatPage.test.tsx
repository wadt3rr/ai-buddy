import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { delay, http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"
import { AuthProvider } from "@/contexts/AuthContext"
import { apiUrl } from "@/api/client"
import { server } from "@/test/server"
import { ChatPage } from "./ChatPage"
function renderChat() {
  localStorage.setItem("ai_buddy_access_token", "test-token")
  return render(
    <AuthProvider>
      <MemoryRouter>
        <ChatPage />
      </MemoryRouter>
    </AuthProvider>
  )
}
describe("ChatPage integration", () => {
  it("loads history then switches welcome to conversation with a real JSON response", async () => {
    const user = userEvent.setup()
    renderChat()
    await screen.findByRole("button", { name: "Меню пользователя" })
    await screen.findByRole("heading", { level: 1 })
    const input = screen.getByRole("textbox")
    await waitFor(() => expect(input).toBeEnabled())
    await user.type(input, "Как начать?{Enter}")
    expect(await screen.findByText("Как начать?")).toBeInTheDocument()
    expect(await screen.findByText("Ответ сервера")).toBeInTheDocument()
    expect(screen.getAllByLabelText("Ответ AI Buddy")).toHaveLength(1)
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })
  it("cancels waiting and permits sending after an error", async () => {
    const user = userEvent.setup()
    renderChat()
    await screen.findByRole("heading", { level: 1 })
    server.use(
      http.post(apiUrl("/messages"), async () => {
        await delay(200)
        return new HttpResponse(null, { status: 500 })
      })
    )
    await user.type(screen.getByRole("textbox"), "Вопрос{Enter}")
    await user.click(
      await screen.findByRole("button", { name: "Остановить генерацию" })
    )
    expect(await screen.findByRole("alert")).toHaveTextContent("отменено")
    await waitFor(() => expect(screen.getByRole("textbox")).toBeEnabled())
    server.resetHandlers()
    await user.type(screen.getByRole("textbox"), "Вопрос{Enter}")
    expect(await screen.findByText("Ответ сервера")).toBeInTheDocument()
  })
})
