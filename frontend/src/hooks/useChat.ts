import { useCallback, useEffect, useRef, useState } from "react"
import {
  AssistantUnavailableError,
  listMessages,
  sendChatMessage,
} from "@/api/chat.api"
import { toApiError } from "@/api/client"
import type { ChatMessage, Message } from "@/types/chat"
const displayMessage = ({ created_at, ...message }: Message): ChatMessage => ({
  ...message,
  createdAt: created_at,
  status: "completed",
})
function merge(older: ChatMessage[], newer: ChatMessage[]) {
  const ids = new Set(newer.map((message) => message.id))
  const uniqueOlder = older.filter((message) => {
    if (ids.has(message.id)) return false
    ids.add(message.id)
    return true
  })
  return [...uniqueOlder, ...newer]
}
export function useChat(sessionKey = "current") {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [isHistoryLoading, setHistoryLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const cursor = useRef<string | null>(null)
  const initialized = useRef(false)
  const history = useRef<AbortController | null>(null)
  const active = useRef<AbortController | null>(null)
  const version = useRef(0)
  const loadOlder = useCallback(async () => {
    if (history.current || (initialized.current && !cursor.current)) return
    const controller = new AbortController()
    const requestVersion = version.current
    const before = cursor.current
    history.current = controller
    setHistoryLoading(true)
    setHistoryError(null)
    try {
      const page = await listMessages(before ?? undefined, controller.signal)
      if (controller.signal.aborted || version.current !== requestVersion)
        return
      setMessages((current) =>
        merge(page.messages.map(displayMessage), current)
      )
      cursor.current = page.next_before
      initialized.current = true
      setHasMore(page.next_before !== null)
    } catch (cause) {
      if (!controller.signal.aborted && version.current === requestVersion)
        setHistoryError(toApiError(cause).message)
    } finally {
      if (history.current === controller) {
        history.current = null
        setHistoryLoading(false)
      }
    }
  }, [])
  useEffect(() => {
    const sessionVersion = ++version.current
    queueMicrotask(() => {
      if (version.current !== sessionVersion) return
      cursor.current = null
      initialized.current = false
      setMessages([])
      setHasMore(false)
      setError(null)
      setIsStreaming(false)
      void loadOlder()
    })
    return () => {
      version.current = sessionVersion + 1
      history.current?.abort()
      history.current = null
      active.current?.abort()
      active.current = null
    }
  }, [sessionKey, loadOlder])
  const stopGeneration = useCallback(() => {
    active.current?.abort()
  }, [])
  const sendMessage = useCallback(async (text: string) => {
    const content = text.trim()
    if (!content || active.current || !initialized.current) return
    if (new TextEncoder().encode(content).length > 10000) {
      setError("Сообщение должно занимать не более 10000 байт UTF-8.")
      return
    }
    const controller = new AbortController()
    const requestVersion = version.current
    active.current = controller
    const userId = crypto.randomUUID()
    const assistantId = crypto.randomUUID()
    const createdAt = new Date().toISOString()
    setMessages((current) => [
      ...current,
      { id: userId, role: "user", content, createdAt, status: "completed" },
      {
        id: assistantId,
        role: "assistant",
        content: "",
        createdAt,
        status: "streaming",
      },
    ])
    setIsStreaming(true)
    setError(null)
    const replacePending = (saved: Message[]) => {
      setMessages((current) =>
        merge(
          current.filter(
            (message) => message.id !== userId && message.id !== assistantId
          ),
          saved.map(displayMessage)
        )
      )
    }
    try {
      const response = await sendChatMessage(content, controller.signal)
      if (version.current === requestVersion)
        replacePending([response.user_message, response.assistant_message])
    } catch (cause) {
      if (version.current !== requestVersion) return
      if (cause instanceof AssistantUnavailableError) {
        replacePending([cause.userMessage])
        setError(cause.message)
      } else {
        replacePending([])
        setError(
          controller.signal.aborted
            ? "Ожидание ответа отменено. Проверяем сохранённые сообщения."
            : toApiError(cause).message
        )
        // An HTTP failure may follow a committed server write.
        try {
          const page = await listMessages()
          if (version.current === requestVersion)
            setMessages((current) =>
              merge(current, page.messages.map(displayMessage))
            )
        } catch {
          /* Preserve the send error. */
        }
      }
    } finally {
      if (active.current === controller) {
        active.current = null
        setIsStreaming(false)
      }
    }
  }, [])
  return {
    messages,
    sendMessage,
    stopGeneration,
    isStreaming,
    error,
    historyError,
    isHistoryLoading,
    hasMore,
    loadOlder,
  }
}
