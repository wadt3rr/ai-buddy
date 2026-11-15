// jsdom has no OS color scheme. Retain real event subscriptions for theme tests.
class TestMediaQueryList extends EventTarget implements MediaQueryList {
  readonly media: string
  matches = false
  onchange:
    ((this: MediaQueryList, ev: MediaQueryListEvent) => unknown) | null = null

  constructor(query: string) {
    super()
    this.media = query
  }

  addListener(
    listener:
      ((this: MediaQueryList, ev: MediaQueryListEvent) => unknown) | null
  ) {
    if (listener) this.addEventListener("change", listener as EventListener)
  }

  removeListener(
    listener:
      ((this: MediaQueryList, ev: MediaQueryListEvent) => unknown) | null
  ) {
    if (listener) this.removeEventListener("change", listener as EventListener)
  }

  setMatches(matches: boolean) {
    this.matches = matches
    const event = Object.assign(new Event("change"), {
      matches,
      media: this.media,
    }) as MediaQueryListEvent
    this.dispatchEvent(event)
    this.onchange?.call(this, event)
  }
}

let queries = new Map<string, TestMediaQueryList>()

export function resetMedia() {
  queries = new Map()
}

export function matchMedia(query: string): MediaQueryList {
  let media = queries.get(query)
  if (!media) {
    media = new TestMediaQueryList(query)
    queries.set(query, media)
  }
  return media
}

export function setMediaMatch(query: string, matches: boolean) {
  matchMedia(query)
  queries.get(query)!.setMatches(matches)
}
