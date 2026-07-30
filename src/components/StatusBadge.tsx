import { cn } from "@/lib/utils";

const map = {
  pendente: "bg-warning/15 text-warning border-warning/30",
  aprovado: "bg-success/15 text-success border-success/30",
  parcial: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  negado: "bg-destructive/15 text-destructive border-destructive/30",
  comprado: "bg-primary/15 text-primary border-primary/30",
  finalizado: "bg-info/15 text-info border-info/30",
  cancelado: "bg-muted text-muted-foreground border-border",
} as const;

const labels = { pendente: "Pendente", aprovado: "Aprovado", parcial: "Parcial", negado: "Negado", comprado: "Comprado", finalizado: "Finalizado", cancelado: "Cancelado" };

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

const cls = {
  otimo: "bg-success/15 text-success border-success/30",
  bom: "bg-primary/15 text-primary border-primary/30",
  regular: "bg-warning/15 text-warning border-warning/30",
  insuficiente: "bg-destructive/15 text-destructive border-destructive/30",
} as const;
const clsLabel = { otimo: "Ótimo", bom: "Bom", regular: "Regular", insuficiente: "Insuficiente" };

export function ClassificationBadge({ classification }: { classification: keyof typeof cls }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium", cls[classification])}>
      {clsLabel[classification]}
    </span>
  );
}

export function UrgenteBadge() {
  return (
    <span className="inline-flex items-center rounded-full border border-rose-600/30 bg-rose-600/15 px-2.5 py-0.5 text-xs font-medium text-rose-600">
      Urgente
    </span>
  );
}

export function ForaDoPrazoBadge() {
  return (
    <span className="inline-flex items-center rounded-full border border-amber-600/30 bg-amber-600/15 px-2.5 py-0.5 text-xs font-medium text-amber-600">
      Fora do prazo acordado
    </span>
  );
}

const situacaoCadastralClass: Record<string, string> = {
  ATIVA: "bg-success/15 text-success border-success/30",
};

export function SituacaoCadastralBadge({ descricao }: { descricao: string | null }) {
  const label = descricao || "—";
  const classes = situacaoCadastralClass[label.toUpperCase()] ?? "bg-destructive/15 text-destructive border-destructive/30";
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium", classes)}>
      {label}
    </span>
  );
}

export function SimplesNacionalBadge({ optante }: { optante: boolean | null }) {
  const classes = optante
    ? "bg-success/15 text-success border-success/30"
    : "bg-muted text-muted-foreground border-border";
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium", classes)}>
      Simples Nacional: {optante == null ? "—" : optante ? "Sim" : "Não"}
    </span>
  );
}
