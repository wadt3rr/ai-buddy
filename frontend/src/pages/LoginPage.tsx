import { useState, type FormEvent } from "react"
import { AlertCircleIcon, ArrowUpRight, Eye, EyeOff } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useLogin } from "@/hooks/useLogin"
import { Alert, AlertDescription } from "@/components/ui/alert"

export function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const { login, isLoading, error } = useLogin()

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!isLoading) void login({ email: email.trim(), password })
  }

  return (
    <main className="flex min-h-dvh flex-col bg-background">
      {/* ФОРМА */}
      <section className="flex w-full flex-1 items-center justify-center px-5 py-14 sm:px-8">
        <div className="w-full max-w-md">
          {/* Заголовок */}
          <div className="mb-10 text-center">
            <h1 className="font-heading text-4xl leading-[1.2] font-medium tracking-[-0.055em] sm:text-6xl">
              С
              <span className="relative left-2 inline-block whitespace-nowrap">
                <span
                  aria-hidden="true"
                  className="absolute -inset-x-1.5 top-[12%] bottom-[8%] -rotate-2 bg-avito-pink-light"
                />
                <span className="relative z-10 dark:text-background">
                  возвращением!
                </span>
              </span>
            </h1>
          </div>

          {error && (
            // </p>
            <div className="my-4">
              <Alert variant="destructive" className="max-w-md">
                <AlertCircleIcon />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            </div>
          )}

          {/* Поля */}
          <form
            onSubmit={handleSubmit}
            className="space-y-5"
            aria-busy={isLoading}
          >
            <div className="space-y-2">
              <Label htmlFor="email">Корпоративная почта</Label>

              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                disabled={isLoading}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@avito.ru"
                className="h-13 rounded-none bg-muted/40 px-4 text-base shadow-none"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="password">Пароль</Label>

              </div>

              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  disabled={isLoading}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Введите пароль"
                  className="h-13 rounded-none bg-muted/40 px-4 pr-13 text-base shadow-none"
                />

                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={
                    showPassword ? "Скрыть пароль" : "Показать пароль"
                  }
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-0 flex w-13 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
                >
                  {showPassword ? (
                    <EyeOff className="size-4.5" />
                  ) : (
                    <Eye className="size-4.5" />
                  )}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              size="lg"
              className="group mt-3 flex h-13 w-full items-center justify-between rounded-none px-5 text-base font-medium"
            >
              {isLoading ? "Входим…" : "Войти в аккаунт"}
              <ArrowUpRight className="size-5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Button>
          </form>
        </div>
      </section>
    </main>
  )
}
