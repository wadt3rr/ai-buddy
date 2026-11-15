import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest"
import { client } from "@/api/client"
import { server } from "./server"
import { matchMedia, resetMedia } from "./media"

// Only missing browser platform APIs are supplied; UI components are rendered unchanged.
class TestResizeObserver implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (!HTMLElement.prototype.scrollTo) {
  HTMLElement.prototype.scrollTo = function (
    options?: ScrollToOptions | number
  ) {
    if (typeof options === "object" && options.top !== undefined)
      this.scrollTop = options.top
  }
}

// Fetch in Node requires absolute URLs; the browser supports relative URLs natively.
const nativeFetch = globalThis.fetch
globalThis.fetch = (input, init) =>
  nativeFetch(
    typeof input === "string"
      ? new URL(input, window.location.origin).href
      : input,
    init
  )
client.defaults.baseURL = new URL(
  client.defaults.baseURL ?? "/api",
  window.location.origin
).href

beforeAll(() => server.listen({ onUnhandledFrame: "error" }))
beforeEach(() => {
  localStorage.clear()
  document.documentElement.className = ""
  document.documentElement.style.colorScheme = ""
  resetMedia()
  vi.stubGlobal("matchMedia", vi.fn(matchMedia))
  vi.stubGlobal("ResizeObserver", TestResizeObserver)
  document.cookie.split(";").forEach((cookie) => {
    document.cookie = `${cookie.split("=")[0].trim()}=; Max-Age=0; Path=/`
  })
})
afterEach(() => {
  cleanup()
  server.resetHandlers()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
afterAll(() => server.close())
