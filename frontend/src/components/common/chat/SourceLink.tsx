import { useState, type ReactNode } from "react"
import { client } from "@/api/client"

export function SourceLink({ href, children }: { href?: string; children?: ReactNode }) {
  const [body, setBody] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const source = href?.match(/^\/api\/v1\/ai\/sources\/([a-z0-9-]+)$/)
  if (!source) return <a href={href} target="_blank" rel="noreferrer">{children}</a>
  const load = async () => {
    if (body !== null) { setBody(null); return }
    setLoading(true)
    setError(false)
    try {
      const { data } = await client.get<string>(`/ai/sources/${source[1]}`, { responseType: "text" })
      setBody(data)
    } catch { setError(true) }
    finally { setLoading(false) }
  }
  return <span>
    <button type="button" className="underline text-left" onClick={() => void load()} disabled={loading}>
      {children}{loading ? " — загружаю…" : ""}
    </button>
    {error && <span role="alert"> Источник недоступен.</span>}
    {body !== null && <span className="block whitespace-pre-wrap rounded bg-muted p-3 text-sm" role="region" aria-label="Текст источника">{body}</span>}
  </span>
}
