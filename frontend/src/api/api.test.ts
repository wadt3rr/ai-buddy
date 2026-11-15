import { http, HttpResponse } from "msw"
import { describe, expect, it, vi } from "vitest"
import { server } from "@/test/server"
import { mockUser } from "@/mocks/data"
import { getCurrentUser, loginRequest, logoutRequest } from "./auth.api"
import { listMessages, sendChatMessage } from "./chat.api"
import { healthCheck } from "./health.api"
import {
  ApiError,
  apiUrl,
  client,
  notifyUnauthorized,
  onUnauthorized,
  toApiError,
  TOKEN_KEY,
} from "./client"
const message = {
  id: "1",
  role: "user",
  content: "Вопрос",
  created_at: "2026-11-15T10:00:00Z",
}
describe("backend API contracts", () => {
  it.each([
    null,
    { user: mockUser },
    { ...mockUser, id: 1 },
    { ...mockUser, email: false },
    { ...mockUser, team_role: [] },
    { ...mockUser, created_at: null },
  ])("rejects malformed users %j", async (data) => {
    server.use(http.get(apiUrl("/users/me"), () => HttpResponse.json(data)))
    await expect(getCurrentUser()).rejects.toThrow(
      "некорректные данные пользователя"
    )
  })
  it("logs in, saves JWT and requests a raw user profile with Bearer auth", async () => {
    expect(
      await loginRequest({ email: mockUser.email, password: "password123" })
    ).toEqual(mockUser)
    expect(localStorage.getItem(TOKEN_KEY)).toBe("test-token")
    await logoutRequest()
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
  })
  it.each([
    {},
    { access_token: "", token_type: "Bearer" },
    { access_token: "x", token_type: "Cookie" },
  ])("rejects malformed login data %j", async (data) => {
    server.use(http.post(apiUrl("/auth/login"), () => HttpResponse.json(data)))
    await expect(
      loginRequest({ email: "a@b.c", password: "x" })
    ).rejects.toThrow("авторизации")
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
  })
  it.each([
    [
      { error: { code: "invalid", message: "Некорректный запрос" } },
      "Некорректный запрос",
    ],
    [{ errors: [] }, "Не удалось выполнить запрос"],
  ])("normalizes nested HTTP errors", async (data, expected) => {
    server.use(
      http.get(apiUrl("/users/me"), () =>
        HttpResponse.json(data, { status: 400 })
      )
    )
    await expect(getCurrentUser()).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining(expected as string),
    })
  })
  it("publishes protected 401, clears token and removes subscribers", async () => {
    const listener = vi.fn()
    const unsubscribe = onUnauthorized(listener)
    await expect(getCurrentUser()).rejects.toMatchObject({ status: 401 })
    await expect(
      loginRequest({ email: "a", password: "wrong" })
    ).rejects.toMatchObject({ status: 401 })
    expect(listener).not.toHaveBeenCalled()
    localStorage.setItem(TOKEN_KEY, "expired")
    server.use(
      http.get(
        apiUrl("/private"),
        () => new HttpResponse(null, { status: 401 })
      )
    )
    await expect(client.get("/private")).rejects.toBeDefined()
    expect(listener).toHaveBeenCalledOnce()
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
    unsubscribe()
    notifyUnauthorized()
    expect(listener).toHaveBeenCalledOnce()
  })
  it("preserves known errors and hides unknown failure details", () => {
    const error = new ApiError("Вопрос", 422)
    expect(toApiError(error)).toBe(error)
    expect(toApiError(new Error("secret")).message).not.toContain("secret")
    expect(toApiError(null).message).toContain("подключение")
  })
  it("passes server pagination and JSON send contracts", async () => {
    server.use(
      http.get(apiUrl("/messages"), ({ request }) => {
        const url = new URL(request.url)
        expect(url.searchParams.get("limit")).toBe("50")
        expect(url.searchParams.get("before")).toBe("cursor")
        return HttpResponse.json({ messages: [message], next_before: null })
      })
    )
    expect((await listMessages("cursor")).messages).toEqual([message])
    expect((await sendChatMessage("Вопрос")).user_message.content).toBe(
      "Вопрос"
    )
  })
  it.each([
    { messages: [] },
    { messages: [null], next_before: null },
    { messages: [{ ...message, created_at: "bad" }], next_before: null },
  ])("rejects malformed history %j", async (data) => {
    server.use(http.get(apiUrl("/messages"), () => HttpResponse.json(data)))
    await expect(listMessages()).rejects.toThrow("некорректн")
  })
  it("preserves a saved user message after assistant failure", async () => {
    server.use(
      http.post(apiUrl("/messages"), () =>
        HttpResponse.json(
          {
            error: { code: "assistant_unavailable", message: "Failed" },
            user_message: message,
          },
          { status: 502 }
        )
      )
    )
    await expect(sendChatMessage("Вопрос")).rejects.toMatchObject({
      status: 502,
      userMessage: message,
    })
  })
  it.each([null, {}, { user_message: message, assistant_message: {} }])(
    "rejects malformed send responses %j",
    async (data) => {
      server.use(http.post(apiUrl("/messages"), () => HttpResponse.json(data)))
      await expect(sendChatMessage("Вопрос")).rejects.toThrow("некорректн")
    }
  )
  it("exposes the documented health operation and propagates errors", async () => {
    server.use(
      http.get("http://localhost:3000/health", () => HttpResponse.text("OK"))
    )
    await expect(healthCheck()).resolves.toBe("OK")
    server.use(
      http.get(
        "http://localhost:3000/health",
        () => new HttpResponse(null, { status: 500 })
      )
    )
    await expect(healthCheck()).rejects.toMatchObject({ status: 500 })
  })
})
