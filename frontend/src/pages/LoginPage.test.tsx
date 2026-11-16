import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { expect, it } from "vitest"
import { AuthProvider } from "@/contexts/AuthContext"
import { LoginPage } from "./LoginPage"

it("can reveal and hide the password without submitting or changing its value", async () => {
  const user = userEvent.setup()
  render(
    <AuthProvider>
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    </AuthProvider>
  )
  const password = screen.getByLabelText("Пароль", { selector: "input" })
  await user.type(password, "example")
  expect(password).toHaveAttribute("type", "password")
  await user.click(screen.getByRole("button", { name: "Показать пароль" }))
  expect(password).toHaveAttribute("type", "text")
  expect(screen.getByRole("button", { name: "Скрыть пароль" })).toHaveAttribute(
    "aria-pressed",
    "true"
  )
  await user.click(screen.getByRole("button", { name: "Скрыть пароль" }))
  expect(password).toHaveAttribute("type", "password")
  expect(password).toHaveValue("example")
  expect(screen.queryByRole("alert")).not.toBeInTheDocument()
})
