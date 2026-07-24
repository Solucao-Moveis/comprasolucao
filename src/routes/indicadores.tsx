import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend, CartesianGrid } from "recharts";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { prazoLimiteEntregaDias } from "@/lib/sla";

export const Route = createFileRoute("/indicadores")({
  component: () => <AppLayout><Indicadores /></AppLayout>,
});

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const monthLabel = (key: string) => {
  const [y, m] = key.split("-");
  return `${m}/${y.slice(2)}`;
};

const LINE_COLORS = {
  abertaTardia: "oklch(0.6 0.22 25)",
  foraDoPrazoAcordado: "oklch(0.78 0.15 75)",
  entregueNoPrazo: "oklch(0.62 0.16 150)",
  fornecedorCumpriu: "oklch(0.52 0.18 255)",
};

function Indicadores() {
  const { data } = useQuery({
    queryKey: ["indicadores"],
    queryFn: async () => {
      const { data: requests } = await supabase
        .from("purchase_requests")
        .select("id,number,status,needed_by,created_at,decided_at,purchased_at,arrived_at,sectors(code,name),tipo_compra,urgente,expected_delivery_date,fora_do_prazo_acordado" as any);
      return requests ?? [];
    },
  });

  const list = (data ?? []) as any[];

  // Indicadores calculados por SC — mesma regra usada no aviso de criação (Fase 1) e no
  // cálculo do prazo-limite de entrega (Fase 2), sem gravar nada novo no banco.
  const rows = useMemo(() => list.map((r: any) => {
    const prazoDias = prazoLimiteEntregaDias(r.tipo_compra, r.urgente);
    let abertaTardia: boolean | null = null;
    if (prazoDias != null && r.created_at && r.needed_by) {
      const createdDay = new Date(r.created_at);
      createdDay.setHours(0, 0, 0, 0);
      const minDate = new Date(createdDay.getFullYear(), createdDay.getMonth(), createdDay.getDate() + prazoDias);
      const neededDate = new Date(`${r.needed_by}T00:00:00`);
      abertaTardia = neededDate < minDate;
    }

    const foraDoPrazoAcordado: boolean | null = r.expected_delivery_date ? !!r.fora_do_prazo_acordado : null;

    const entregueNoPrazo: boolean | null = r.arrived_at && r.needed_by
      ? (r.arrived_at as string).slice(0, 10) <= r.needed_by
      : null;

    const fornecedorCumpriu: boolean | null = r.arrived_at && r.expected_delivery_date
      ? (r.arrived_at as string).slice(0, 10) <= r.expected_delivery_date
      : null;

    return { ...r, abertaTardia, foraDoPrazoAcordado, entregueNoPrazo, fornecedorCumpriu };
  }), [list]);

  // Gráfico 1 — saúde de prazo (%), uma série por indicador, cada um com seu mês de referência
  const slaSeries = useMemo(() => {
    const buckets = new Map<string, { at: { y: number; t: number }; fp: { y: number; t: number }; en: { y: number; t: number }; fc: { y: number; t: number } }>();
    const ensure = (key: string) => {
      if (!buckets.has(key)) buckets.set(key, { at: { y: 0, t: 0 }, fp: { y: 0, t: 0 }, en: { y: 0, t: 0 }, fc: { y: 0, t: 0 } });
      return buckets.get(key)!;
    };
    for (const r of rows) {
      if (r.abertaTardia != null && r.created_at) {
        const b = ensure(monthKey(new Date(r.created_at)));
        b.at.t++; if (r.abertaTardia) b.at.y++;
      }
      if (r.foraDoPrazoAcordado != null && r.decided_at) {
        const b = ensure(monthKey(new Date(r.decided_at)));
        b.fp.t++; if (r.foraDoPrazoAcordado) b.fp.y++;
      }
      if (r.entregueNoPrazo != null && r.arrived_at) {
        const b = ensure(monthKey(new Date(r.arrived_at)));
        b.en.t++; if (r.entregueNoPrazo) b.en.y++;
      }
      if (r.fornecedorCumpriu != null && r.arrived_at) {
        const b = ensure(monthKey(new Date(r.arrived_at)));
        b.fc.t++; if (r.fornecedorCumpriu) b.fc.y++;
      }
    }
    const pct = (b: { y: number; t: number }) => (b.t > 0 ? Math.round((b.y / b.t) * 100) : null);
    return Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, b]) => ({
        month: monthLabel(key),
        "SC aberta tardia": pct(b.at),
        "Fora do prazo acordado": pct(b.fp),
        "Entregue no prazo": pct(b.en),
        "Fornecedor cumpriu o prometido": pct(b.fc),
      }));
  }, [rows]);

  // Gráfico 2 — tempos médios (dias), mesmo padrão do /dashboard antigo, em série mensal
  const durationSeries = useMemo(() => {
    const buckets = new Map<string, { ca: number[]; ac: number[]; cc: number[] }>();
    const ensure = (key: string) => {
      if (!buckets.has(key)) buckets.set(key, { ca: [], ac: [], cc: [] });
      return buckets.get(key)!;
    };
    for (const r of rows) {
      if (r.decided_at && r.created_at) {
        const days = (new Date(r.decided_at).getTime() - new Date(r.created_at).getTime()) / 86400000;
        ensure(monthKey(new Date(r.decided_at))).ca.push(days);
      }
      if (r.purchased_at && r.decided_at) {
        const days = (new Date(r.purchased_at).getTime() - new Date(r.decided_at).getTime()) / 86400000;
        ensure(monthKey(new Date(r.purchased_at))).ac.push(days);
      }
      if (r.arrived_at && r.purchased_at) {
        const days = (new Date(r.arrived_at).getTime() - new Date(r.purchased_at).getTime()) / 86400000;
        ensure(monthKey(new Date(r.arrived_at))).cc.push(days);
      }
    }
    const avg = (arr: number[]) => (arr.length ? Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1)) : null);
    return Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, b]) => ({
        month: monthLabel(key),
        "Abertura → Aprovação": avg(b.ca),
        "Aprovação → Compra": avg(b.ac),
        "Compra → Chegada": avg(b.cc),
      }));
  }, [rows]);

  // Tabela de dados brutos — 1 linha por SC, paginada
  const [page, setPage] = useState(0);
  const pageSize = 25;
  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [rows]
  );
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const pageRows = sortedRows.slice(page * pageSize, page * pageSize + pageSize);

  const tipoLabel = (t: string | null) => (t === "materia_prima" ? "Matéria-prima" : t === "insumos_outros" ? "Insumos/Outros" : "—");
  const Flag = ({ v }: { v: boolean | null }) =>
    v == null ? <span className="text-muted-foreground">—</span> : v ? <span className="font-semibold text-success">✓</span> : <span className="font-semibold text-destructive">✗</span>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Indicadores</h1>
        <p className="text-sm text-muted-foreground">Tendência mensal de prazo e SLA das solicitações de compra</p>
      </div>

      <Card className="p-5">
        <h3 className="mb-4 text-sm font-semibold">Saúde de prazo (%)</h3>
        {slaSeries.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Sem dados ainda</p>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={slaSeries} margin={{ top: 10, right: 16, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.015 250)" />
              <XAxis dataKey="month" stroke="oklch(0.5 0.03 255)" fontSize={11} />
              <YAxis domain={[0, 100]} stroke="oklch(0.5 0.03 255)" fontSize={11} tickFormatter={(v) => `${v}%`} />
              <Tooltip contentStyle={{ background: "oklch(1 0 0)", border: "1px solid oklch(0.9 0.015 250)", borderRadius: 8 }} formatter={(v: number) => `${v}%`} />
              <Legend />
              <Line type="monotone" dataKey="SC aberta tardia" stroke={LINE_COLORS.abertaTardia} connectNulls strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Fora do prazo acordado" stroke={LINE_COLORS.foraDoPrazoAcordado} connectNulls strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Entregue no prazo" stroke={LINE_COLORS.entregueNoPrazo} connectNulls strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Fornecedor cumpriu o prometido" stroke={LINE_COLORS.fornecedorCumpriu} connectNulls strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card className="p-5">
        <h3 className="mb-4 text-sm font-semibold">Tempos médios (dias)</h3>
        {durationSeries.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Sem dados ainda</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={durationSeries} margin={{ top: 10, right: 16, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.015 250)" />
              <XAxis dataKey="month" stroke="oklch(0.5 0.03 255)" fontSize={11} />
              <YAxis stroke="oklch(0.5 0.03 255)" fontSize={11} tickFormatter={(v) => `${v}d`} />
              <Tooltip contentStyle={{ background: "oklch(1 0 0)", border: "1px solid oklch(0.9 0.015 250)", borderRadius: 8 }} formatter={(v: number) => `${v} dias`} />
              <Legend />
              <Line type="monotone" dataKey="Abertura → Aprovação" stroke="oklch(0.65 0.13 230)" connectNulls strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Aprovação → Compra" stroke="oklch(0.6 0.15 300)" connectNulls strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Compra → Chegada" stroke="oklch(0.55 0.2 20)" connectNulls strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Dados brutos ({sortedRows.length} solicitações)</h3>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            Página {page + 1} de {totalPages}
            <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-sm">
            <thead className="sticky top-0 bg-background text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-2 py-2">SC</th>
                <th className="px-2 py-2">Tipo</th>
                <th className="px-2 py-2">Urgente</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Necessidade</th>
                <th className="px-2 py-2">Abertura</th>
                <th className="px-2 py-2">Aprovação</th>
                <th className="px-2 py-2">Compra</th>
                <th className="px-2 py-2">Prevista</th>
                <th className="px-2 py-2">Real</th>
                <th className="px-2 py-2 text-center">Aberta tardia</th>
                <th className="px-2 py-2 text-center">Fora do prazo</th>
                <th className="px-2 py-2 text-center">Entregue no prazo</th>
                <th className="px-2 py-2 text-center">Fornecedor cumpriu</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r: any) => (
                <tr key={r.id} className="border-t">
                  <td className="px-2 py-2 font-mono text-xs">
                    <Link to="/requests/$id" params={{ id: r.id }} className="text-primary hover:underline">{r.number}</Link>
                  </td>
                  <td className="px-2 py-2 text-xs">{tipoLabel(r.tipo_compra)}</td>
                  <td className="px-2 py-2 text-xs">{r.urgente ? "Sim" : "—"}</td>
                  <td className="px-2 py-2 text-xs capitalize text-muted-foreground">{r.status}</td>
                  <td className="px-2 py-2 text-xs">{r.needed_by ? format(new Date(`${r.needed_by}T00:00:00`), "dd/MM/yyyy") : "—"}</td>
                  <td className="px-2 py-2 text-xs">{r.created_at ? format(new Date(r.created_at), "dd/MM/yyyy") : "—"}</td>
                  <td className="px-2 py-2 text-xs">{r.decided_at ? format(new Date(r.decided_at), "dd/MM/yyyy") : "—"}</td>
                  <td className="px-2 py-2 text-xs">{r.purchased_at ? format(new Date(r.purchased_at), "dd/MM/yyyy") : "—"}</td>
                  <td className="px-2 py-2 text-xs">{r.expected_delivery_date ? format(new Date(`${r.expected_delivery_date}T00:00:00`), "dd/MM/yyyy") : "—"}</td>
                  <td className="px-2 py-2 text-xs">{r.arrived_at ? format(new Date(r.arrived_at), "dd/MM/yyyy") : "—"}</td>
                  <td className="px-2 py-2 text-center"><Flag v={r.abertaTardia} /></td>
                  <td className="px-2 py-2 text-center"><Flag v={r.foraDoPrazoAcordado} /></td>
                  <td className="px-2 py-2 text-center"><Flag v={r.entregueNoPrazo} /></td>
                  <td className="px-2 py-2 text-center"><Flag v={r.fornecedorCumpriu} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
