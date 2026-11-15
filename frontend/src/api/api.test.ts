import { http, HttpResponse } from "msw"
import { describe, expect, it, vi } from "vitest"
import { server } from "@/test/server"
import { mockUser } from "@/mocks/data"
import { getCurrentUser, loginRequest } from "./auth.api"
import { streamChat } from "./chat.api"
import {
  ApiError,
  apiUrl,
  client,
  notifyUnauthorized,
  onUnauthorized,
  toApiError,
} from "./client"

describe("API contracts and errors", () => {
  it.each([
    null,
    { user: null },
    { user: { ...mockUser, id: 1 } },
    { user: { ...mockUser, name: null } },
    { user: { ...mockUser, email: false } },
    { user: { ...mockUser, role: [] } },
    { user: { ...mockUser, avatar: 42 } },
  ])("rejects a malformed current-user response: %j", async (data) => {
    server.use(http.get(apiUrl("/auth/me"), () => HttpResponse.json(data)))
    await expect(getCurrentUser()).rejects.toThrow(
      "некорректные данные пользователя"
    )
  })

  it("accepts an optional avatar and rejects malformed login success data", async () => {
    const user = { ...mockUser, avatar: "https://example.com/avatar.png" }
    server.use(http.get(apiUrl("/auth/me"), () => HttpResponse.json({ user })))
    await expect(getCurrentUser()).resolves.toEqual(user)
    server.use(
      http.post(apiUrl("/auth/login"), () => HttpResponse.json({ user: {} }))
    )
    await expect(
      loginRequest({ email: "intern@avito.ru", password: "password123" })
    ).rejects.toThrow("некорректные данные пользователя")
  })

  it.each([
    [{ message: "Некорректный запрос" }, "Некорректный запрос"],
    [{ errors: [] }, "Не удалось выполнить запрос"],
  ])(
    "normalizes a client HTTP error without losing its status",
    async (data, message) => {
      server.use(
        http.get(apiUrl("/auth/me"), () =>
          HttpResponse.json(data, { status: 400 })
        )
      )
      await expect(getCurrentUser()).rejects.toMatchObject({
        status: 400,
        message: expect.stringContaining(message),
      })
    }
  )

  it("publishes 401 only for protected endpoints and removes subscribers", async () => {
    const listener = vi.fn()
    const unsubscribe = onUnauthorized(listener)
    try {
      await expect(getCurrentUser()).rejects.toMatchObject({ status: 401 })
      await expect(
        loginRequest({ email: "intern@avito.ru", password: "wrong" })
      ).rejects.toMatchObject({ status: 401 })
      expect(listener).not.toHaveBeenCalled()
      server.use(
        http.get(
          apiUrl("/private"),
          () => new HttpResponse(null, { status: 401 })
        )
      )
      await expect(client.get("/private")).rejects.toBeDefined()
      expect(listener).toHaveBeenCalledOnce()
      unsubscribe()
      notifyUnauthorized()
      expect(listener).toHaveBeenCalledOnce()
    } finally {
      unsubscribe()
    }
  })

  it("preserves known API errors and safely handles unknown failures", () => {
    const error = new ApiError("Ожидаемая ошибка", 422)
    expect(toApiError(error)).toBe(error)
    expect(toApiError(new Error("internal details"))).toBeInstanceOf(ApiError)
    expect(toApiError(null).message).toContain("Проверь подключение")
    expect(toApiError(new Error("secret")).message).not.toContain("secret")
  })

  it.each([
    [new HttpResponse(null, { status: 422 }), "Не удалось отправить сообщение"],
    [
      HttpResponse.json(
        { message: "Сообщение слишком длинное" },
        { status: 400 }
      ),
      "Сообщение слишком длинное",
    ],
    // MSW exposes a bodyless 200 response as an empty readable stream in Node.
    [
      new HttpResponse(null, {
        headers: { "Content-Type": "text/event-stream" },
      }),
      "Соединение прервалось",
    ],
  ])(
    "handles a rejected or bodyless chat response",
    async (response, message) => {
      server.use(http.post(apiUrl("/chat/stream"), () => response.clone()))
      await expect(
        streamChat({ message: "Вопрос" }, new AbortController().signal, vi.fn())
      ).rejects.toThrow(message)
    }
  )
})
