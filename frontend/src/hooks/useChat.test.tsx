import { act, renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { delay, http, HttpResponse } from "msw"
import { apiUrl } from "@/api/client"
import { server } from "@/test/server"
import { useChat } from "./useChat"
const msg = (id: string, role = "user") => ({
  id,
  role,
  content: id,
  created_at: "2026-11-15T10:00:00Z",
})
async function ready(result: { current: ReturnType<typeof useChat> }) {
  await waitFor(() => expect(result.current.isHistoryLoading).toBe(false))
}
function pages() {
  const requests: (string | null)[] = []
  server.use(
    http.get(apiUrl("/messages"), async ({ request }) => {
      const url = new URL(request.url)
      expect(url.searchParams.get("limit")).toBe("50")
      const before = url.searchParams.get("before")
      requests.push(before)
      await delay(10)
      return HttpResponse.json(
        before
          ? { messages: [msg("1"), msg("2"), msg("3")], next_before: null }
          : { messages: [msg("3"), msg("4")], next_before: "3" }
      )
    })
  )
  return requests
}
describe("useChat backend history and sending", () => {
  it("loads only the first page on mount", async () => {
    const requests = pages()
    const { result } = renderHook(() => useChat())
    await ready(result)
    expect(result.current.messages.map((m) => m.id)).toEqual(["3", "4"])
    expect(result.current.hasMore).toBe(true)
    expect(requests).toEqual([null])
  })
  it("prepends older pages in server order, deduplicates and ends pagination", async () => {
    const requests = pages()
    const { result } = renderHook(() => useChat())
    await ready(result)
    await act(async () => {
      await result.current.loadOlder()
    })
    expect(result.current.messages.map((m) => m.id)).toEqual([
      "1",
      "2",
      "3",
      "4",
    ])
    expect(result.current.hasMore).toBe(false)
    await act(async () => {
      await result.current.loadOlder()
    })
    expect(requests).toEqual([null, "3"])
  })
  it("coalesces simultaneous pagination requests", async () => {
    const requests = pages()
    const { result } = renderHook(() => useChat())
    await ready(result)
    await act(async () => {
      await Promise.all([
        result.current.loadOlder(),
        result.current.loadOlder(),
      ])
    })
    expect(requests).toEqual([null, "3"])
  })
  it("retries an initial history error", async () => {
    server.use(
      http.get(
        apiUrl("/messages"),
        () => new HttpResponse(null, { status: 500 })
      )
    )
    const { result } = renderHook(() => useChat())
    await ready(result)
    expect(result.current.historyError).toContain("Сервер временно недоступен")
    server.resetHandlers()
    await act(async () => {
      await result.current.loadOlder()
    })
    expect(result.current.historyError).toBeNull()
    expect(result.current.messages).toEqual([])
  })
  it("keeps its cursor after a page error and retries the same page", async () => {
    pages()
    const { result } = renderHook(() => useChat())
    await ready(result)
    server.use(http.get(apiUrl("/messages"), () => HttpResponse.error()))
    await act(async () => {
      await result.current.loadOlder()
    })
    expect(result.current.messages).toHaveLength(2)
    expect(result.current.hasMore).toBe(true)
    expect(result.current.historyError).toContain("подключение")
    const requests = pages()
    await act(async () => {
      await result.current.loadOlder()
    })
    expect(requests).toEqual(["3"])
  })
  it("resets account history and ignores late responses from the previous session", async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let started = false
    server.use(
      http.get(apiUrl("/messages"), async () => {
        started = true
        await gate
        return HttpResponse.json({
          messages: [msg("old-account")],
          next_before: "old",
        })
      })
    )
    const { result, rerender } = renderHook(({ account }) => useChat(account), {
      initialProps: { account: "a" },
    })
    await waitFor(() => expect(started).toBe(true))
    server.use(
      http.get(apiUrl("/messages"), () =>
        HttpResponse.json({ messages: [msg("new-account")], next_before: null })
      )
    )
    rerender({ account: "b" })
    await ready(result)
    await act(async () => {
      release()
      await delay(20)
    })
    expect(result.current.messages.map((m) => m.id)).toEqual(["new-account"])
    expect(result.current.hasMore).toBe(false)
  })
  it("combines concurrent history loading and a JSON assistant response", async () => {
    pages()
    const { result } = renderHook(() => useChat())
    await ready(result)
    await act(async () => {
      await Promise.all([
        result.current.loadOlder(),
        result.current.sendMessage("Вопрос"),
      ])
    })
    expect(result.current.messages.slice(0, 4).map((m) => m.id)).toEqual([
      "1",
      "2",
      "3",
      "4",
    ])
    expect(result.current.messages.slice(4).map((m) => m.content)).toEqual([
      "Вопрос",
      "Ответ сервера",
    ])
    expect(result.current.isStreaming).toBe(false)
  })
  it("ignores empty and concurrent sends and validates UTF-8 byte size", async () => {
    const { result } = renderHook(() => useChat())
    await ready(result)
    await act(async () => {
      await result.current.sendMessage(" ")
      await result.current.sendMessage("я".repeat(5001))
    })
    expect(result.current.messages).toHaveLength(0)
    expect(result.current.error).toContain("10000 байт")
    await act(async () => {
      await Promise.all([
        result.current.sendMessage("Вопрос"),
        result.current.sendMessage("Вопрос"),
      ])
    })
    expect(result.current.messages).toHaveLength(2)
    expect(result.current.error).toBeNull()
  })
  it("preserves the saved user message on 502 and allows a following question", async () => {
    const { result } = renderHook(() => useChat())
    await ready(result)
    server.use(
      http.post(apiUrl("/messages"), () =>
        HttpResponse.json(
          {
            user_message: msg("saved"),
            error: { code: "assistant_unavailable", message: "Failed" },
          },
          { status: 502 }
        )
      )
    )
    await act(async () => {
      await result.current.sendMessage("Вопрос")
    })
    expect(result.current.messages.map((m) => m.id)).toEqual(["saved"])
    expect(result.current.error).toContain("Сообщение сохранено")
    server.resetHandlers()
    await act(async () => {
      await result.current.sendMessage("Следующий")
    })
    expect(result.current.messages).toHaveLength(3)
  })
  it("cancels waiting, reconciles server history and can send again", async () => {
    const { result } = renderHook(() => useChat())
    await ready(result)
    server.use(
      http.post(apiUrl("/messages"), async () => {
        await delay(100)
        return new HttpResponse(null, { status: 500 })
      })
    )
    let pending!: Promise<void>
    act(() => {
      pending = result.current.sendMessage("Вопрос")
    })
    expect(result.current.isStreaming).toBe(true)
    act(() => result.current.stopGeneration())
    await act(async () => {
      await pending
    })
    expect(result.current.isStreaming).toBe(false)
    expect(result.current.error).toContain("отменено")
    expect(result.current.messages).toHaveLength(0)
    server.resetHandlers()
    await act(async () => {
      await result.current.sendMessage("Вопрос")
    })
    expect(result.current.messages).toHaveLength(2)
  })
  it.each([401, 500])(
    "handles send HTTP %i and retains history if reconciliation fails",
    async (status) => {
      const { result } = renderHook(() => useChat())
      await ready(result)
      server.use(
        http.post(
          apiUrl("/messages"),
          () => new HttpResponse(null, { status })
        ),
        http.get(apiUrl("/messages"), () => HttpResponse.error())
      )
      await act(async () => {
        await result.current.sendMessage("Вопрос")
      })
      expect(result.current.error).toBeTruthy()
      expect(result.current.messages).toEqual([])
    }
  )
  it("aborts pending work on unmount", async () => {
    const { result, unmount } = renderHook(() => useChat())
    await ready(result)
    let signal: AbortSignal | undefined
    const { client } = await import("@/api/client")
    const post = vi
      .spyOn(client, "post")
      .mockImplementation((_url, _body, config) => {
        signal = config?.signal as AbortSignal
        return new Promise((_resolve, reject) =>
          signal!.addEventListener("abort", () => reject(new Error("aborted")))
        )
      })
    let pending!: Promise<void>
    act(() => {
      pending = result.current.sendMessage("Вопрос")
    })
    unmount()
    await pending
    expect(signal?.aborted).toBe(true)
    post.mockRestore()
  })
})
