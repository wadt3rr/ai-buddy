import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { vi, expect, it } from "vitest"
import { client } from "@/api/client"
import { SourceLink } from "./SourceLink"

it("loads source using the authenticated API and toggles it", async () => {
  vi.spyOn(client, "get").mockResolvedValue({ data: "Source Python 3.12" })
  render(<SourceLink href="/api/v1/ai/sources/listing-readme">README</SourceLink>)
  fireEvent.click(screen.getByRole("button"))
  expect(await screen.findByRole("region")).toHaveTextContent("Python 3.12")
  expect(client.get).toHaveBeenCalledWith("/ai/sources/listing-readme", { responseType: "text" })
  fireEvent.click(screen.getByRole("button"))
  expect(screen.queryByRole("region")).not.toBeInTheDocument()
})

it("shows source errors", async () => {
  vi.spyOn(client, "get").mockRejectedValue(new Error("denied"))
  render(<SourceLink href="/api/v1/ai/sources/private">Private</SourceLink>)
  fireEvent.click(screen.getByRole("button"))
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("недоступен"))
})

it("renders external links normally", () => {
  render(<SourceLink href="https://example.com">External</SourceLink>)
  expect(screen.getByRole("link")).toHaveAttribute("rel", "noreferrer")
})
