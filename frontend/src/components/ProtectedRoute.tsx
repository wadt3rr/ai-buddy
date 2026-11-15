import { Navigate, Outlet } from "react-router-dom"
import { useAuth } from "@/hooks/useAuth"
import { Button } from "@/components/ui/button"
import { Spinner } from "./ui/spinner"

export function ProtectedRoute({ guestOnly = false }: { guestOnly?: boolean }) {
  const { isAuthenticated, isLoading, error, refreshUser } = useAuth()
  if (isLoading) {
    return (
      <main
        role="status"
        aria-label="Проверка авторизации"
        className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background"
      >
        <Spinner aria-hidden="true" role="presentation" />

        <p className="text-sm text-muted-foreground">Проверяем сессию</p>
      </main>
    )
  }
  if (error) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-5">
        <p role="alert">{error}</p>
        <Button onClick={() => void refreshUser()}>Повторить проверку</Button>
      </main>
    )
  }
  if (guestOnly && isAuthenticated) return <Navigate to="/chat" replace />
  if (!guestOnly && !isAuthenticated) return <Navigate to="/" replace />
  return <Outlet />
}
