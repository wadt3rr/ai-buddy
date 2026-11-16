import { UserDropdown } from "./UserDropdown"
import { TicketPanel } from "./TicketPanel"

export const Header = ({ ticketRefreshKey = 0 }: { ticketRefreshKey?: number }) => {
  return (
    <header className="relative z-50 w-full bg-background/10 backdrop-blur-xl">
      <div className="mx-auto flex h-18 w-full max-w-7xl items-center justify-between px-5 sm:px-8">
        <div className="relative flex items-center">
          <a
            href="/"
            className="relative z-10 font-heading text-2xl font-bold tracking-tight"
          >
            AI-Buddy
          </a>

          <div className="absolute top-6 left-[95%] z-20 hidden w-max sm:block">
            <div className="relative px-2 py-1">
              <div className="absolute inset-0 -rotate-2 bg-avito-green-light" />

              <span className="relative block font-caveat text-base whitespace-nowrap text-black sm:text-xl">
                Начни с большего
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2"><TicketPanel refreshKey={ticketRefreshKey} /><UserDropdown /></div>
      </div>
    </header>
  )
}
