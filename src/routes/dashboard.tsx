import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { LabelList } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, PieChart, Pie, Cell, Legend } from "recharts";
import { Clock, CheckCircle2, XCircle, PackageCheck, TrendingUp, AlertTriangle, PiggyBank } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/dashboard")({
  component: () => <AppLayout><Dashboard /></AppLayout>,
});

const COLORS = ["oklch(0.78 0.15 75)", "oklch(0.62 0.16 150)", "oklch(0.6 0.22 25)", "oklch(0.65 0.13 230)"];

function Dashboard() {
  const { roles } = useAuth();
  const isBuyer = roles.includes("comprador") || roles.includes("admin");
  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const { data: requests } = await supabase
        .from("purchase_requests")
        .select("id,number,status,priority,description,quantity,unit,created_at,decided_at,purchased_at,sector_id,purchase_amount,cost_center_id,sectors(code,name),cost_centers(code,name),items(code,description)");
      return requests ?? [];
    },
  });
  const { data: items } = useQuery({
    queryKey: ["items"],
    queryFn: async () => (await supabase.from("items").select("id,code,description,avg_interval_days,last_purchased_at,avg_price")).data ?? [],
  });
  const { data: purchases } = useQuery({
    enabled: isBuyer,
    queryKey: ["buyer-savings"],
    queryFn: async () => (await supabase
      .from("purchase_requests")
      .select("item_id,quantity,purchase_amount,purchased_at,items!inner(code)")
      .not("item_id", "is", null)
      .not("purchased_at", "is", null)
      .not("purchase_amount", "is", null)
      .neq("items.code", "3091000")
      .order("purchased_at", { ascending: true })).data ?? [],
  });

  // Compute savings per month: for each item, savings = max(0, prevUnit - curUnit) * curQty
  const savingsByMonth = new Map<string, number>();
  const byItem = new Map<string, any[]>();
  (purchases ?? []).forEach((p: any) => {
    if (!byItem.has(p.item_id)) byItem.set(p.item_id, []);
    byItem.get(p.item_id)!.push(p);
  });
  byItem.forEach((arr) => {
    for (let i = 1; i < arr.length; i++) {
      const prev = arr[i - 1], cur = arr[i];
      const prevQty = Number(prev.quantity) || 0;
      const curQty = Number(cur.quantity) || 0;
      if (prevQty <= 0 || curQty <= 0) continue;
      const prevUnit = Number(prev.purchase_amount) / prevQty;
      const curUnit = Number(cur.purchase_amount) / curQty;
      const diff = prevUnit - curUnit;
      if (diff > 0) {
        const d = new Date(cur.purchased_at);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        savingsByMonth.set(key, (savingsByMonth.get(key) || 0) + diff * curQty);
      }
    }
  });
  const monthKey = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; })();
  const currentMonthSave = savingsByMonth.get(monthKey) || 0;
  const totalSave = Array.from(savingsByMonth.values()).reduce((a, b) => a + b, 0);
  const savingsSeries = Array.from(savingsByMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([k, v]) => {
      const [y, m] = k.split("-");
      return { name: `${m}/${y.slice(2)}`, total: Number(v.toFixed(2)) };
    });

  const now = Date.now();
  const dueItems = (items ?? []).filter((i: any) => i.last_purchased_at && i.avg_interval_days &&
    (now - new Date(i.last_purchased_at).getTime()) / 86400000 >= Number(i.avg_interval_days));

  const list = data ?? [];
  const counts = {
    pendente: list.filter((r) => r.status === "pendente").length,
    aprovado: list.filter((r) => r.status === "aprovado").length,
    negado: list.filter((r) => r.status === "negado").length,
    comprado: list.filter((r) => r.status === "comprado").length,
    finalizado: list.filter((r) => r.status === "finalizado").length,
  };

  const bySector = Object.values(
    list.reduce((acc: Record<string, { name: string; total: number }>, r: any) => {
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

  const decidedTimes = list
    .filter((r: any) => r.decided_at)
    .map((r: any) => (new Date(r.decided_at).getTime() - new Date(r.created_at).getTime()) / 36e5);
  const sla = decidedTimes.length ? (decidedTimes.reduce((a, b) => a + b, 0) / decidedTimes.length).toFixed(1) : "—";

  const byCostCenter = Object.values(
    list.reduce((acc: Record<string, { name: string; total: number }>, r: any) => {
      if (!r.purchase_amount) return acc;
      const name = r.cost_centers ? r.cost_centers.name : "Sem CC";
      acc[name] = acc[name] ?? { name, total: 0 };
      acc[name].total += Number(r.purchase_amount);
      return acc;
    }, {})
  );
  const totalSpent = byCostCenter.reduce((sum, c: any) => sum + c.total, 0);
  const fmtBRL = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const stats = [
    { label: "Pendentes", value: counts.pendente, icon: Clock, tone: "warning" },
    { label: "Aprovadas", value: counts.aprovado, icon: CheckCircle2, tone: "success" },
    { label: "Negadas", value: counts.negado, icon: XCircle, tone: "destructive" },
    { label: "Compradas", value: counts.comprado, icon: PackageCheck, tone: "primary" },
    { label: "Finalizadas", value: counts.finalizado, icon: PackageCheck, tone: "info" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Visão geral das solicitações de compra</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</div>
                <div className="mt-2 text-3xl font-bold">{s.value}</div>
              </div>
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-${s.tone}/15 text-${s.tone}`}>
                <s.icon className="h-5 w-5" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {isBuyer && (
        <Card className="p-5 border-success/40 bg-success/5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <PiggyBank className="h-4 w-4 text-success" />
                SAVE — Economia em negociação (mês atual)
              </div>
              <div className="mt-1 text-3xl font-bold text-success">{fmtBRL(currentMonthSave)}</div>
              <p className="text-xs text-muted-foreground">
                Soma das diferenças quando o preço negociado ficou abaixo do último valor registrado para o mesmo item. Acumulado: <span className="font-semibold text-foreground">{fmtBRL(totalSave)}</span>
              </p>
            </div>
            {savingsSeries.length > 0 && (
              <div className="w-full sm:w-[320px] h-[100px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={savingsSeries}>
                    <XAxis dataKey="name" stroke="oklch(0.5 0.03 255)" fontSize={10} />
                    <Tooltip formatter={(v: number) => fmtBRL(v)} contentStyle={{ background: "oklch(1 0 0)", border: "1px solid oklch(0.9 0.015 250)", borderRadius: 8 }} />
                    <Bar dataKey="total" fill="oklch(0.62 0.16 150)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </Card>
      )}

      <Card className="p-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <TrendingUp className="h-4 w-4" />
          SLA médio de atendimento
        </div>
        <div className="mt-1 text-3xl font-bold">{sla}{sla !== "—" && " h"}</div>
        <p className="text-xs text-muted-foreground">Tempo médio entre criação e decisão</p>
      </Card>

      {dueItems.length > 0 && (
        <Card className="p-5 border-warning/40 bg-warning/5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <h3 className="text-sm font-semibold">Sugestão de compra ({dueItems.length})</h3>
            </div>
            <Link to="/items" className="text-xs text-primary hover:underline">Ver catálogo</Link>
          </div>
          <ul className="space-y-1.5 text-sm">
            {dueItems.map((i: any) => {
              const days = Math.floor((now - new Date(i.last_purchased_at).getTime()) / 86400000);
              return (
                <li key={i.id} className="flex justify-between gap-3">
                  <span className="truncate"><span className="font-mono text-xs">{i.code}</span> — {i.description}</span>
                  <span className="text-muted-foreground text-xs whitespace-nowrap">{days}d desde a última (média {Number(i.avg_interval_days).toFixed(0)}d)</span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

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
          {list.length === 0 ? (
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
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Valor de compras por centro de custo</h3>
          <div className="text-sm text-muted-foreground">Total: <span className="font-semibold text-foreground">{fmtBRL(totalSpent)}</span></div>
        </div>
        {byCostCenter.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Nenhuma compra registrada com valor ainda</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={byCostCenter} margin={{ top: 8, right: 16, left: 24, bottom: 40 }}>
              <XAxis dataKey="name" stroke="oklch(0.5 0.03 255)" fontSize={11} interval={0} angle={-20} textAnchor="end" height={60} />
              <YAxis stroke="oklch(0.5 0.03 255)" fontSize={11} width={90} tickFormatter={(v) => v >= 1000 ? `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k` : `R$ ${v.toLocaleString("pt-BR")}`} />
              <Tooltip
                contentStyle={{ background: "oklch(1 0 0)", border: "1px solid oklch(0.9 0.015 250)", borderRadius: 8 }}
                formatter={(v: number) => fmtBRL(v)}
              />
              <Bar dataKey="total" fill="oklch(0.62 0.16 150)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>
    </div>
  );
}
