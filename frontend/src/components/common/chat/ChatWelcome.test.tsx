import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { ChatWelcome } from "./ChatWelcome"

describe("ChatWelcome", () => {
  it("shows the introduction, rejects whitespace and sends trimmed text by button", async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<ChatWelcome onSend={onSend} />)
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Большие дела"
    )
    const input = screen.getByRole("textbox", {
      name: "Сообщение для AI Buddy",
    })
    const send = screen.getByRole("button", { name: "Отправить сообщение" })
    expect(send).toBeDisabled()
    await user.type(input, "   ")
    await user.keyboard("{Enter}")
    expect(onSend).not.toHaveBeenCalled()
    await user.type(input, "Первый день  ")
    await user.click(send)
    expect(onSend).toHaveBeenCalledExactlyOnceWith("Первый день")
    expect(input).toHaveValue("")
  })

  it("supports multiline Shift+Enter and submits with Enter", async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<ChatWelcome onSend={onSend} />)
    const input = screen.getByRole("textbox")
    await user.type(input, "Вопрос{Shift>}{Enter}{/Shift}ещё вопрос")
    expect(onSend).not.toHaveBeenCalled()
    expect(input).toHaveValue("Вопрос\nещё вопрос")
    // IME composition must not accidentally submit a partially composed word.
    fireEvent.keyDown(input, { key: "Enter", isComposing: true })
    expect(onSend).not.toHaveBeenCalled()
    await user.keyboard("{Enter}")
    expect(onSend).toHaveBeenCalledWith("Вопрос\nещё вопрос")
  })

  it("cannot send when no handler is connected", async () => {
    const user = userEvent.setup()
    render(<ChatWelcome />)
    await user.type(screen.getByRole("textbox"), "Привет{Enter}")
    expect(
      screen.getByRole("button", { name: "Отправить сообщение" })
    ).toBeDisabled()
    expect(screen.getByRole("textbox")).toHaveValue("Привет")
  })
})
