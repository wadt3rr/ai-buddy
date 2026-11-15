import { delay, http, HttpResponse } from "msw"
import { apiUrl, isRecord } from "@/api/client"
import { mockUser } from "./data"
export const handlers = [
  http.post(apiUrl("/auth/login"), async ({ request }) => {
    await delay(30)
    const data = await request.json()
    if (!isRecord(data)) return new HttpResponse(null, { status: 400 })
    if (data.email === "server-error@avito.ru")
      return new HttpResponse(null, { status: 500 })
    if (data.email === "network-error@avito.ru") return HttpResponse.error()
    if (data.email !== mockUser.email || data.password !== "password123")
      return new HttpResponse(null, { status: 401 })
    return HttpResponse.json({
      access_token: "test-token",
      token_type: "Bearer",
    })
  }),
  http.get(apiUrl("/users/me"), async ({ request }) => {
    await delay(30)
    if (document.cookie.includes("avito_buddy_mock_failure=me"))
      return new HttpResponse(null, { status: 500 })
    return request.headers.get("Authorization") === "Bearer test-token"
      ? HttpResponse.json(mockUser)
      : new HttpResponse(null, { status: 401 })
  }),
  http.get(apiUrl("/messages"), () =>
    HttpResponse.json({ messages: [], next_before: null })
  ),
  http.post(apiUrl("/messages"), async ({ request }) => {
    const data = (await request.json()) as { content: string }
    const created_at = new Date().toISOString()
    return HttpResponse.json(
      {
        user_message: {
          id: crypto.randomUUID(),
          role: "user",
          content: data.content,
          created_at,
        },
        assistant_message: {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Ответ сервера",
          created_at,
        },
      },
      { status: 201 }
    )
  }),
]
