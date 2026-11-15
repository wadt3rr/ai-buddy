import { act, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { ChatMessage } from "@/types/chat"
import { ChatConversation } from "./ChatConversation"

const assistant = (
  content: string,
  status: ChatMessage["status"] = "completed"
): ChatMessage => ({
  id: "assistant-1",
  role: "assistant",
  content,
  status,
  createdAt: "2026-11-15T10:00:00Z",
})

describe("ChatConversation", () => {
  it("renders user text safely and assistant Markdown headings, lists, links, tables and code", () => {
    render(
      <ChatConversation
        onSend={vi.fn()}
        onStop={vi.fn()}
        messages={[
          { ...assistant("<b>Вопрос</b>"), id: "user-1", role: "user" },
          assistant(
            "## План\n\n- Первый шаг\n- Второй шаг\n\n[React](https://react.dev)\n\n```ts\nconst value = 1\n```\n\n| Кому | Зачем |\n| --- | --- |\n| Наставник | Помощь |\n\n> Спроси коллегу\n\n**Важно** и *полезно*"
          ),
        ]}
      />
    )
    expect(screen.getByText("<b>Вопрос</b>")).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "План", level: 2 })
    ).toBeInTheDocument()
    expect(screen.getAllByRole("listitem")).toHaveLength(2)
    expect(screen.getByRole("link", { name: "React" })).toHaveAttribute(
      "href",
      "https://react.dev"
    )
    expect(screen.getByText("const value = 1").tagName).toBe("CODE")
    expect(screen.getByRole("table")).toHaveTextContent("Наставник")
    expect(
      screen.getByText("Спроси коллегу").closest("blockquote")
    ).toBeInTheDocument()
    expect(screen.getByText("Важно").tagName).toBe("STRONG")
  })

  it("sends trimmed messages, clears the composer and respects multiline and IME input", async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<ChatConversation messages={[]} onSend={onSend} onStop={vi.fn()} />)
    const input = screen.getByRole("textbox")
    expect(
      screen.getByRole("button", { name: "Отправить сообщение" })
    ).toBeDisabled()
    await user.type(input, "   {Enter}")
    expect(onSend).not.toHaveBeenCalled()
    await user.clear(input)
    await user.type(input, "  Строка{Shift>}{Enter}{/Shift}Вторая  ")
    fireEvent.keyDown(input, { key: "Enter", isComposing: true })
    expect(onSend).not.toHaveBeenCalled()
    await user.keyboard("{Enter}")
    expect(onSend).toHaveBeenCalledExactlyOnceWith("Строка\nВторая")
    expect(input).toHaveValue("")
    await user.type(input, "Ещё вопрос")
    await user.click(
      screen.getByRole("button", { name: "Отправить сообщение" })
    )
    expect(onSend).toHaveBeenLastCalledWith("Ещё вопрос")
  })

  it("disables sending while waiting, updates the same response and exposes cancellation and errors", async () => {
    const user = userEvent.setup()
    const onStop = vi.fn()
    const onSend = vi.fn()
    const { rerender } = render(
      <ChatConversation
        messages={[assistant("", "streaming")]}
        isLoading
        onSend={onSend}
        onStop={onStop}
      />
    )
    expect(screen.getByRole("status")).toHaveTextContent("думает")
    expect(screen.getByRole("textbox")).toBeDisabled()
    expect(screen.getByLabelText("Ответ AI Buddy")).toHaveAttribute(
      "aria-busy",
      "true"
    )
    rerender(
      <ChatConversation
        messages={[assistant("## Частичный **ответ", "streaming")]}
        isLoading
        onSend={onSend}
        onStop={onStop}
      />
    )
    expect(screen.getAllByLabelText("Ответ AI Buddy")).toHaveLength(1)
    expect(screen.getByRole("status")).toHaveTextContent("отвечает")
    await user.click(
      screen.getByRole("button", { name: "Остановить генерацию" })
    )
    expect(onStop).toHaveBeenCalledOnce()
    expect(onSend).not.toHaveBeenCalled()
    rerender(
      <ChatConversation
        messages={[assistant("## Частичный **ответ", "error")]}
        error="Соединение прервалось"
        onSend={onSend}
        onStop={onStop}
      />
    )
    expect(screen.getByRole("alert")).toHaveTextContent("Соединение прервалось")
    expect(screen.getByText("Ответ не завершён")).toBeInTheDocument()
    expect(screen.getByLabelText("Ответ AI Buddy")).toHaveTextContent(
      "Частичный"
    )
    expect(screen.getByRole("textbox")).toBeEnabled()
  })

  it("copies the complete raw Markdown and resets the success label", async () => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, "writeText")
    render(
      <ChatConversation
        messages={[assistant("**Ответ**")]}
        onSend={vi.fn()}
        onStop={vi.fn()}
      />
    )
    await user.click(screen.getByRole("button", { name: "Скопировать ответ" }))
    expect(writeText).toHaveBeenCalledWith("**Ответ**")
    expect(
      screen.getByRole("button", { name: "Ответ скопирован" })
    ).toBeInTheDocument()
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1850))
    })
    expect(
      screen.getByRole("button", { name: "Скопировать ответ" })
    ).toBeInTheDocument()
  })

  it("keeps the conversation usable when clipboard access is denied", async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
      new Error("Denied")
    )
    render(
      <ChatConversation
        messages={[assistant("Ответ")]}
        onSend={vi.fn()}
        onStop={vi.fn()}
      />
    )
    await user.click(screen.getByRole("button", { name: "Скопировать ответ" }))
    expect(
      screen.getByRole("button", { name: "Скопировать ответ" })
    ).toBeInTheDocument()
    expect(screen.getByRole("textbox")).toBeEnabled()
  })
})

