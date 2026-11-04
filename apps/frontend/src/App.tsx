import { Routes, Route, NavLink, Link } from "react-router-dom";
import SearchPage from "./pages/SearchPage.js";
import HistoryPage from "./pages/HistoryPage.js";
import HistoryDetailPage from "./pages/HistoryDetailPage.js";

export default function App() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--color-line)]/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4 px-6 pt-10 pb-6 sm:px-8">
          <Link to="/" className="group">
            <div className="flex items-baseline gap-3">
              <h1 className="font-serif text-5xl italic tracking-tight text-[var(--color-ink)]">
                Autos
              </h1>
              <span className="font-mono text-xs uppercase tracking-wider text-[var(--color-amber)]">
                / scraper
              </span>
            </div>
            <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
              Extracción autónoma de anuncios
            </p>
          </Link>
          <nav className="flex gap-1 font-mono text-xs uppercase tracking-wider">
            <NavItem to="/" label="Buscar" />
            <NavItem to="/history" label="Historial" />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-12 sm:px-8">
        <Routes>
          <Route path="/" element={<SearchPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/history/:id" element={<HistoryDetailPage />} />
        </Routes>
      </main>
      <footer className="border-t border-[var(--color-line)]/60 py-6 text-center text-xs text-[var(--color-ink-muted)]">
        Impulsado por Claude Agent SDK y Playwright MCP
      </footer>
    </div>
  );
}

function NavItem({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        `relative px-4 py-2 transition-colors ${
          isActive
            ? "text-[var(--color-amber)]"
            : "text-[var(--color-ink-dim)] hover:text-[var(--color-ink)]"
        }`
      }
    >
      {({ isActive }) => (
        <>
          {label}
          {isActive && (
            <span className="absolute -bottom-px left-4 right-4 h-px bg-[var(--color-amber)]" />
          )}
        </>
      )}
    </NavLink>
  );
}
