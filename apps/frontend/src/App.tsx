import { Routes, Route, NavLink, Link } from "react-router-dom";
import SearchPage from "./pages/SearchPage.js";
import HistoryPage from "./pages/HistoryPage.js";
import HistoryDetailPage from "./pages/HistoryDetailPage.js";

export default function App() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--color-line)] bg-[var(--color-surface)]">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6 sm:px-8">
          <Link to="/" className="text-base font-semibold tracking-tight text-[var(--color-ink)]">
            Autos <span className="font-normal text-[var(--color-ink-muted)]">Scraper</span>
          </Link>
          <nav className="flex h-full gap-1 text-sm">
            <NavItem to="/" label="Buscar" />
            <NavItem to="/history" label="Historial" />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10 sm:px-8">
        <Routes>
          <Route path="/" element={<SearchPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/history/:id" element={<HistoryDetailPage />} />
        </Routes>
      </main>
      <footer className="border-t border-[var(--color-line)] py-6 text-center text-xs text-[var(--color-ink-muted)]">
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
        `relative flex items-center px-3 font-medium transition-colors ${
          isActive
            ? "text-[var(--color-ink)]"
            : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
        }`
      }
    >
      {({ isActive }) => (
        <>
          {label}
          {isActive && (
            <span className="absolute -bottom-px left-3 right-3 h-0.5 bg-[var(--color-accent)]" />
          )}
        </>
      )}
    </NavLink>
  );
}
