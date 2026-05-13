import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, PieChart, Pie, Cell, Legend } from "recharts";
import { Clock, CheckCircle2, XCircle, PackageCheck, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/dashboard")({
  component: () => <AppLayout><Dashboard /></AppLayout>,
});

const COLORS = ["oklch(0.78 0.15 75)", "oklch(0.62 0.16 150)", "oklch(0.6 0.22 25)", "oklch(0.65 0.13 230)"];

function Dashboard() {
  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const { data: requests } = await supabase
        .from("purchase_requests")
        .select("id,status,priority,created_at,decided_at,sector_id,purchase_amount,cost_center_id,sectors(name),cost_centers(code,name)");
      return requests ?? [];
    },
  });

  const list = data ?? [];
  const counts = {
    pendente: list.filter((r) => r.status === "pendente").length,
    aprovado: list.filter((r) => r.status === "aprovado").length,
    negado: list.filter((r) => r.status === "negado").length,
    finalizado: list.filter((r) => r.status === "finalizado").length,
  };

  const bySector = Object.values(
    list.reduce((acc: Record<string, { name: string; total: number }>, r: any) => {
      const name = r.sectors?.name ?? "—";
      acc[name] = acc[name] ?? { name, total: 0 };
      acc[name].total++;
      return acc;
    }, {})
  );

  const byStatus = [
    { name: "Pendente", value: counts.pendente },
    { name: "Aprovado", value: counts.aprovado },
    { name: "Negado", value: counts.negado },
    { name: "Finalizado", value: counts.finalizado },
  ];

  const decidedTimes = list
    .filter((r: any) => r.decided_at)
    .map((r: any) => (new Date(r.decided_at).getTime() - new Date(r.created_at).getTime()) / 36e5);
  const sla = decidedTimes.length ? (decidedTimes.reduce((a, b) => a + b, 0) / decidedTimes.length).toFixed(1) : "—";

  const stats = [
    { label: "Pendentes", value: counts.pendente, icon: Clock, tone: "warning" },
    { label: "Aprovadas", value: counts.aprovado, icon: CheckCircle2, tone: "success" },
    { label: "Negadas", value: counts.negado, icon: XCircle, tone: "destructive" },
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

      <Card className="p-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <TrendingUp className="h-4 w-4" />
          SLA médio de atendimento
        </div>
        <div className="mt-1 text-3xl font-bold">{sla}{sla !== "—" && " h"}</div>
        <p className="text-xs text-muted-foreground">Tempo médio entre criação e decisão</p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-semibold">Solicitações por setor</h3>
          {bySector.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Sem dados ainda</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={bySector}>
                <XAxis dataKey="name" stroke="oklch(0.5 0.03 255)" fontSize={11} />
                <YAxis stroke="oklch(0.5 0.03 255)" fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "oklch(1 0 0)", border: "1px solid oklch(0.9 0.015 250)", borderRadius: 8 }} />
                <Bar dataKey="total" fill="oklch(0.52 0.18 255)" radius={[6, 6, 0, 0]} />
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
    </div>
  );
}
