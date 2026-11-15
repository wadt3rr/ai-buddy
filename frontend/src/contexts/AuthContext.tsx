import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react"
import { getCurrentUser } from "@/api/auth.api"
import { onUnauthorized, toApiError } from "@/api/client"
import type { AuthContextValue, User } from "@/types/auth"

export const AuthContext = createContext<AuthContextValue | null>(null)
export const AuthActionsContext = createContext<
  ((user: User | null) => void) | null
>(null)

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const pending = useRef<Promise<void> | null>(null)
  const version = useRef(0)

  const updateUser = useCallback((nextUser: User | null) => {
    version.current++
    setUser(nextUser)
    setError(null)
    setIsLoading(false)
  }, [])

  const refreshUser = useCallback((): Promise<void> => {
    if (pending.current) return pending.current
    const requestVersion = version.current
    setIsLoading(true)
    setError(null)
    const request = (async () => {
      try {
        const currentUser = await getCurrentUser()
        if (version.current === requestVersion) setUser(currentUser)
      } catch (cause) {
        if (version.current !== requestVersion) return
        const apiError = toApiError(cause)
        setUser(null)
        if (apiError.status !== 401) setError(apiError.message)
      } finally {
        if (version.current === requestVersion) setIsLoading(false)
        pending.current = null
      }
    })()
    pending.current = request
    return request
  }, [])

  useEffect(() => {
    const unsubscribe = onUnauthorized(() => updateUser(null))
    void refreshUser()
    return unsubscribe
  }, [refreshUser, updateUser])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isLoading,
      error,
      refreshUser,
    }),
    [user, isLoading, error, refreshUser]
  )

  return (
    <AuthActionsContext.Provider value={updateUser}>
      <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
    </AuthActionsContext.Provider>
  )
}
