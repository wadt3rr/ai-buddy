import { useContext } from "react"
import { AuthActionsContext, AuthContext } from "@/contexts/AuthContext"
import type { AuthContextValue } from "@/types/auth"

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context)
    throw new Error("useAuth должен использоваться внутри AuthProvider")
  return context
}

export function useAuthActions() {
  const updateUser = useContext(AuthActionsContext)
  if (!updateUser)
    throw new Error("useAuthActions должен использоваться внутри AuthProvider")
  return updateUser
}
