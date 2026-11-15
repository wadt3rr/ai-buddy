import { act, renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { http, HttpResponse } from "msw"
import { apiUrl } from "@/api/client"
import { DEMO_COOKIE } from "@/mocks/handlers"
import { server } from "@/test/server"
import { useChat } from "./useChat"

function authenticate() {
  document.cookie = `${DEMO_COOKIE}=active; Path=/`
}

describe("useChat with the mock API", () => {
  it("adds user immediately and progressively appends chunks to one assistant message", async () => {
    authenticate()
    const { result } = renderHook(useChat)
    let pending: Promise<void> = Promise.resolve()
    act(() => {
      pending = result.current.sendMessage("Как познакомиться с командой?")
    })
    expect(result.current.messages).toHaveLength(2)
    expect(result.current.messages[0]).toMatchObject({
      role: "user",
      content: "Как познакомиться с командой?",
    })
    expect(result.current.messages[1]).toMatchObject({
      role: "assistant",
      content: "",
      status: "streaming",
    })
    const id = result.current.messages[1].id
    await waitFor(
      () =>
        expect(result.current.messages[1].content.length).toBeGreaterThan(0),
      { interval: 10 }
    )
    const firstText = result.current.messages[1].content
    expect(result.current.isStreaming).toBe(true)
    expect(result.current.timeToFirstChunkMs).toBeGreaterThan(0)
    expect(result.current.timeToFirstChunkMs).toBeLessThan(1000)
    await waitFor(
      () =>
        expect(result.current.messages[1].content.length).toBeGreaterThan(
          firstText.length
        ),
      { interval: 10 }
    )
    await act(async () => {
      await pending
    })
    expect(result.current.messages).toHaveLength(2)
    expect(result.current.messages[1]).toMatchObject({
      id,
      status: "completed",
    })
    expect(result.current.messages[1].content).toContain(firstText)
    expect(result.current.isStreaming).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it("ignores empty messages and concurrent sends", async () => {
    authenticate()
    const { result } = renderHook(useChat)
    await act(async () => {
      await result.current.sendMessage("   ")
    })
    expect(result.current.messages).toEqual([])
    let first: Promise<void> = Promise.resolve()
    act(() => {
      first = result.current.sendMessage("Первый день")
      void result.current.sendMessage("Дубликат")
    })
    expect(result.current.messages).toHaveLength(2)
    act(() => result.current.stopGeneration())
    await act(async () => {
      await first
    })
  })

  it("keeps received text on cancellation and can immediately start another generation", async () => {
    authenticate()
    const { result } = renderHook(useChat)
    let first: Promise<void> = Promise.resolve()
    act(() => {
      first = result.current.sendMessage("Первый день")
    })
    await waitFor(
      () => expect(result.current.messages[1].content).not.toBe(""),
      { interval: 10 }
    )
    const received = result.current.messages[1].content
    act(() => result.current.stopGeneration())
    expect(result.current.isStreaming).toBe(false)
    expect(result.current.messages[1]).toMatchObject({
      content: received,
      status: "completed",
    })
    expect(result.current.error).toBeNull()
    let second: Promise<void> = Promise.resolve()
    act(() => {
      second = result.current.sendMessage("К кому обращаться за помощью?")
    })
    await act(async () => {
      await first
    })
    expect(result.current.isStreaming).toBe(true)
    await act(async () => {
      await second
    })
    expect(result.current.messages).toHaveLength(4)
    expect(result.current.messages[1].content).toBe(received)
    expect(result.current.messages[3].status).toBe("completed")
  })

  it("retains partial text when the server sends an error event", async () => {
    authenticate()
    const { result } = renderHook(useChat)
    await act(async () => {
      await result.current.sendMessage("/mock:error-mid")
    })
    expect(result.current.messages).toHaveLength(2)
    expect(result.current.messages[1].content.length).toBeGreaterThan(0)
    expect(result.current.messages[1].status).toBe("error")
    expect(result.current.error).toContain("Полученный текст сохранён")
    expect(result.current.isStreaming).toBe(false)
  })

  it.each([
    ["/mock:error-before", "Сервер временно недоступен"],
    ["/mock:empty", "пустой ответ"],
  ])("handles %s", async (message, expected) => {
    authenticate()
    const { result } = renderHook(useChat)
    await act(async () => {
      await result.current.sendMessage(message)
    })
    expect(result.current.error).toContain(expected)
    expect(result.current.messages[1]).toMatchObject({
      status: "error",
      content: "",
    })
    expect(result.current.isStreaming).toBe(false)
  })

  it("handles HTTP 401 and network errors", async () => {
    const { result } = renderHook(useChat)
    await act(async () => {
      await result.current.sendMessage("Привет")
    })
    expect(result.current.error).toContain("Сессия завершена")
    server.use(http.post(apiUrl("/chat/stream"), () => HttpResponse.error()))
    await act(async () => {
      await result.current.sendMessage("Ещё раз")
    })
    expect(result.current.error).toContain("подключение")
  })

  it.each([
    ["event: delta\ndata: broken\n\n", "некорректные данные"],
    ["", "Соединение прервалось"],
  ])(
    "retains the received prefix on malformed data or premature EOF",
    async (ending, expected) => {
      server.use(
        http.post(
          apiUrl("/chat/stream"),
          () =>
            new HttpResponse(
              'event: delta\ndata: {"content":"Сохранённый текст"}\n\n' +
                ending,
              { headers: { "Content-Type": "text/event-stream" } }
            )
        )
      )
      const { result } = renderHook(useChat)
      await act(async () => {
        await result.current.sendMessage("Привет")
      })
      expect(result.current.messages[1]).toMatchObject({
        content: "Сохранённый текст",
        status: "error",
      })
      expect(result.current.error).toContain(expected)
    }
  )

  it("rejects an unexpected response format", async () => {
    server.use(
      http.post(apiUrl("/chat/stream"), () =>
        HttpResponse.json({ content: "not SSE" })
      )
    )
    const { result } = renderHook(useChat)
    await act(async () => {
      await result.current.sendMessage("Привет")
    })
    expect(result.current.error).toContain("неподдерживаемый формат")
  })

  it("aborts the active request on unmount", async () => {
    authenticate()
    const actualFetch = globalThis.fetch
    let requestSignal: AbortSignal | null | undefined
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>((input, init) => {
        requestSignal = init?.signal
        return actualFetch(input, init)
      })
    )
    const { result, unmount } = renderHook(useChat)
    let pending: Promise<void> = Promise.resolve()
    act(() => {
      pending = result.current.sendMessage("Привет")
    })
    expect(requestSignal?.aborted).toBe(false)
    unmount()
    await pending
    expect(requestSignal?.aborted).toBe(true)
  })
})
