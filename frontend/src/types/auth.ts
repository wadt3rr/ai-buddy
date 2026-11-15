export type User = {
  id: string
  email: string
  team_role: string
  created_at: string
}
export type LoginCredentials = { email: string; password: string }
export type AuthResponse = { access_token: string; token_type: string }
export type AuthContextValue = {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  refreshUser: () => Promise<void>
}
