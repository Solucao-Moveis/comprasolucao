import { cn } from "@/lib/utils";

const map = {
  pendente: "bg-warning/15 text-warning border-warning/30",
  aprovado: "bg-success/15 text-success border-success/30",
  negado: "bg-destructive/15 text-destructive border-destructive/30",
  finalizado: "bg-info/15 text-info border-info/30",
} as const;

const labels = { pendente: "Pendente", aprovado: "Aprovado", negado: "Negado", finalizado: "Finalizado" };

export function StatusBadge({ status }: { status: keyof typeof map }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium", map[status])}>
      {labels[status]}
    </span>
  );
}

const prio = {
  baixa: "bg-muted text-muted-foreground border-border",
  media: "bg-info/15 text-info border-info/30",
  alta: "bg-destructive/15 text-destructive border-destructive/30",
} as const;
const prioLabel = { baixa: "Baixa", media: "Média", alta: "Alta" };

export function PriorityBadge({ priority }: { priority: keyof typeof prio }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium", prio[priority])}>
      {prioLabel[priority]}
    </span>
  );
}
