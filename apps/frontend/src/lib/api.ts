import type { Catalog, Search, SearchFilters, Car, SseEvent } from "@cars-webscrapper/shared";

export async function listSearches(): Promise<Search[]> {
  const res = await fetch("/searches");
  return res.json();
}

export async function getSearch(id: number): Promise<Search & { cars: Car[] }> {
  const res = await fetch(`/searches/${id}`);
  return res.json();
}

export async function getCatalog(): Promise<Catalog> {
  const res = await fetch("/catalog");
  if (!res.ok) throw new Error(`No se pudo cargar el catálogo (HTTP ${res.status})`);
  return res.json();
}

export async function streamSearch(
  filters: SearchFilters,
  onEvent: (event: SseEvent) => void
): Promise<void> {
  const res = await fetch("/searches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(filters),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `La búsqueda falló (HTTP ${res.status})`);
  }

  if (!res.body) throw new Error("No response body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      const line = chunk.trim();
      if (!line.startsWith("data:")) continue;
      try {
        const event = JSON.parse(line.slice(5).trim()) as SseEvent;
        onEvent(event);
      } catch {
        // ignore malformed chunks
      }
    }
  }
}
