import { delay, http, HttpResponse } from "msw"
import { apiUrl, isRecord } from "@/api/client"
import { getMockAnswer, mockUser } from "./data"

export const DEMO_COOKIE = "avito_buddy_demo_session"
const FAILURE_COOKIE = "avito_buddy_mock_failure"

function cookie(name: string) {
  return typeof document === "undefined"
    ? undefined
    : document.cookie
        .split("; ")
        .find((part) => part.startsWith(`${name}=`))
        ?.slice(name.length + 1)
}

function setSession(active: boolean) {
  // Deliberately non-secret demo flag, NOT an authentication token or HttpOnly cookie.
  document.cookie = `${DEMO_COOKIE}=${active ? "active" : ""}; Path=/; SameSite=Lax; Max-Age=${active ? 28_800 : 0}${location.protocol === "https:" ? "; Secure" : ""}`
}

const unauthorized = () =>
  HttpResponse.json({ message: "Требуется вход в аккаунт." }, { status: 401 })
const serverError = () =>
  HttpResponse.json(
    { message: "Демонстрационная ошибка сервера." },
    { status: 500 }
  )

export const handlers = [
  http.post(apiUrl("/auth/login"), async ({ request }) => {
    await delay(150)
    const data: unknown = await request.json()
    if (
      !isRecord(data) ||
      typeof data.email !== "string" ||
      typeof data.password !== "string"
    ) {
      return HttpResponse.json(
        { message: "Укажи почту и пароль." },
        { status: 400 }
      )
    }
    if (data.email === "server-error@avito.ru") return serverError()
    if (data.email === "network-error@avito.ru") return HttpResponse.error()
    if (
      data.email.toLowerCase() !== mockUser.email ||
      data.password !== "password123"
    )
      return unauthorized()
    setSession(true)
    return HttpResponse.json({ user: mockUser })
  }),
  http.get(apiUrl("/auth/me"), async () => {
    await delay(100)
    if (cookie(FAILURE_COOKIE) === "me") return serverError()
    if (cookie(FAILURE_COOKIE) === "network") return HttpResponse.error()
    return cookie(DEMO_COOKIE) === "active"
      ? HttpResponse.json({ user: mockUser })
      : unauthorized()
  }),
  http.post(apiUrl("/auth/logout"), async () => {
    await delay(100)
    if (cookie(FAILURE_COOKIE) === "logout") return serverError()
    setSession(false)
    return new HttpResponse(null, { status: 204 })
  }),
  http.post(apiUrl("/chat/stream"), async ({ request }) => {
    if (cookie(DEMO_COOKIE) !== "active") return unauthorized()
    const data: unknown = await request.json()
    if (
      !isRecord(data) ||
      typeof data.message !== "string" ||
      !data.message.trim()
    ) {
      return HttpResponse.json(
        { message: "Сообщение не должно быть пустым." },
        { status: 400 }
      )
    }
    const message = data.message.trim()
    if (message === "/mock:error-before") return serverError()
    const encoder = new TextEncoder()
    const answer = getMockAnswer(message)
    let offset = 0
    let closed = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let cleanup = () => {}
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const stop = () => {
          if (closed) return
          closed = true
          clearTimeout(timer)
          request.signal.removeEventListener("abort", close)
        }
        const close = () => {
          if (closed) return
          stop()
          controller.close()
        }
        cleanup = stop
        const emit = (event: string, payload: Record<string, string>) => {
          controller.enqueue(
            encoder.encode(
              `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`
            )
          )
        }
        const next = () => {
          if (closed) return
          if (message === "/mock:empty" || offset >= answer.length) {
            emit("done", {})
            close()
            return
          }
          if (message === "/mock:error-mid" && offset >= 96) {
            emit("error", {
              message: "Генерация прервалась. Полученный текст сохранён.",
            })
            close()
            return
          }
          emit("delta", { content: answer.slice(offset, offset + 24) })
          offset += 24
          timer = setTimeout(next, 40)
        }
        request.signal.addEventListener("abort", close, { once: true })
        if (request.signal.aborted) close()
        else timer = setTimeout(next, 80)
      },
      cancel() {
        cleanup()
      },
    })
    return new HttpResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    })
  }),
]
