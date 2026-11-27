import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AgentsPage } from "./AgentsPage";
import "./index.css";

// The app has a single page, /agents. Any other path is rewritten to it.
if (window.location.pathname !== "/agents") {
  window.history.replaceState(null, "", "/agents");
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <AgentsPage />
  </StrictMode>,
);
