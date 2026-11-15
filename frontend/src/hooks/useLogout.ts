import { useCallback, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { logoutRequest } from "@/api/auth.api"
import { toApiError } from "@/api/client"
import { useAuthActions } from "./useAuth"

export function useLogout() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)
  const updateUser = useAuthActions()
  const navigate = useNavigate()

  const logout = useCallback(async (): Promise<void> => {
    if (inFlight.current) return
    inFlight.current = true
    setIsLoading(true)
    setError(null)
    try {
      await logoutRequest()
      updateUser(null)
      void navigate("/", { replace: true })
    } catch (cause) {
      setError(toApiError(cause).message)
    } finally {
      inFlight.current = false
      setIsLoading(false)
    }
  }, [updateUser, navigate])

  return { logout, isLoading, error }
}
