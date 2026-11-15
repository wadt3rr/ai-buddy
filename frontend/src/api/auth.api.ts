import {
  ApiError,
  client,
  isRecord,
  toApiError,
  TOKEN_KEY,
  clearToken,
} from "./client"
import type { AuthResponse, LoginCredentials, User } from "@/types/auth"

export async function getCurrentUser(): Promise<User> {
  try {
    const { data } = await client.get<unknown>("/users/me")
    if (
      !isRecord(data) ||
      typeof data.id !== "string" ||
      typeof data.email !== "string" ||
      typeof data.team_role !== "string" ||
      typeof data.created_at !== "string"
    ) {
      throw new ApiError("Сервер вернул некорректные данные пользователя.")
    }
    return data as User
  } catch (error) {
    const failure = toApiError(error)
    if (failure.status === 401) clearToken()
    throw failure
  }
}
export async function loginRequest(
  credentials: LoginCredentials
): Promise<User> {
  try {
    const { data } = await client.post<AuthResponse>("/auth/login", credentials)
    if (
      !isRecord(data) ||
      typeof data.access_token !== "string" ||
      !data.access_token ||
      typeof data.token_type !== "string" ||
      data.token_type.toLowerCase() !== "bearer"
    ) {
      throw new ApiError("Сервер вернул некорректные данные авторизации.")
    }
    localStorage.setItem(TOKEN_KEY, data.access_token)
    return await getCurrentUser()
  } catch (error) {
    clearToken()
    const failure = toApiError(error)
    if (failure.status === 401)
      throw new ApiError("Неверная почта или пароль.", 401)
    throw failure
  }
}
// The API has no revocation endpoint. Logout clears the local JWT.
export async function logoutRequest(): Promise<void> {
  clearToken()
}
