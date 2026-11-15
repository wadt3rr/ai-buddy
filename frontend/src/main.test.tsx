import { beforeEach, afterEach, describe, expect, it, vi } from "vitest"
const bootstrap = vi.hoisted(() => ({ render: vi.fn(), createRoot: vi.fn() }))
vi.mock("react-dom/client", () => ({ createRoot: bootstrap.createRoot }))
vi.mock("./index.css", () => ({}))
beforeEach(() => {
  vi.resetModules()
  bootstrap.createRoot.mockReturnValue({ render: bootstrap.render })
  document.body.innerHTML = '<div id="root"></div>'
})
afterEach(() => {
  vi.unstubAllEnvs()
  document.body.innerHTML = ""
})
describe("application bootstrap", () => {
  it.each(["true", "false"])(
    "renders against backend regardless of legacy mock flag %s",
    async (flag) => {
      vi.stubEnv("VITE_ENABLE_MOCKS", flag)
      await import("./main")
      expect(bootstrap.render).toHaveBeenCalledOnce()
    }
  )
  it("shows an accessible error if mounting fails", async () => {
    bootstrap.createRoot.mockImplementationOnce(() => {
      throw new Error("Mount failed")
    })
    await import("./main")
    await vi.waitFor(() =>
      expect(document.getElementById("root")).toHaveAttribute("role", "alert")
    )
    expect(bootstrap.render).not.toHaveBeenCalled()
  })
  it("handles an absent mount element", async () => {
    document.body.innerHTML = ""
    bootstrap.createRoot.mockImplementationOnce(() => {
      throw new Error("Missing root")
    })
    await import("./main")
    expect(bootstrap.render).not.toHaveBeenCalled()
  })
})
