import { act, renderHook, waitFor } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"
import { apiUrl } from "@/api/client"
import { useAuth, useAuthActions } from "@/hooks/useAuth"
import { mockUser } from "@/mocks/data"
import { server } from "@/test/server"
import { AuthProvider } from "./AuthContext"

describe("AuthContext edge cases", () => {
  it("rejects auth hooks called outside their provider", () => {
    expect(() => renderHook(useAuth)).toThrow(
      "useAuth должен использоваться внутри AuthProvider"
    )
    expect(() => renderHook(useAuthActions)).toThrow(
      "useAuthActions должен использоваться внутри AuthProvider"
    )
  })

  it("coalesces concurrent refreshes and ignores a response from before a session change", async () => {
    const { result } = renderHook(
      () => ({ ...useAuth(), updateUser: useAuthActions() }),
      { wrapper: AuthProvider }
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    let complete: (() => void) | undefined
    let requests = 0
    const gate = new Promise<void>((resolve) => {
      complete = resolve
    })
    server.use(
      http.get(apiUrl("/auth/me"), async () => {
        requests++
        await gate
        return HttpResponse.json({ user: mockUser })
      })
    )
    let first: Promise<void> = Promise.resolve()
    let second: Promise<void> = Promise.resolve()
    act(() => {
      first = result.current.refreshUser()
      second = result.current.refreshUser()
    })
    await waitFor(() => expect(requests).toBe(1))
    act(() => result.current.updateUser(null))
    await act(async () => {
      complete!()
      await Promise.all([first, second])
    })
    expect(result.current.user).toBeNull()
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })
})
