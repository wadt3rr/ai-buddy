import {
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react"
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
import { SourceLink } from "./SourceLink"
import type { ChatMessage } from "@/types/chat"

type ChatConversationProps = {
  historyError?: string | null
  isHistoryLoading?: boolean
  hasMore?: boolean
  onLoadOlder?: () => Promise<void>
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
  historyError,
  isHistoryLoading = false,
  hasMore = false,
  onLoadOlder,
  isLoading = false,
  error,
  onStop,
  onSend,
}: ChatConversationProps) {
  const [message, setMessage] = useState("")
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const viewport = useRef<HTMLDivElement | null>(null)
  const content = useRef<HTMLDivElement | null>(null)
  const initialized = useRef(false)
  const following = useRef(true)
  const forceBottom = useRef(false)
  const anchor = useRef<{
    height: number
    top: number
    node: HTMLElement | null
    offset: number
    firstId?: string
  } | null>(null)
  const loadOlder = () => {
    const element = viewport.current
    if (!element || isHistoryLoading || !onLoadOlder) return
    following.current = false
    const node = element.querySelector<HTMLElement>("[data-message-id]")
    anchor.current = {
      node,
      offset: node?.getBoundingClientRect().top ?? 0,
      height: element.scrollHeight,
      top: element.scrollTop,
      firstId: messages[0]?.id,
    }
    void onLoadOlder()
  }
  useLayoutEffect(() => {
    const element = viewport.current
    if (!element) return
    const previous = anchor.current
    if (previous && !isHistoryLoading) {
      if (previous.firstId !== messages[0]?.id)
        element.scrollTop = previous.node?.isConnected
          ? element.scrollTop +
            previous.node.getBoundingClientRect().top -
            previous.offset
          : previous.top + element.scrollHeight - previous.height
      anchor.current = null
      return
    }
    if (anchor.current) return
    if (
      (!initialized.current && !isHistoryLoading && messages.length > 0) ||
      forceBottom.current
    ) {
      initialized.current = true
      forceBottom.current = false
      following.current = true
      element.scrollTop = Math.max(
        0,
        element.scrollHeight - element.clientHeight
      )
    } else if (initialized.current && following.current) {
      element.scrollTop = Math.max(
        0,
        element.scrollHeight - element.clientHeight
      )
    }
  }, [messages, isHistoryLoading])
  useLayoutEffect(() => {
    const element = viewport.current
    const body = content.current
    if (!element || !body) return
    const observer = new ResizeObserver(() => {
      if (initialized.current && following.current && !anchor.current) {
        element.scrollTop = Math.max(
          0,
          element.scrollHeight - element.clientHeight
        )
      }
    })
    observer.observe(body)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const canSend =
    message.trim().length > 0 &&
    !isLoading &&
    !(isHistoryLoading && messages.length === 0) &&
    !(historyError && messages.length === 0)

  const handleSubmit = (event?: FormEvent) => {
    event?.preventDefault()

    if (!canSend) return

    const text = message.trim()

    forceBottom.current = true
    following.current = true
    if (viewport.current) {
      viewport.current.scrollTop = Math.max(
        0,
        viewport.current.scrollHeight - viewport.current.clientHeight
      )
    }
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
      // Clipboard access can be unavailable; leave the response selectable.
    }
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-background">
      {/* История сообщений */}
      <MessageScrollerProvider autoScroll={false} defaultScrollPosition="end">
        <MessageScroller className="relative flex min-h-0 flex-1 flex-col">
          <MessageScrollerViewport
            ref={viewport}
            preserveScrollOnPrepend={false}
            style={{ overflowAnchor: "none" }}
            onScroll={(event) => {
              const element = event.currentTarget
              following.current =
                element.scrollHeight -
                  element.clientHeight -
                  element.scrollTop <=
                80
              if (
                initialized.current &&
                event.currentTarget.scrollTop <= 40 &&
                hasMore &&
                !historyError
              )
                loadOlder()
            }}
            className="min-h-0 flex-1 mask-none! [-webkit-mask-image:none]!"
          >
            <MessageScrollerContent
              ref={content}
              className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-end gap-7 px-5 pt-28 pb-6"
            >
              {(hasMore || isHistoryLoading || historyError) && (
                <div className="text-center text-sm text-muted-foreground">
                  {isHistoryLoading ? (
                    <p role="status">Загружаем историю…</p>
                  ) : historyError ? (
                    <>
                      <p role="alert">{historyError}</p>
                      <Button variant="ghost" onClick={loadOlder}>
                        Повторить загрузку
                      </Button>
                    </>
                  ) : (
                    <Button variant="ghost" onClick={loadOlder}>
                      Загрузить предыдущие сообщения
                    </Button>
                  )}
                </div>
              )}
              {messages.map((item) => {
                const isUser = item.role === "user"

                if (isUser) {
                  return (
                    <Message
                      key={item.id}
                      data-message-id={item.id}
                      align="end"
                    >
                      <MessageContent>
                        <Bubble>
                          <BubbleContent className="bg-avito-purple-light! wrap-break-word whitespace-pre-wrap text-black!">
                            {item.content}
                          </BubbleContent>
                        </Bubble>

                        <MessageFooter className="mt-1 text-xs font-normal text-muted-foreground">
                          {formatTime(item.createdAt)}
                        </MessageFooter>
                      </MessageContent>
                    </Message>
                  )
                }

                return (
                  <Message
                    key={item.id}
                    data-message-id={item.id}
                    aria-label="Ответ AI Buddy"
                    aria-busy={item.status === "streaming"}
                  >
                    <MessageContent className="min-w-0 flex-1">
                      {/* Ответ ассистента */}
                      <Bubble variant="muted">
                        <BubbleContent>
                          <div className="prose prose-sm max-w-none overflow-x-auto prose-neutral dark:prose-invert prose-headings:text-foreground prose-p:text-foreground prose-strong:text-foreground prose-li:text-foreground">
                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: SourceLink }}>
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
                        <span className="text-xs font-normal text-muted-foreground">
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
              {isLoading && (
                <Marker role="status">
                  <MarkerContent className="shimmer">
                    <span className="font-medium">AI-buddy</span>{" "}
                    {messages.at(-1)?.content ? "отвечает..." : "думает..."}
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
