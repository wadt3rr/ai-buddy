import {
  ApiError,
  apiUrl,
  isRecord,
  notifyUnauthorized,
  toApiError,
} from "./client"
import { readChatStream } from "./sse"
import type { ChatRequest, ChatStreamEvent } from "@/types/chat"

export async function streamChat(
  request: ChatRequest,
  signal: AbortSignal,
  onEvent: (event: ChatStreamEvent) => void
): Promise<void> {
  try {
    const response = await fetch(apiUrl("/chat/stream"), {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify(request),
      signal,
    })
    if (!response.ok) {
      if (response.status === 401) {
        notifyUnauthorized()
        throw new ApiError("Сессия завершена. Войди в аккаунт ещё раз.", 401)
      }
      let data: unknown
      try {
        data = await response.json()
      } catch {
        /* The error body may be empty. */
      }
      throw new ApiError(
        response.status >= 500
          ? "Сервер временно недоступен. Попробуй позже."
          : isRecord(data) && typeof data.message === "string"
            ? data.message
            : "Не удалось отправить сообщение.",
        response.status
      )
    }
    if (
      !response.headers
        .get("content-type")
        ?.toLowerCase()
        .includes("text/event-stream")
    ) {
      throw new ApiError("Сервер вернул неподдерживаемый формат ответа.")
    }
    if (!response.body) throw new ApiError("Сервер вернул пустой ответ.")
    let receivedText = false
    await readChatStream(
      response.body,
      (event) => {
        if (event.type === "delta" && event.content) receivedText = true
        onEvent(event)
      },
      signal
    )
    if (!receivedText)
      throw new ApiError("Сервер вернул пустой ответ. Попробуй ещё раз.")
  } catch (error) {
    if (signal.aborted) throw error
    throw toApiError(error)
  }
}
