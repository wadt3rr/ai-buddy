import axios from "axios"
import { ApiError, client, isRecord, toApiError } from "./client"
import type {
  Message,
  MessageListResponse,
  SendMessageResponse,
} from "@/types/chat"

export function readMessage(data: unknown): Message {
  if (
    !isRecord(data) ||
    typeof data.id !== "string" ||
    !["user", "assistant"].includes(String(data.role)) ||
    typeof data.content !== "string" ||
    typeof data.created_at !== "string" ||
    !Number.isFinite(Date.parse(data.created_at))
  ) {
    throw new ApiError("Сервер вернул некорректное сообщение.")
  }
  return data as Message
}
export async function listMessages(
  before?: string,
  signal?: AbortSignal
): Promise<MessageListResponse> {
  try {
    const { data } = await client.get<unknown>("/messages", {
      params: { limit: 50, before },
      signal,
    })
    if (
      !isRecord(data) ||
      !Array.isArray(data.messages) ||
      !(data.next_before === null || typeof data.next_before === "string")
    ) {
      throw new ApiError("Сервер вернул некорректную историю сообщений.")
    }
    return {
      messages: data.messages.map(readMessage),
      next_before: data.next_before,
    }
  } catch (error) {
    throw toApiError(error)
  }
}
export class AssistantUnavailableError extends ApiError {
  readonly userMessage: Message
  constructor(userMessage: Message) {
    super(
      "Сообщение сохранено, но AI не смог ответить. Можно отправить следующий вопрос.",
      502
    )
    this.userMessage = userMessage
  }
}
export async function sendChatMessage(
  content: string,
  signal?: AbortSignal
): Promise<SendMessageResponse> {
  try {
    const { data } = await client.post<unknown>(
      "/messages",
      { content },
      { signal, timeout: 0 }
    )
    if (!isRecord(data)) throw new ApiError("Сервер вернул некорректный ответ.")
    return {
      user_message: readMessage(data.user_message),
      assistant_message: readMessage(data.assistant_message),
    }
  } catch (error) {
    if (
      axios.isAxiosError(error) &&
      error.response?.status === 502 &&
      isRecord(error.response.data) &&
      error.response.data.user_message
    ) {
      throw new AssistantUnavailableError(
        readMessage(error.response.data.user_message)
      )
    }
    throw toApiError(error)
  }
}
