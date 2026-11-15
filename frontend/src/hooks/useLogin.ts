import { useCallback, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { loginRequest } from "@/api/auth.api"
import { toApiError } from "@/api/client"
import { useAuthActions } from "./useAuth"
import type { LoginCredentials } from "@/types/auth"

export function useLogin() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)
  const updateUser = useAuthActions()
  const navigate = useNavigate()

  const login = useCallback(
    async (credentials: LoginCredentials): Promise<void> => {
      if (inFlight.current) return
      inFlight.current = true
      setIsLoading(true)
      setError(null)
      try {
        const user = await loginRequest(credentials)
        updateUser(user)
        void navigate("/chat", { replace: true })
      } catch (cause) {
        setError(toApiError(cause).message)
      } finally {
        inFlight.current = false
        setIsLoading(false)
      }
    },
    [updateUser, navigate]
  )

  return { login, isLoading, error }
}
