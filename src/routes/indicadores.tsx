import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "@tanstack/react-router";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend, CartesianGrid, BarChart, Bar, PieChart, Pie, Cell, LabelList } from "recharts";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight, TrendingUp, AlertTriangle } from "lucide-react";
import { prazoLimiteEntregaDias } from "@/lib/sla";

export const Route = createFileRoute("/indicadores")({
  component: () => <AppLayout><Indicadores /></AppLayout>,
});

// Mesmo prazo máximo de processamento (aprovação → compra) já usado no /dashboard antigo
const PROCESSAMENTO_SLA_HORAS = 36;

const COLORS = ["oklch(0.78 0.15 75)", "oklch(0.62 0.16 150)", "oklch(0.6 0.22 25)", "oklch(0.65 0.13 230)"];

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
        .select("id,number,status,description,quantity,unit,needed_by,created_at,decided_at,purchased_at,arrived_at,sector_id,purchase_amount,cost_center_id,sectors(code,name),cost_centers(code,name),items(code,description),tipo_compra,urgente,expected_delivery_date,fora_do_prazo_acordado" as any);
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

  // Filtro de período (De/Até), aplicado aos dois gráficos e à tabela
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      for (const field of [r.created_at, r.decided_at, r.purchased_at, r.arrived_at]) {
        if (field) set.add(monthKey(new Date(field)));
      }
    }
    return Array.from(set).sort();
  }, [rows]);
  const [fromMonth, setFromMonth] = useState<string>("");
  const [toMonth, setToMonth] = useState<string>("");
  const inRange = (key: string) => (!fromMonth || key >= fromMonth) && (!toMonth || key <= toMonth);
  const periodLabel = fromMonth || toMonth
    ? `${fromMonth ? monthLabel(fromMonth) : "início"}–${toMonth ? monthLabel(toMonth) : "atual"}`
    : null;

  // Solicitações por setor / distribuição por status — respeitam o filtro De/Até (mês de abertura)
  const openedInRange = useMemo(
    () => rows.filter((r: any) => !r.created_at || inRange(monthKey(new Date(r.created_at)))),
    [rows, fromMonth, toMonth]
  );

  const counts = {
    pendente: openedInRange.filter((r) => r.status === "pendente").length,
    aprovado: openedInRange.filter((r) => r.status === "aprovado").length,
    negado: openedInRange.filter((r) => r.status === "negado").length,
    comprado: openedInRange.filter((r) => r.status === "comprado").length,
    finalizado: openedInRange.filter((r) => r.status === "finalizado").length,
  };

  const bySector = Object.values(
    openedInRange.reduce((acc: Record<string, { name: string; total: number }>, r: any) => {
      const name = r.sectors ? `${r.sectors.code} — ${r.sectors.name}` : "—";
      acc[name] = acc[name] ?? { name, total: 0 };
      acc[name].total++;
      return acc;
    }, {})
  );

  const byStatus = [
    { name: "Pendente", value: counts.pendente },
    { name: "Aprovado", value: counts.aprovado },
    { name: "Negado", value: counts.negado },
    { name: "Comprado", value: counts.comprado },
    { name: "Finalizado", value: counts.finalizado },
  ];

  // Valor de compras por centro de custo — mesmo filtro De/Até, aplicado sobre o mês da compra
  const [ccDetail, setCcDetail] = useState<string | null>(null);

  const purchasesList = useMemo(
    () => rows.filter((r: any) => r.purchase_amount && r.purchased_at && inRange(monthKey(new Date(r.purchased_at)))),
    [rows, fromMonth, toMonth]
  );

  const purchaseTotal = (r: any) => Number(r.purchase_amount || 0);
  const byCostCenter = Object.values(
    purchasesList.reduce((acc: Record<string, { name: string; total: number }>, r: any) => {
      const name = r.cost_centers ? r.cost_centers.name : "Sem CC";
      acc[name] = acc[name] ?? { name, total: 0 };
      acc[name].total += purchaseTotal(r);
      return acc;
    }, {})
  );
  const totalSpent = byCostCenter.reduce((sum, c: any) => sum + c.total, 0);
  const fmtBRL = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const ccDetailRows = ccDetail
    ? purchasesList.filter((r: any) => (r.cost_centers ? r.cost_centers.name : "Sem CC") === ccDetail)
    : [];
  const ccDetailTotal = ccDetailRows.reduce((s, r: any) => s + purchaseTotal(r), 0);

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
      .filter(([key]) => inRange(key))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, b]) => ({
        month: monthLabel(key),
        "SC aberta tardia": pct(b.at),
        "Fora do prazo acordado": pct(b.fp),
        "Entregue no prazo": pct(b.en),
        "Fornecedor cumpriu o prometido": pct(b.fc),
      }));
  }, [rows, fromMonth, toMonth]);

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
      .filter(([key]) => inRange(key))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, b]) => ({
        month: monthLabel(key),
        "Abertura → Aprovação": avg(b.ca),
        "Aprovação → Compra": avg(b.ac),
        "Compra → Chegada": avg(b.cc),
      }));
  }, [rows, fromMonth, toMonth]);

  // Médias do mês atual (mesmos 3 tempos do gráfico 2, só o mês corrente, pra visão rápida).
  // Guardadas em horas — Abertura→Aprovação e Aprovação→Compra são exibidas em horas
  // (comparam direto com o SLA de processamento de 36h/24h), Compra→Chegada em dias.
  const currentMonthAverages = useMemo(() => {
    const nowKey = monthKey(new Date());
    const ca: number[] = [], ac: number[] = [], cc: number[] = [];
    for (const r of rows) {
      if (r.decided_at && r.created_at && monthKey(new Date(r.decided_at)) === nowKey) {
        ca.push((new Date(r.decided_at).getTime() - new Date(r.created_at).getTime()) / 36e5);
      }
      if (r.purchased_at && r.decided_at && monthKey(new Date(r.purchased_at)) === nowKey) {
        ac.push((new Date(r.purchased_at).getTime() - new Date(r.decided_at).getTime()) / 36e5);
      }
      if (r.arrived_at && r.purchased_at && monthKey(new Date(r.arrived_at)) === nowKey) {
        cc.push((new Date(r.arrived_at).getTime() - new Date(r.purchased_at).getTime()) / 36e5);
      }
    }
    const avg = (arr: number[]) => (arr.length ? Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1)) : null);
    return { caHoras: avg(ca), acHoras: avg(ac), ccDias: cc.length ? Number((cc.reduce((a, b) => a + b, 0) / cc.length / 24).toFixed(1)) : null };
  }, [rows]);

  // Tabela de dados brutos — 1 linha por SC (filtrada pelo mês de abertura), paginada
  const [page, setPage] = useState(0);
  const pageSize = 25;
  const sortedRows = useMemo(
    () => rows
      .filter((r: any) => !r.created_at || inRange(monthKey(new Date(r.created_at))))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [rows, fromMonth, toMonth]
  );
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  useEffect(() => setPage(0), [fromMonth, toMonth]);
  const pageRows = sortedRows.slice(page * pageSize, page * pageSize + pageSize);

  const tipoLabel = (t: string | null) => (t === "materia_prima" ? "Matéria-prima" : t === "insumos_outros" ? "Insumos/Outros" : "—");
  const Flag = ({ v }: { v: boolean | null }) =>
    v == null ? <span className="text-muted-foreground">—</span> : v ? <span className="font-semibold text-success">✓</span> : <span className="font-semibold text-destructive">✗</span>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <TrendingUp className="h-4 w-4" />
            Abertura → Aprovação (mês atual)
          </div>
          <div className="mt-1 text-3xl font-bold">{currentMonthAverages.caHoras != null ? `${currentMonthAverages.caHoras} h` : "—"}</div>
        </Card>
        <Card className={currentMonthAverages.acHoras != null && currentMonthAverages.acHoras > PROCESSAMENTO_SLA_HORAS ? "p-5 border-destructive/50 bg-destructive/5" : "p-5"}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <TrendingUp className="h-4 w-4" />
              Aprovação → Compra (mês atual)
            </div>
            {currentMonthAverages.acHoras != null && currentMonthAverages.acHoras > PROCESSAMENTO_SLA_HORAS && (
              <AlertTriangle className="h-4 w-4 text-destructive" />
            )}
          </div>
          <div className={`mt-1 text-3xl font-bold ${currentMonthAverages.acHoras != null && currentMonthAverages.acHoras > PROCESSAMENTO_SLA_HORAS ? "text-destructive" : ""}`}>
            {currentMonthAverages.acHoras != null ? `${currentMonthAverages.acHoras} h` : "—"}
          </div>
          {currentMonthAverages.acHoras != null && currentMonthAverages.acHoras > PROCESSAMENTO_SLA_HORAS && (
            <p className="mt-0.5 text-xs text-destructive">passou do prazo máximo de {PROCESSAMENTO_SLA_HORAS}h</p>
          )}
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <TrendingUp className="h-4 w-4" />
            Compra → Chegada (mês atual)
          </div>
          <div className="mt-1 text-3xl font-bold">{currentMonthAverages.ccDias != null ? `${currentMonthAverages.ccDias} d` : "—"}</div>
        </Card>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Indicadores</h1>
          <p className="text-sm text-muted-foreground">Tendência mensal de prazo e SLA das solicitações de compra</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={fromMonth || "all"} onValueChange={(v) => setFromMonth(v === "all" ? "" : v)}>
            <SelectTrigger className="h-9 w-[130px]"><SelectValue placeholder="De" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Desde o início</SelectItem>
              {availableMonths.map((k) => <SelectItem key={k} value={k}>{monthLabel(k)}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">até</span>
          <Select value={toMonth || "all"} onValueChange={(v) => setToMonth(v === "all" ? "" : v)}>
            <SelectTrigger className="h-9 w-[130px]"><SelectValue placeholder="Até" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Mais recente</SelectItem>
              {availableMonths.map((k) => <SelectItem key={k} value={k}>{monthLabel(k)}</SelectItem>)}
            </SelectContent>
          </Select>
          {(fromMonth || toMonth) && (
            <Button size="sm" variant="ghost" onClick={() => { setFromMonth(""); setToMonth(""); }}>Limpar</Button>
          )}
        </div>
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
              <Line type="monotone" dataKey="SC aberta tardia" stroke={LINE_COLORS.abertaTardia} connectNulls strokeWidth={2} dot={{ r: 3 }}
                label={{ position: "top", fontSize: 10, fill: LINE_COLORS.abertaTardia, formatter: (v: number) => (v != null ? `${v}%` : "") }} />
              <Line type="monotone" dataKey="Fora do prazo acordado" stroke={LINE_COLORS.foraDoPrazoAcordado} connectNulls strokeWidth={2} dot={{ r: 3 }}
                label={{ position: "bottom", fontSize: 10, fill: LINE_COLORS.foraDoPrazoAcordado, formatter: (v: number) => (v != null ? `${v}%` : "") }} />
              <Line type="monotone" dataKey="Entregue no prazo" stroke={LINE_COLORS.entregueNoPrazo} connectNulls strokeWidth={2} dot={{ r: 3 }}
                label={{ position: "bottom", fontSize: 10, fill: LINE_COLORS.entregueNoPrazo, formatter: (v: number) => (v != null ? `${v}%` : "") }} />
              <Line type="monotone" dataKey="Fornecedor cumpriu o prometido" stroke={LINE_COLORS.fornecedorCumpriu} connectNulls strokeWidth={2} dot={{ r: 3 }}
                label={{ position: "top", fontSize: 10, fill: LINE_COLORS.fornecedorCumpriu, formatter: (v: number) => (v != null ? `${v}%` : "") }} />
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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-semibold">Solicitações por setor</h3>
          {bySector.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Sem dados ainda</p>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={bySector} margin={{ top: 20, right: 16, left: 0, bottom: 70 }}>
                <XAxis
                  dataKey="name"
                  stroke="oklch(0.5 0.03 255)"
                  fontSize={11}
                  interval={0}
                  angle={-25}
                  textAnchor="end"
                  height={70}
                />
                <YAxis stroke="oklch(0.5 0.03 255)" fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "oklch(1 0 0)", border: "1px solid oklch(0.9 0.015 250)", borderRadius: 8 }} />
                <Bar dataKey="total" fill="oklch(0.52 0.18 255)" radius={[6, 6, 0, 0]}>
                  <LabelList dataKey="total" position="top" fontSize={11} fill="oklch(0.3 0.03 255)" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-semibold">Distribuição por status</h3>
          {openedInRange.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Sem dados ainda</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={byStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={50}>
                  {byStatus.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">
            Valor de compras por centro de custo
            {periodLabel && <span className="ml-2 text-xs font-normal text-muted-foreground">({periodLabel})</span>}
          </h3>
          <div className="text-sm text-muted-foreground">Total: <span className="font-semibold text-foreground">{fmtBRL(totalSpent)}</span></div>
        </div>
        {byCostCenter.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Nenhuma compra registrada com valor no período</p>
        ) : (
          <>
            <p className="mb-2 text-xs text-muted-foreground">Clique em uma barra para ver as compras do centro de custo.</p>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={byCostCenter} margin={{ top: 8, right: 16, left: 24, bottom: 40 }}>
                <XAxis dataKey="name" stroke="oklch(0.5 0.03 255)" fontSize={11} interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis stroke="oklch(0.5 0.03 255)" fontSize={11} width={90} tickFormatter={(v) => v >= 1000 ? `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k` : `R$ ${v.toLocaleString("pt-BR")}`} />
                <Tooltip
                  contentStyle={{ background: "oklch(1 0 0)", border: "1px solid oklch(0.9 0.015 250)", borderRadius: 8 }}
                  formatter={(v: number) => fmtBRL(v)}
                />
                <Bar
                  dataKey="total"
                  fill="oklch(0.62 0.16 150)"
                  radius={[6, 6, 0, 0]}
                  style={{ cursor: "pointer" }}
                  onClick={(d: any) => setCcDetail(d?.name ?? null)}
                />
              </BarChart>
            </ResponsiveContainer>
          </>
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

      <Dialog open={!!ccDetail} onOpenChange={(o) => !o && setCcDetail(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Compras — {ccDetail} {periodLabel && <span className="text-sm font-normal text-muted-foreground">({periodLabel})</span>}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-2 py-2">SC</th>
                  <th className="px-2 py-2">Item</th>
                  <th className="px-2 py-2">Descrição</th>
                  <th className="px-2 py-2 text-right">Qtd.</th>
                  <th className="px-2 py-2 text-right">Valor</th>
                  <th className="px-2 py-2">Data</th>
                </tr>
              </thead>
              <tbody>
                {ccDetailRows.length === 0 && (
                  <tr><td colSpan={6} className="px-2 py-6 text-center text-muted-foreground">Sem registros</td></tr>
                )}
                {ccDetailRows.map((r: any) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-2 py-2 font-mono text-xs">
                      <Link to="/requests/$id" params={{ id: r.id }} className="text-primary hover:underline">{r.number}</Link>
                    </td>
                    <td className="px-2 py-2 font-mono text-xs text-muted-foreground">{r.items?.code ?? "—"}</td>
                    <td className="px-2 py-2">{r.items?.description ?? r.description}</td>
                    <td className="px-2 py-2 text-right">{Number(r.quantity).toLocaleString("pt-BR")} {r.unit}</td>
                    <td className="px-2 py-2 text-right font-medium">{fmtBRL(purchaseTotal(r))}</td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">{new Date(r.purchased_at).toLocaleDateString("pt-BR")}</td>
                  </tr>
                ))}
              </tbody>
              {ccDetailRows.length > 0 && (
                <tfoot>
                  <tr className="border-t font-semibold">
                    <td className="px-2 py-2" colSpan={4}>Total</td>
                    <td className="px-2 py-2 text-right">{fmtBRL(ccDetailTotal)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
