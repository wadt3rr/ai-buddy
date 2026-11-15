import { describe, expect, it, vi } from "vitest"
import { createSseParser, readChatStream } from "@/test/sse"
import type { ChatStreamEvent } from "@/test/sse"

const encode = (text: string) => new TextEncoder().encode(text)
function body(chunks: Uint8Array[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(chunk))
      controller.close()
    },
  })
}

describe("SSE reader", () => {
  it("decodes Cyrillic and emoji split at every UTF-8 byte, including CRLF boundaries", async () => {
    const text =
      ': heartbeat\r\nevent: delta\r\ndata: {"content":"Привет 👋"}\r\n\r\nevent: done\r\ndata: {}\r\n\r\n'
    const events: ChatStreamEvent[] = []
    await readChatStream(
      body(Array.from(encode(text), (byte) => new Uint8Array([byte]))),
      (event) => events.push(event),
      new AbortController().signal
    )
    expect(events).toEqual([
      { type: "delta", content: "Привет 👋" },
      { type: "done" },
    ])
  })

  it("handles combined events, multiline data, comments, unknown fields and events", async () => {
    const events: ChatStreamEvent[] = []
    const text =
      'event: ping\ndata: ignored\n\nid: 7\nevent: delta\ndata: {\ndata: "content": "Один"}\n\nevent: delta\ndata: {"content":" два"}\n\nevent: done\ndata: {}\n\nevent: delta\ndata: {"content":"ignored"}\n\n'
    await readChatStream(
      body([encode(text)]),
      (event) => events.push(event),
      new AbortController().signal
    )
    expect(events).toEqual([
      { type: "delta", content: "Один" },
      { type: "delta", content: " два" },
      { type: "done" },
    ])
  })

  it("flushes a final done event without a trailing newline", async () => {
    const callback = vi.fn()
    await readChatStream(
      body([encode("event: done\rdata: {}")]),
      callback,
      new AbortController().signal
    )
    expect(callback).toHaveBeenCalledWith({ type: "done" })
  })

  it.each([
    ["event: delta\ndata: broken\n\n", "некорректные данные"],
    ["event: delta\ndata: {}\n\n", "отсутствует текст"],
    ["event: delta\ndata: null\n\n", "формат события"],
    ['event: error\ndata: {"message":"Сбой генерации"}\n\n', "Сбой генерации"],
    ['event: delta\ndata: {"content":"часть"}\n\n', "Соединение прервалось"],
    ["", "Соединение прервалось"],
  ])("rejects invalid or incomplete stream: %s", async (text, message) => {
    await expect(
      readChatStream(
        body([encode(text)]),
        vi.fn(),
        new AbortController().signal
      )
    ).rejects.toThrow(message)
  })

  it("rejects invalid UTF-8 and excessive event sizes", async () => {
    await expect(
      readChatStream(
        body([new Uint8Array([0xff])]),
        vi.fn(),
        new AbortController().signal
      )
    ).rejects.toThrow("UTF-8")
    const parser = createSseParser(vi.fn())
    expect(() => parser.feed("x".repeat(1_048_577))).toThrow("Слишком большое")
  })

  it("cancels a pending read and releases the stream lock", async () => {
    const cancel = vi.fn()
    const stream = new ReadableStream<Uint8Array>({ cancel })
    const controller = new AbortController()
    const promise = readChatStream(stream, vi.fn(), controller.signal)
    controller.abort()
    await expect(promise).rejects.toMatchObject({ name: "AbortError" })
    expect(cancel).toHaveBeenCalledOnce()
    expect(stream.locked).toBe(false)
  })
})