describe("history pagination viewport", () => {
  it("loads at the top and preserves scroll offset after prepending older messages", () => {
    const onLoadOlder = vi.fn().mockResolvedValue(undefined)
    const recent = [assistant("Новый ответ")]
    const props = {
      onSend: vi.fn(),
      onStop: vi.fn(),
      onLoadOlder,
      hasMore: true,
    }
    const { container, rerender } = render(
      <ChatConversation {...props} messages={recent} />
    )
    const viewport = container.querySelector<HTMLElement>(
      '[data-slot="message-scroller-viewport"]'
    )!
    let height = 1000
    Object.defineProperty(viewport, "scrollHeight", {
      configurable: true,
      get: () => height,
    })
    const firstMessage =
      container.querySelector<HTMLElement>("[data-message-id]")!
    let messageTop = 0
    vi.spyOn(firstMessage, "getBoundingClientRect").mockImplementation(
      () => ({ top: messageTop }) as DOMRect
    )
    viewport.scrollTop = 20
    fireEvent.scroll(viewport)
    expect(onLoadOlder).toHaveBeenCalledOnce()
    rerender(<ChatConversation {...props} messages={recent} isHistoryLoading />)
    fireEvent.scroll(viewport)
    expect(onLoadOlder).toHaveBeenCalledOnce()
    height = 1800
    messageTop = 600
    rerender(
      <ChatConversation
        {...props}
        messages={[
          { ...assistant("Старый ответ"), id: "old" },
          ...recent,
          { ...assistant("Новый фрагмент", "streaming"), id: "stream" },
        ]}
      />
    )
    expect(viewport.scrollTop).toBe(620)
  })
  it("exposes retry and stops automatic loading on errors or exhausted history", () => {
    const onLoadOlder = vi.fn().mockResolvedValue(undefined)
    const props = {
      messages: [assistant("Ответ")],
      onSend: vi.fn(),
      onStop: vi.fn(),
      onLoadOlder,
    }
    const { container, rerender } = render(
      <ChatConversation {...props} hasMore historyError="Ошибка истории" />
    )
    const viewport = container.querySelector<HTMLElement>(
      '[data-slot="message-scroller-viewport"]'
    )!
    fireEvent.scroll(viewport)
    expect(onLoadOlder).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Повторить загрузку" }))
    expect(onLoadOlder).toHaveBeenCalledOnce()
    rerender(<ChatConversation {...props} />)
    fireEvent.scroll(viewport)
    expect(onLoadOlder).toHaveBeenCalledOnce()
  })
})

