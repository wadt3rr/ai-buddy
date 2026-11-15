import { useState, type FormEvent, type KeyboardEvent } from "react"
import { ArrowUp, Check, Copy, Square } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Message, MessageContent, MessageFooter } from "@/components/ui/message"

import { Marker, MarkerContent } from "@/components/ui/marker"

import {
  InputGroup,
  InputGroupAddon,
  InputGroupTextarea,
} from "@/components/ui/input-group"

import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { ChatMessage } from "@/types/chat"

type ChatConversationProps = {
  messages: ChatMessage[]
  isLoading?: boolean
  error?: string | null
  onStop: () => void
  onSend: (message: string) => void | Promise<void>
}

const formatTime = (date: string) => {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date))
}

export function ChatConversation({
  messages,
  isLoading = false,
  error,
  onStop,
  onSend,
}: ChatConversationProps) {
  const [message, setMessage] = useState("")
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const canSend = message.trim().length > 0 && !isLoading

  const handleSubmit = (event?: FormEvent) => {
    event?.preventDefault()

    if (!canSend) return

    const text = message.trim()

    setMessage("")
    void onSend(text)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault()
      handleSubmit()
    }
  }

  const handleCopy = async (item: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(item.content)

      setCopiedId(item.id)

      window.setTimeout(() => {
        setCopiedId((current) => (current === item.id ? null : current))
      }, 1800)
    } catch {
      // Clipboard может быть недоступен
    }
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-background">
      {/* История сообщений */}
      <MessageScrollerProvider>
        <MessageScroller className="relative flex min-h-0 flex-1 flex-col">
          <MessageScrollerViewport className="min-h-0 flex-1 mask-none! [-webkit-mask-image:none]!">
            <MessageScrollerContent className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-end gap-7 px-5 pt-28 pb-6">
              {messages.map((item) => {
                const isUser = item.role === "user"

                if (isUser) {
                  return (
                    <Message key={item.id} align="end">
                      <MessageContent>
                        <Bubble>
                          <BubbleContent className="bg-avito-purple-light! wrap-break-word whitespace-pre-wrap text-black!">
                            {item.content}
                          </BubbleContent>
                        </Bubble>

                        <MessageFooter className="mt-1 text-xs text-muted-foreground">
                          {formatTime(item.createdAt)}
                        </MessageFooter>
                      </MessageContent>
                    </Message>
                  )
                }

                return (
                  <Message
                    key={item.id}
                    aria-label="Ответ AI Buddy"
                    aria-busy={item.status === "streaming"}
                  >
                    <MessageContent className="min-w-0 flex-1">
                      {/* Ответ ассистента */}
                      <Bubble variant="muted">
                        <BubbleContent>
                          <div className="prose prose-sm max-w-none overflow-x-auto prose-neutral dark:prose-invert">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {item.content}
                            </ReactMarkdown>
                          </div>
                        </BubbleContent>
                      </Bubble>

                      {/* Время и копирование */}
                      <MessageFooter className="mt-1 flex items-center gap-2">
                        {item.status === "error" && (
                          <span className="text-destructive">
                            Ответ не завершён
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {formatTime(item.createdAt)}
                        </span>

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => void handleCopy(item)}
                          aria-label={
                            copiedId === item.id
                              ? "Ответ скопирован"
                              : "Скопировать ответ"
                          }
                          className="size-7 rounded-none text-muted-foreground hover:text-foreground"
                        >
                          {copiedId === item.id ? (
                            <Check className="size-3.5" />
                          ) : (
                            <Copy className="size-3.5" />
                          )}
                        </Button>
                      </MessageFooter>
                    </MessageContent>
                  </Message>
                )
              })}
              {/* AI готовит ответ */}
              {isLoading && !messages.at(-1)?.content && (
                <Marker role="status">
                  <MarkerContent className="shimmer">
                    <span className="font-medium">AI-buddy</span> думает...
                  </MarkerContent>
                </Marker>
              )}
            </MessageScrollerContent>
          </MessageScrollerViewport>

          <MessageScrollerButton className="absolute right-5 bottom-5 z-10" />
        </MessageScroller>
      </MessageScrollerProvider>

      {/* Поле ввода */}
      <div className="z-10 shrink-0 px-5 pb-5 sm:pb-7">
        <div className="mx-auto w-full max-w-3xl">
          {error && (
            <p role="alert" className="mb-3 text-sm text-destructive">
              {error}
            </p>
          )}
          {isLoading && messages.at(-1)?.content && (
            <p role="status" className="mb-2 text-xs text-muted-foreground">
              AI Buddy отвечает…
            </p>
          )}
          <form onSubmit={handleSubmit}>
            <InputGroup>
              <InputGroupTextarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="О чём хочешь узнать?"
                aria-label="Сообщение для AI Buddy"
                disabled={isLoading}
                className="max-h-30 min-h-20 resize-none scrollbar-none overflow-y-auto p-4 [&::-webkit-scrollbar]:hidden"
              />

              <InputGroupAddon align="block-end" className="px-3 pb-3">
                <Button
                  type={isLoading ? "button" : "submit"}
                  onClick={isLoading ? onStop : undefined}
                  variant="default"
                  size="icon"
                  disabled={!isLoading && !canSend}
                  aria-label={
                    isLoading ? "Остановить генерацию" : "Отправить сообщение"
                  }
                  className="ml-auto"
                >
                  {isLoading ? (
                    <Square className="size-4" />
                  ) : (
                    <ArrowUp className="size-4" />
                  )}
                </Button>
              </InputGroupAddon>
            </InputGroup>
          </form>
        </div>
      </div>
    </section>
  )
}
