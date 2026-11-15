import axios from "axios"

export const API_URL = (import.meta.env.VITE_API_URL || "/api/v1").replace(
  /\/$/,
  ""
)

export const apiUrl = (path: string) => `${API_URL}${path}`

export const client = axios.create({
  baseURL: API_URL,
  withCredentials: false,
  timeout: 15_000,
  headers: { Accept: "application/json" },
})

export const TOKEN_KEY = "ai_buddy_access_token"
export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const clearToken = () => localStorage.removeItem(TOKEN_KEY)
client.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export class ApiError extends Error {
  readonly status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error

  if (axios.isAxiosError<unknown>(error)) {
    const status = error.response?.status
    if (!error.response) {
      return new ApiError(
        "Не удалось связаться с сервером. Проверь подключение и попробуй ещё раз."
      )
    }
    if (status === 401)
      return new ApiError("Сессия завершена. Войди в аккаунт ещё раз.", status)
    if (status && status >= 500)
      return new ApiError("Сервер временно недоступен. Попробуй позже.", status)
    const data = error.response.data
    return new ApiError(
      isRecord(data) &&
        isRecord(data.error) &&
        typeof data.error.message === "string"
        ? data.error.message
        : "Не удалось выполнить запрос. Попробуй ещё раз.",
      status
    )
  }

  return new ApiError(
    "Не удалось получить ответ. Проверь подключение и попробуй ещё раз."
  )
}

const unauthorizedListeners = new Set<() => void>()

export function notifyUnauthorized() {
  unauthorizedListeners.forEach((listener) => listener())
}

export function onUnauthorized(listener: () => void) {
  unauthorizedListeners.add(listener)
  return () => {
    unauthorizedListeners.delete(listener)
  }
}

client.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (
      axios.isAxiosError(error) &&
      error.response?.status === 401 &&
      error.config?.url !== "/auth/login" &&
      error.config?.url !== "/users/me"
    ) {
      clearToken()
      notifyUnauthorized()
    }
    return Promise.reject(error)
  }
)
