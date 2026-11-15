import { useEffect, useState } from "react"
import {
  ChevronDown,
  LogOut,
  MonitorIcon,
  MoonIcon,
  PaletteIcon,
  SunIcon,
} from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "../ui/badge"
import { useAuth } from "@/hooks/useAuth"
import { useLogout } from "@/hooks/useLogout"

type Theme = "light" | "dark" | "system"

const getInitialTheme = (): Theme => {
  const saved = localStorage.getItem("theme")

  if (saved === "light" || saved === "dark" || saved === "system") {
    return saved
  }

  return "system"
}

export const UserDropdown = () => {
  const { user } = useAuth()
  const { logout, isLoading, error } = useLogout()
  const name = user?.name ?? ""
  const role = user?.role ?? ""
  const avatar = user?.avatar
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase()

  useEffect(() => {
    const root = document.documentElement
    const media = window.matchMedia("(prefers-color-scheme: dark)")

    const applyTheme = () => {
      const isDark = theme === "dark" || (theme === "system" && media.matches)

      root.classList.toggle("dark", isDark)
      root.style.colorScheme = isDark ? "dark" : "light"
    }

    applyTheme()
    localStorage.setItem("theme", theme)

    media.addEventListener("change", applyTheme)

    return () => {
      media.removeEventListener("change", applyTheme)
    }
  }, [theme])

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Меню пользователя"
          className="group flex cursor-pointer items-center gap-2 p-1"
        >
          <Avatar className="size-11">
            <AvatarImage src={avatar} alt={name} className="grayscale" />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>

          <ChevronDown className="size-4 text-muted-foreground transition-transform duration-200 group-data-popup-open:rotate-180 group-data-[state=open]:rotate-180" />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" sideOffset={22} className="z-100 w-70">
          {/* Пользователь */}
          <DropdownMenuGroup>
            <DropdownMenuLabel className="px-3 py-3">
              <div className="flex items-center gap-3">
                <Avatar className="size-11">
                  <AvatarImage src={avatar} alt={name} />
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>

                <div className="flex min-w-0 flex-col gap-0.5 text-foreground">
                  <p className="truncate text-sm font-semibold tracking-tight">
                    {name}{" "}
                    <Badge className="ml-1" variant={"secondary"}>
                      Стажер
                    </Badge>
                  </p>

                  <p className="truncate text-xs text-muted-foreground">
                    {role}
                  </p>
                </div>
              </div>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator className="my-1.5" />
          {/* Тема */}
          <DropdownMenuGroup>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <PaletteIcon />
                Тема
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent>
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Оформление</DropdownMenuLabel>
                    <DropdownMenuRadioGroup
                      value={theme}
                      onValueChange={setTheme}
                    >
                      <DropdownMenuRadioItem value="light">
                        <SunIcon />
                        Светлая
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="dark">
                        <MoonIcon />
                        Тёмная
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="system">
                        <MonitorIcon />
                        Системная
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuGroup>
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
          </DropdownMenuGroup>
          {/* Выход */}
          <DropdownMenuGroup>
            <DropdownMenuItem
              disabled={isLoading}
              onClick={() => void logout()}
            >
              <LogOut />
              {isLoading ? "Выходим…" : "Выйти"}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {error && (
        <p
          role="alert"
          className="absolute top-full right-5 max-w-sm border border-destructive bg-background p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
    </>
  )
}
