import { Header } from "@/components/common/Header"
import { ChatConversation } from "@/components/common/chat/ChatConversation"
import { ChatWelcome } from "@/components/common/chat/ChatWelcome"
import { useAuth } from "@/hooks/useAuth"
import { useChat } from "@/hooks/useChat"

export function ChatPage() {
  const { user, isLoading } = useAuth()
  if (isLoading || !user) return <p role="status">Проверяем сессию…</p>
  return <ChatContent key={user.id} sessionKey={user.id} />
}

function ChatContent({ sessionKey }: { sessionKey: string }) {
  const {
    messages,
    sendMessage,
    stopGeneration,
    isStreaming,
    error,
    historyError,
    isHistoryLoading,
    hasMore,
    loadOlder,
  } = useChat(sessionKey)
  const hasMessages = messages.length > 0

  return (
    <div className="relative flex h-dvh min-h-0 flex-col overflow-hidden bg-background">
      {/* Хедер поверх содержимого */}
      <div className="absolute inset-x-0 top-0 z-50">
        <Header ticketRefreshKey={messages.filter(message => message.role === "assistant" && message.status === "completed").length} />
      </div>

      <main className="flex min-h-0 flex-1 flex-col">
        {hasMessages || isHistoryLoading || historyError || error ? (
          <ChatConversation
            messages={messages}
            isLoading={isStreaming}
            onSend={sendMessage}
            onStop={stopGeneration}
            error={error}
            historyError={historyError}
            isHistoryLoading={isHistoryLoading}
            hasMore={hasMore}
            onLoadOlder={loadOlder}
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pt-28 pb-5 sm:items-center sm:justify-center sm:py-12">
            <ChatWelcome onSend={sendMessage} />
          </div>
        )}
      </main>
    </div>
  )
}
