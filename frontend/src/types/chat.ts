export type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  createdAt: string
  status?: "streaming" | "completed" | "error"
}

export type ChatRequest = { message: string }

export type ChatStreamEvent =
  { type: "delta"; content: string } | { type: "done" }
