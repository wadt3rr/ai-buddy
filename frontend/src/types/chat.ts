export type Message = {
  id: string
  role: "user" | "assistant"
  content: string
  created_at: string
}
export type ChatMessage = Omit<Message, "created_at"> & {
  createdAt: string
  status?: "streaming" | "completed" | "error"
}
export type MessageListResponse = {
  messages: Message[]
  next_before: string | null
}
export type SendMessageResponse = {
  user_message: Message
  assistant_message: Message
}
export type AssistantUnavailableResponse = {
  error: { code: string; message: string }
  user_message: Message
}
