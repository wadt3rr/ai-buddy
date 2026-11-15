import { client, toApiError } from "./client"
// OpenAPI resolves /api/v1/health, while the current server mounts /health.
export async function healthCheck(): Promise<string> {
  try {
    return (
      await client.get<string>("/health", {
        responseType: "text",
        baseURL: client.defaults.baseURL?.replace(/\/api\/v1\/?$/, "") || "/",
      })
    ).data
  } catch (error) {
    throw toApiError(error)
  }
}
