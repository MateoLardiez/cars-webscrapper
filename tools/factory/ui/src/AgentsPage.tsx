import { Bot } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRunningAgents } from "@/hooks/useRunningAgents";
import { formatElapsed } from "@/lib/runningAgent";

export function AgentsPage() {
  const { agents, error, loading } = useRunningAgents();
  const now = Date.now(); // re-evaluated on every poll, so the elapsed time stays fresh

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <header className="mb-6 flex items-center gap-3">
        <h1 className="text-2xl font-semibold">Agentes en curso</h1>
        {!loading && <Badge variant="secondary">{agents.length}</Badge>}
      </header>

      {error && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          No se pudo actualizar la lista ({error}).
        </p>
      )}

      {!loading && agents.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Bot />
            </EmptyMedia>
            <EmptyTitle>No hay agentes corriendo</EmptyTitle>
            <EmptyDescription>
              Cuando el dispatcher lance un agente, aparece acá con la task que tomó.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Task</TableHead>
              <TableHead>Rama</TableHead>
              <TableHead className="text-right">Corriendo hace</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {agents.map((agent) => (
              <TableRow key={agent.taskId}>
                <TableCell className="whitespace-normal">
                  <span className="font-medium">CW-{agent.taskNumber}</span> {agent.taskTitle}
                </TableCell>
                <TableCell className="font-mono text-xs">{agent.branch}</TableCell>
                <TableCell className="text-right">{formatElapsed(agent.startedAt, now)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </main>
  );
}