describe("chat scroll following", () => {
  it("positions an asynchronously loaded first page before paint and resets on remount", () => {
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(1400)
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(400)
    const props = { onSend: vi.fn(), onStop: vi.fn() }
    const { container, rerender } = render(
      <ChatConversation {...props} messages={[]} isHistoryLoading />
    )
    const viewport = () =>
      container.querySelector<HTMLElement>(
        '[data-slot="message-scroller-viewport"]'
      )!
    rerender(
      <ChatConversation {...props} messages={[assistant("Последний ответ")]} />
    )
    expect(viewport().scrollTop).toBe(1000)
    viewport().scrollTop = 100
    fireEvent.scroll(viewport())
    rerender(
      <ChatConversation
        key="another-session"
        {...props}
        messages={[assistant("Другой чат")]}
      />
    )
    expect(viewport().scrollTop).toBe(1000)
  })
  it("follows streaming text and delayed resizing only while near the bottom", () => {
    let height = 1000
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(
      () => height
    )
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(400)
    const observers: {
      callback: ResizeObserverCallback
      targets: Element[]
    }[] = []
    const disconnect = vi.fn()
    vi.stubGlobal(
      "ResizeObserver",
      class {
        entry: (typeof observers)[number]
        constructor(callback: ResizeObserverCallback) {
          this.entry = { callback, targets: [] }
          observers.push(this.entry)
        }
        observe(target: Element) {
          this.entry.targets.push(target)
        }
        unobserve() {}
        disconnect = disconnect
      }
    )
    const props = { onSend: vi.fn(), onStop: vi.fn(), isLoading: true }
    const { container, rerender, unmount } = render(
      <ChatConversation
        {...props}
        messages={[assistant("Один", "streaming")]}
      />
    )
    const viewport = container.querySelector<HTMLElement>(
      '[data-slot="message-scroller-viewport"]'
    )!
    expect(viewport.scrollTop).toBe(600)
    height = 1200
    rerender(
      <ChatConversation
        {...props}
        messages={[assistant("Один два", "streaming")]}
      />
    )
    expect(viewport.scrollTop).toBe(800)
    viewport.scrollTop = 100
    fireEvent.scroll(viewport)
    height = 1400
    rerender(
      <ChatConversation
        {...props}
        messages={[assistant("Один два три", "streaming")]}
      />
    )
    expect(viewport.scrollTop).toBe(100)
    const observer = observers.find(
      (entry) => entry.targets.includes(viewport) && entry.targets.length === 2
    )!
    act(() => observer.callback([], {} as ResizeObserver))
    expect(viewport.scrollTop).toBe(100)
    viewport.scrollTop = 950
    fireEvent.scroll(viewport)
    height = 1600
    act(() => observer.callback([], {} as ResizeObserver))
    expect(viewport.scrollTop).toBe(1200)
    unmount()
    expect(disconnect).toHaveBeenCalled()
  })
  it("scrolls to the outgoing message even when its author was reading older history", () => {
    let height = 1000
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(
      () => height
    )
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(400)
    const props = { onSend: vi.fn(), onStop: vi.fn() }
    const existing = assistant("Ответ")
    const { container, rerender } = render(
      <ChatConversation {...props} messages={[existing]} />
    )
    const viewport = container.querySelector<HTMLElement>(
      '[data-slot="message-scroller-viewport"]'
    )!
    viewport.scrollTop = 100
    fireEvent.scroll(viewport)
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Вопрос" },
    })
    fireEvent.submit(screen.getByRole("textbox").closest("form")!)
    expect(viewport.scrollTop).toBe(600)
    height = 1200
    rerender(
      <ChatConversation
        {...props}
        messages={[
          existing,
          { ...assistant("Вопрос"), id: "new", role: "user" },
        ]}
      />
    )
    expect(viewport.scrollTop).toBe(800)
    expect(props.onSend).toHaveBeenCalledWith("Вопрос")
  })
})
