import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const bootstrap = vi.hoisted(() => ({
  render: vi.fn(),
  start: vi.fn(),
  createRoot: vi.fn(),
}))
// Bootstrap's boundary is React's renderer, not the application components.
vi.mock("react-dom/client", () => ({ createRoot: bootstrap.createRoot }))
vi.mock("./mocks/browser", () => ({ worker: { start: bootstrap.start } }))
vi.mock("./index.css", () => ({}))

beforeEach(() => {
  vi.resetModules()
  bootstrap.createRoot.mockReturnValue({ render: bootstrap.render })
  bootstrap.start.mockResolvedValue(undefined)
  document.body.innerHTML = '<div id="root"></div>'
})
afterEach(() => {
  vi.unstubAllEnvs()
  document.body.innerHTML = ""
})

describe("application bootstrap", () => {
  it("renders without starting MSW when mocks are disabled", async () => {
    vi.stubEnv("VITE_ENABLE_MOCKS", "false")
    await import("./main")
    expect(bootstrap.start).not.toHaveBeenCalled()
    expect(bootstrap.createRoot).toHaveBeenCalledWith(
      document.getElementById("root")
    )
    expect(bootstrap.render).toHaveBeenCalledOnce()
  })

  it("awaits MSW startup before mounting the application", async () => {
    vi.stubEnv("VITE_ENABLE_MOCKS", "true")
    let ready: (() => void) | undefined
    bootstrap.start.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          ready = resolve
        })
    )
    await import("./main")
    await vi.waitFor(() => expect(bootstrap.start).toHaveBeenCalledOnce())
    expect(bootstrap.render).not.toHaveBeenCalled()
    ready!()
    await vi.waitFor(() => expect(bootstrap.render).toHaveBeenCalledOnce())
    expect(bootstrap.start).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceWorker: { url: "/mockServiceWorker.js" },
      })
    )
  })

  it("shows an accessible startup error when the worker cannot start", async () => {
    vi.stubEnv("VITE_ENABLE_MOCKS", "true")
    bootstrap.start.mockRejectedValueOnce(new Error("Worker unavailable"))
    await import("./main")
    await vi.waitFor(() =>
      expect(document.getElementById("root")).toHaveAttribute("role", "alert")
    )
    expect(document.getElementById("root")).toHaveTextContent(
      "Не удалось запустить приложение"
    )
    expect(bootstrap.render).not.toHaveBeenCalled()
  })

  it("handles an absent mount element without a secondary error", async () => {
    vi.stubEnv("VITE_ENABLE_MOCKS", "false")
    document.body.innerHTML = ""
    bootstrap.createRoot.mockImplementationOnce(() => {
      throw new Error("Missing root")
    })
    await import("./main")
    await vi.waitFor(() =>
      expect(bootstrap.createRoot).toHaveBeenCalledWith(null)
    )
    expect(bootstrap.render).not.toHaveBeenCalled()
  })
})
