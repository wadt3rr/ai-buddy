export type User = {
  id: string
  name: string
  email: string
  role: string
  avatar?: string
}

export type LoginCredentials = {
  email: string
  password: string
}

export type AuthResponse = { user: User }

export type AuthContextValue = {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  refreshUser: () => Promise<void>
}
