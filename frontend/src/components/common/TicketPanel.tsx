import { useEffect, useState } from "react"
import { client, isRecord, toApiError } from "@/api/client"
import { Button } from "@/components/ui/button"

type Ticket = { id: string; kind: string; status: string; created_at: string | null; payload: Record<string, unknown> }

function readTickets(data: unknown): Ticket[] {
  if (!isRecord(data) || !Array.isArray(data.tickets)) throw new Error("Не удалось прочитать обращения.")
  return data.tickets.map((ticket: unknown) => {
    if (!isRecord(ticket) || typeof ticket.id !== "string" || typeof ticket.kind !== "string" ||
      typeof ticket.status !== "string" || !isRecord(ticket.payload) ||
      !(ticket.created_at === null || (typeof ticket.created_at === "string" && Number.isFinite(Date.parse(ticket.created_at))))) {
      throw new Error("Не удалось прочитать обращение.")
    }
    return ticket as Ticket
  })
}

export function TicketPanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const [open, setOpen] = useState(false)
  const [retry, setRetry] = useState(0)
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const { data } = await client.get<unknown>("/ai/tickets", { signal: controller.signal })
        if (!controller.signal.aborted) setTickets(readTickets(data))
      } catch (cause) {
        if (!controller.signal.aborted) setError(toApiError(cause).message)
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    })()
    return () => controller.abort()
  }, [open, retry, refreshKey])
  return <div>
    <Button size="sm" variant="outline" onClick={() => setOpen(!open)} aria-label="Мои обращения" aria-expanded={open} aria-controls="ticket-panel">Обращения</Button>
    {open && <section id="ticket-panel" role="region" aria-label="Мои обращения"
      className="fixed right-4 top-20 z-50 max-h-[calc(100dvh-6rem)] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto rounded-2xl border bg-background p-5 shadow-xl">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Мои обращения</h2>
        <Button variant="ghost" onClick={() => setOpen(false)}>Закрыть</Button>
      </div>
      {loading ? <p role="status">Загружаем обращения…</p> : error ? <div>
        <p role="alert">{error}</p><Button onClick={() => setRetry(retry + 1)}>Повторить</Button>
      </div> : tickets.length === 0 ? <p>Пока нет обращений. Здесь появятся вопросы наставнику и запросы на обновление документации.</p> :
        <ul className="space-y-3">{tickets.map(ticket => <li key={ticket.id} className="rounded-xl border p-4">
          <div className="flex items-center justify-between gap-2"><strong>{ticket.id}</strong><span className="text-sm">{ticket.status === "open" ? "Открыто" : ticket.status}</span></div>
          <p className="mt-1 font-medium">{ticket.kind === "mentor" ? "Помощь наставника" : "Обновление документации"}</p>
          {typeof ticket.payload.service === "string" && <p className="text-sm text-muted-foreground">{ticket.payload.service}</p>}
          {typeof ticket.payload.question === "string" && <p className="mt-2 whitespace-pre-wrap text-sm">{ticket.payload.question}</p>}
          {typeof ticket.payload.reason === "string" && <p className="mt-2 text-sm">{ticket.payload.reason}</p>}
          {Array.isArray(ticket.payload.recipients) && <p className="mt-2 text-sm">Получатели: {ticket.payload.recipients.filter((r): r is string => typeof r === "string").join(", ")}</p>}
          {ticket.created_at && <time className="mt-2 block text-xs text-muted-foreground" dateTime={ticket.created_at}>{new Date(ticket.created_at).toLocaleString("ru-RU")}</time>}
        </li>)}</ul>}
    </section>}
  </div>
}
