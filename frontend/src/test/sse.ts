import { ApiError, isRecord } from "@/api/client"
export type ChatStreamEvent =
  { type: "delta"; content: string } | { type: "done" }

/** Incremental SSE framing, independent of network and UTF-8 chunk boundaries. */
export function createSseParser(onEvent: (event: ChatStreamEvent) => void) {
  let buffer = ""
  let event = ""
  let data: string[] = []
  let eventSize = 0
  let completed = false

  const dispatch = () => {
    const kind = event
    const payload = data.join("\n")
    event = ""
    data = []
    eventSize = 0
    if (!payload || completed || !["delta", "done", "error"].includes(kind))
      return

    let parsed: unknown
    try {
      parsed = JSON.parse(payload)
    } catch {
      throw new ApiError("Сервер прислал некорректные данные потока.")
    }
    if (!isRecord(parsed))
      throw new ApiError("Некорректный формат события потока.")
    if (kind === "error") {
      throw new ApiError(
        typeof parsed.message === "string"
          ? parsed.message
          : "Генерация прервана сервером. Попробуй ещё раз."
      )
    }
    if (kind === "done") {
      completed = true
      onEvent({ type: "done" })
    } else {
      if (typeof parsed.content !== "string")
        throw new ApiError("В событии потока отсутствует текст ответа.")
      onEvent({ type: "delta", content: parsed.content })
    }
  }

  const line = (value: string) => {
    if (value === "") return dispatch()
    if (value.startsWith(":")) return
    const colon = value.indexOf(":")
    const field = colon === -1 ? value : value.slice(0, colon)
    let content = colon === -1 ? "" : value.slice(colon + 1)
    if (content.startsWith(" ")) content = content.slice(1)
    if (field === "event") event = content
    if (field === "data") data.push(content)
    eventSize += value.length
    if (eventSize > 1_048_576)
      throw new ApiError("Слишком большое событие потока.")
  }

  return {
    get completed() {
      return completed
    },
    feed(text: string, final = false) {
      if (completed) return
      buffer += text
      let position = 0
      for (let index = 0; index < buffer.length; index++) {
        const char = buffer[index]
        if (char !== "\n" && char !== "\r") continue
        if (char === "\r" && index === buffer.length - 1 && !final) break
        line(buffer.slice(position, index))
        if (char === "\r" && buffer[index + 1] === "\n") index++
        position = index + 1
        if (completed) break
      }
      buffer = buffer.slice(position)
      if (buffer.length + eventSize > 1_048_576)
        throw new ApiError("Слишком большое событие потока.")
      if (final && !completed) {
        if (buffer) line(buffer)
        buffer = ""
        dispatch()
      }
    },
  }
}

export async function readChatStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: ChatStreamEvent) => void,
  signal: AbortSignal
) {
  const reader = body.getReader()
  const decoder = new TextDecoder("utf-8", { fatal: true })
  const parser = createSseParser(onEvent)
  const cancel = () => {
    void reader.cancel().catch(() => undefined)
  }
  signal.addEventListener("abort", cancel, { once: true })
  try {
    signal.throwIfAborted()
    while (!parser.completed) {
      const { value, done } = await reader.read()
      signal.throwIfAborted()
      try {
        parser.feed(
          done ? decoder.decode() : decoder.decode(value, { stream: true }),
          done
        )
      } catch (error) {
        if (error instanceof TypeError)
          throw new ApiError("Сервер прислал некорректный UTF-8 текст.")
        throw error
      }
      if (done) break
    }
    if (!parser.completed)
      throw new ApiError(
        "Соединение прервалось до завершения ответа. Полученный текст сохранён."
      )
  } finally {
    signal.removeEventListener("abort", cancel)
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}
