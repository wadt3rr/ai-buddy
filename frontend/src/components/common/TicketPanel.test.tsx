import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { expect, it, vi } from "vitest"
import { client } from "@/api/client"
import { TicketPanel } from "./TicketPanel"

const ticket = { id: "BUDDY-1", kind: "mentor", status: "open", created_at: "2026-11-16T02:00:00Z", payload: { service: "listing-search", question: "Не запускается", reason: "Нужна помощь", recipients: ["Наставник", 1] } }

it("loads saved tickets, refreshes after messages and closes", async () => {
  const get = vi.spyOn(client, "get").mockResolvedValue({ data: { tickets: [ticket] } })
  const view = render(<TicketPanel />)
  fireEvent.click(screen.getByRole("button", { name: "Мои обращения" }))
  expect(await screen.findByText("BUDDY-1")).toBeInTheDocument()
  expect(screen.getByText("Нужна помощь")).toBeInTheDocument()
  view.rerender(<TicketPanel refreshKey={2} />)
  await waitFor(() => expect(get).toHaveBeenCalledTimes(2))
  fireEvent.click(screen.getByText("Закрыть"))
  expect(screen.queryByRole("region")).not.toBeInTheDocument()
})

it("handles loading, empty results, failed requests and retry", async () => {
  let resolve!: (data: unknown) => void
  const get = vi.spyOn(client, "get").mockReturnValue(new Promise(r => { resolve = r }))
  render(<TicketPanel />)
  fireEvent.click(screen.getByRole("button"))
  expect(screen.getByRole("status")).toHaveTextContent("Загружаем")
  await act(async () => resolve({ data: { tickets: [] } }))
  expect(await screen.findByText(/Пока нет обращений/)).toBeInTheDocument()
  fireEvent.click(screen.getByText("Закрыть"))
  get.mockRejectedValueOnce(new Error("network"))
  fireEvent.click(screen.getByRole("button"))
  expect(await screen.findByRole("alert")).toBeInTheDocument()
  get.mockResolvedValue({ data: { tickets: [{ ...ticket, kind: "documentation", status: "closed", created_at: null, payload: {} }] } })
  fireEvent.click(screen.getByText("Повторить"))
  expect(await screen.findByText("Обновление документации")).toBeInTheDocument()
  expect(screen.getByText("closed")).toBeInTheDocument()
})

it.each([{}, { tickets: [null] }, { tickets: [{ ...ticket, created_at: "bad" }] }])("rejects malformed registry responses", async data => {
  vi.spyOn(client, "get").mockResolvedValue({ data })
  render(<TicketPanel />)
  fireEvent.click(screen.getByRole("button"))
  expect(await screen.findByRole("alert")).toBeInTheDocument()
})
