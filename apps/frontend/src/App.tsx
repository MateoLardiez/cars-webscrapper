import { Routes, Route, NavLink, Link } from "react-router-dom";
import SearchPage from "./pages/SearchPage.js";
import HistoryPage from "./pages/HistoryPage.js";
import HistoryDetailPage from "./pages/HistoryDetailPage.js";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function App() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6 sm:px-8">
          <Link to="/" className="text-base font-semibold tracking-tight">
            Autos <span className="font-normal text-muted-foreground">Scraper</span>
          </Link>
          <nav className="flex gap-1">
            <NavItem to="/" label="Buscar" />
            <NavItem to="/history" label="Historial" />
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10 sm:px-8">
        <Routes>
          <Route path="/" element={<SearchPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/history/:id" element={<HistoryDetailPage />} />
        </Routes>
      </main>
      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        Impulsado por Claude Agent SDK y Playwright MCP
      </footer>
    </div>
  );
}

// NavLink con la misma apariencia que un Button de shadcn: el enlace activo se resalta.
function NavItem({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        cn(
          buttonVariants({ variant: isActive ? "secondary" : "ghost", size: "default" }),
          !isActive && "text-muted-foreground"
        )
      }
    >
      {label}
    </NavLink>
  );
}
