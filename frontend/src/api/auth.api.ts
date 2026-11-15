import { ApiError, client, isRecord, toApiError } from "./client"
import type { AuthResponse, LoginCredentials, User } from "@/types/auth"

function readUser(data: unknown): User {
  const user = isRecord(data) ? data.user : undefined
  if (
    !isRecord(user) ||
    typeof user.id !== "string" ||
    typeof user.name !== "string" ||
    typeof user.email !== "string" ||
    typeof user.role !== "string" ||
    (user.avatar !== undefined && typeof user.avatar !== "string")
  ) {
    throw new ApiError("Сервер вернул некорректные данные пользователя.")
  }
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    ...(typeof user.avatar === "string" ? { avatar: user.avatar } : {}),
  }
}

export async function getCurrentUser(): Promise<User> {
  try {
    const { data } = await client.get<AuthResponse>("/auth/me")
    return readUser(data)
  } catch (error) {
    throw toApiError(error)
  }
}

export async function loginRequest(
  credentials: LoginCredentials
): Promise<User> {
  try {
    const { data } = await client.post<AuthResponse>("/auth/login", credentials)
    return readUser(data)
  } catch (error) {
    const apiError = toApiError(error)
    if (apiError.status === 401)
      throw new ApiError("Неверная почта или пароль.", 401)
    throw apiError
  }
}

export async function logoutRequest(): Promise<void> {
  try {
    await client.post("/auth/logout")
  } catch (error) {
    const apiError = toApiError(error)
    // An already expired session is also a successful local logout.
    if (apiError.status !== 401) throw apiError
  }
}
