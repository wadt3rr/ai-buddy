import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { setMediaMatch } from "@/test/media"
import { ThemeProvider, useTheme } from "./theme-provider"

function ThemeControls() {
  const { theme, setTheme } = useTheme()
  return (
    <>
      <output aria-label="Текущая тема">{theme}</output>
      <button onClick={() => setTheme("light")}>Светлая</button>
      <button onClick={() => setTheme("dark")}>Тёмная</button>
      <button onClick={() => setTheme("system")}>Системная</button>
      <input aria-label="Поле ввода" />
      <div
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label="Редактор"
      />
    </>
  )
}

describe("ThemeProvider", () => {
  it("honors a saved theme and persists changes made through the context", async () => {
    localStorage.setItem("theme", "dark")
    const user = userEvent.setup()
    render(
      <ThemeProvider>
        <ThemeControls />
      </ThemeProvider>
    )
    expect(document.documentElement).toHaveClass("dark")
    expect(screen.getByLabelText("Текущая тема")).toHaveTextContent("dark")
    await user.click(screen.getByRole("button", { name: "Светлая" }))
    expect(localStorage.getItem("theme")).toBe("light")
    expect(document.documentElement).toHaveClass("light")
    expect(document.documentElement).not.toHaveClass("dark")
    await waitFor(() => expect(document.head.querySelector("style")).toBeNull())
  })

  it("follows OS changes in system mode and stops following them for an explicit theme", async () => {
    localStorage.setItem("theme", "invalid")
    setMediaMatch("(prefers-color-scheme: dark)", true)
    const user = userEvent.setup()
    const { unmount } = render(
      <ThemeProvider disableTransitionOnChange={false}>
        <ThemeControls />
      </ThemeProvider>
    )
    expect(document.documentElement).toHaveClass("dark")
    act(() => setMediaMatch("(prefers-color-scheme: dark)", false))
    expect(document.documentElement).toHaveClass("light")
    await user.click(screen.getByRole("button", { name: "Тёмная" }))
    act(() => setMediaMatch("(prefers-color-scheme: dark)", false))
    expect(document.documentElement).toHaveClass("dark")
    await user.click(screen.getByRole("button", { name: "Системная" }))
    expect(document.documentElement).toHaveClass("light")
    unmount()
    act(() => setMediaMatch("(prefers-color-scheme: dark)", true))
    expect(document.documentElement).toHaveClass("light")
  })

  it("toggles with D but preserves typing and ignores modified or repeated keypresses", async () => {
    const user = userEvent.setup()
    render(
      <ThemeProvider disableTransitionOnChange={false}>
        <ThemeControls />
      </ThemeProvider>
    )
    await user.keyboard("d")
    expect(document.documentElement).toHaveClass("dark")
    await user.keyboard("D")
    expect(document.documentElement).toHaveClass("light")
    await user.keyboard("d")
    expect(document.documentElement).toHaveClass("dark")
    await user.type(screen.getByRole("textbox", { name: "Поле ввода" }), "d")
    expect(document.documentElement).toHaveClass("dark")
    await user.click(screen.getByRole("textbox", { name: "Редактор" }))
    await user.keyboard("d")
    expect(document.documentElement).toHaveClass("dark")
    for (const options of [
      { repeat: true },
      { ctrlKey: true },
      { altKey: true },
      { metaKey: true },
    ]) {
      fireEvent.keyDown(document.body, { key: "d", ...options })
    }
    expect(document.documentElement).toHaveClass("dark")
    fireEvent.keyDown(window, { key: "x" })
    expect(document.documentElement).toHaveClass("dark")
  })

  it("toggles from a dark OS default to light and removes keyboard listeners on unmount", async () => {
    setMediaMatch("(prefers-color-scheme: dark)", true)
    const user = userEvent.setup()
    const { unmount } = render(
      <ThemeProvider disableTransitionOnChange={false}>
        <ThemeControls />
      </ThemeProvider>
    )
    await user.keyboard("d")
    expect(document.documentElement).toHaveClass("light")
    unmount()
    await user.keyboard("d")
    expect(localStorage.getItem("theme")).toBe("light")
  })

  it("synchronizes the selected storage key across tabs and falls back on invalid values", () => {
    const { unmount } = render(
      <ThemeProvider
        defaultTheme="dark"
        storageKey="custom-theme"
        disableTransitionOnChange={false}
      >
        <ThemeControls />
      </ThemeProvider>
    )
    const storage = (
      key: string,
      newValue: string | null,
      storageArea = localStorage
    ) =>
      fireEvent(
        window,
        new StorageEvent("storage", { key, newValue, storageArea })
      )
    storage("custom-theme", "light", sessionStorage)
    storage("unrelated", "light")
    expect(document.documentElement).toHaveClass("dark")
    storage("custom-theme", "light")
    expect(document.documentElement).toHaveClass("light")
    storage("custom-theme", "invalid")
    expect(document.documentElement).toHaveClass("dark")
    storage("custom-theme", null)
    expect(document.documentElement).toHaveClass("dark")
    unmount()
    storage("custom-theme", "light")
    expect(document.documentElement).toHaveClass("dark")
  })

  it("reports a missing provider instead of silently returning a fake theme", () => {
    expect(() => renderHook(useTheme)).toThrow(
      "useTheme must be used within a ThemeProvider"
    )
  })
})
