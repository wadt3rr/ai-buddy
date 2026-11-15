import { useCallback, useEffect, useRef, useState } from "react"
import { streamChat } from "@/api/chat.api"
import { toApiError } from "@/api/client"
import type { ChatMessage } from "@/types/chat"

type ActiveGeneration = { controller: AbortController; assistantId: string }

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [timeToFirstChunkMs, setTimeToFirstChunkMs] = useState<number | null>(
    null
  )
  const active = useRef<ActiveGeneration | null>(null)

  const updateMessage = useCallback(
    (id: string, update: (message: ChatMessage) => ChatMessage) => {
      setMessages((current) =>
        current.map((message) =>
          message.id === id ? update(message) : message
        )
      )
    },
    []
  )

  const stopGeneration = useCallback(() => {
    const generation = active.current
    if (!generation) return
    active.current = null
    generation.controller.abort()
    updateMessage(generation.assistantId, (message) => ({
      ...message,
      status: "completed",
    }))
    setIsStreaming(false)
  }, [updateMessage])

  useEffect(
    () => () => {
      const generation = active.current
      active.current = null
      generation?.controller.abort()
    },
    []
  )

  const sendMessage = useCallback(
    async (text: string): Promise<void> => {
      const content = text.trim()
      // A ref also blocks two sends in the same React render tick.
      if (!content || active.current) return
      const userId = crypto.randomUUID()
      const assistantId = crypto.randomUUID()
      const createdAt = new Date().toISOString()
      const generation: ActiveGeneration = {
        controller: new AbortController(),
        assistantId,
      }
      active.current = generation
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
      setError(null)
      setTimeToFirstChunkMs(null)
      setIsStreaming(true)
      const startedAt = performance.now()
      let receivedFirstChunk = false
      try {
        await streamChat(
          { message: content },
          generation.controller.signal,
          (event) => {
            if (
              active.current !== generation ||
              generation.controller.signal.aborted
            )
              return
            if (event.type === "delta") {
              if (event.content && !receivedFirstChunk) {
                receivedFirstChunk = true
                setTimeToFirstChunkMs(performance.now() - startedAt)
              }
              updateMessage(assistantId, (message) => ({
                ...message,
                content: message.content + event.content,
              }))
            }
          }
        )
        if (active.current === generation) {
          updateMessage(assistantId, (message) => ({
            ...message,
            status: "completed",
          }))
        }
      } catch (cause) {
        if (
          active.current === generation &&
          !generation.controller.signal.aborted
        ) {
          setError(toApiError(cause).message)
          updateMessage(assistantId, (message) => ({
            ...message,
            status: "error",
          }))
        }
      } finally {
        // An old cancelled request must not reset a newer request's state.
        if (active.current === generation) {
          active.current = null
          setIsStreaming(false)
        }
      }
    },
    [updateMessage]
  )

  return {
    messages,
    sendMessage,
    stopGeneration,
    isStreaming,
    error,
    timeToFirstChunkMs,
  }
}
