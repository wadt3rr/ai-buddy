import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { http, HttpResponse } from "msw"
import { describe, expect, it, vi } from "vitest"
import { AuthProvider } from "@/contexts/AuthContext"
import { apiUrl } from "@/api/client"
import { DEMO_COOKIE } from "@/mocks/handlers"
import { server } from "@/test/server"
import { ChatPage } from "./ChatPage"

function controlledStream() {
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined
  const cancel = vi.fn()
  server.use(
    http.post(
      apiUrl("/chat/stream"),
      () =>
        new HttpResponse(
          new ReadableStream<Uint8Array>({
            start(value) {
              controller = value
            },
            cancel,
          }),
          { headers: { "Content-Type": "text/event-stream" } }
        )
    )
  )
  return {
    async ready() {
      await waitFor(() => expect(controller).toBeDefined())
    },
    async emit(event: string, data: object) {
      await act(async () => {
        controller!.enqueue(
          new TextEncoder().encode(
            `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
          )
        )
      })
    },
    cancel,
  }
}

function renderChat() {
  document.cookie = `${DEMO_COOKIE}=active; Path=/`
  return render(
    <AuthProvider>
      <MemoryRouter>
        <ChatPage />
      </MemoryRouter>
    </AuthProvider>
  )
}

describe("ChatPage integration", () => {
  it("switches from welcome to conversation and renders arriving chunks in one assistant response", async () => {
    const user = userEvent.setup()
    const stream = controlledStream()
    renderChat()
    expect(screen.getByRole("link", { name: "AI Buddy" })).toHaveAttribute(
      "href",
      "/"
    )
    await user.type(screen.getByRole("textbox"), "Как начать?")
    await user.click(
      screen.getByRole("button", { name: "Отправить сообщение" })
    )
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument()
    expect(screen.getByText("Как начать?")).toBeInTheDocument()
    expect(screen.getByRole("textbox")).toBeDisabled()
    expect(screen.getByRole("status")).toHaveTextContent("думает")
    await stream.ready()
    await stream.emit("delta", { content: "## Первый шаг\n\n" })
    expect(
      await screen.findByRole("heading", { name: "Первый шаг" })
    ).toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent("отвечает")
    await stream.emit("delta", { content: "Спроси **наставника**." })
    expect(await screen.findByText("наставника")).toBeInTheDocument()
    expect(screen.getAllByLabelText("Ответ AI Buddy")).toHaveLength(1)
    await stream.emit("done", {})
    await waitFor(() => expect(screen.getByRole("textbox")).toBeEnabled())
    expect(screen.getByLabelText("Ответ AI Buddy")).toHaveAttribute(
      "aria-busy",
      "false"
    )
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("stops generation, retains text and lets the user send again after an API error", async () => {
    const user = userEvent.setup()
    const stream = controlledStream()
    renderChat()
    await user.type(screen.getByRole("textbox"), "Вопрос{Enter}")
    await stream.ready()
    await stream.emit("delta", { content: "Сохранённый ответ" })
    await screen.findByText("Сохранённый ответ")
    await user.click(
      screen.getByRole("button", { name: "Остановить генерацию" })
    )
    expect(screen.getByRole("textbox")).toBeEnabled()
    expect(screen.getByText("Сохранённый ответ")).toBeInTheDocument()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    server.use(
      http.post(
        apiUrl("/chat/stream"),
        () => new HttpResponse(null, { status: 500 })
      )
    )
    await user.type(screen.getByRole("textbox"), "Ещё вопрос{Enter}")
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Сервер временно недоступен"
    )
    expect(screen.getByText("Сохранённый ответ")).toBeInTheDocument()
    expect(screen.getByRole("textbox")).toBeEnabled()
    server.use(
      http.post(
        apiUrl("/chat/stream"),
        () =>
          new HttpResponse(
            'event: delta\ndata: {"content":"Новый ответ"}\n\nevent: done\ndata: {}\n\n',
            { headers: { "Content-Type": "text/event-stream" } }
          )
      )
    )
    await user.type(screen.getByRole("textbox"), "Повтор{Enter}")
    expect(await screen.findByText("Новый ответ")).toBeInTheDocument()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })
})
