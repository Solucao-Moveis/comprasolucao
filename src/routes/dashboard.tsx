import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { LabelList } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, PieChart, Pie, Cell, Legend } from "recharts";
import { Clock, CheckCircle2, XCircle, PackageCheck, TrendingUp, AlertTriangle, PiggyBank, Truck } from "lucide-react";
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
        .select("id,number,status,priority,description,quantity,unit,needed_by,created_at,decided_at,purchased_at,arrived_at,sector_id,purchase_amount,cost_center_id,sectors(code,name),cost_centers(code,name),items(code,description)");
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
  const SLA_HOURS = 36; // prazo máximo entre aprovação e registro da compra
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

  // SCs atrasadas: passaram da data "Necessário em" (needed_by) e o item ainda não chegou.
  const CLOSED_STATUS = new Set(["finalizado", "negado", "cancelado"]);
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const todayStr = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;
  const parseLocalDate = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  const overdueList = list
    .filter((r: any) => r.needed_by && !r.arrived_at && !CLOSED_STATUS.has(r.status) && r.needed_by < todayStr)
    .map((r: any) => ({
      ...r,
      daysLate: Math.round((todayStart.getTime() - parseLocalDate(r.needed_by).getTime()) / 86400000),
    }))
    .sort((a: any, b: any) => b.daysLate - a.daysLate);
  const overdueCount = overdueList.length;

  // 🟡 Compradas, aguardando entrega, dentro do prazo
  const purchasedAwaitingList = list
    .filter((r: any) => r.status === "comprado" && !r.arrived_at && r.needed_by >= todayStr)
    .map((r: any) => ({
      ...r,
      daysRemaining: Math.round((parseLocalDate(r.needed_by).getTime() - todayStart.getTime()) / 86400000),
    }))
    .sort((a: any, b: any) => a.daysRemaining - b.daysRemaining);
  const purchasedAwaitingCount = purchasedAwaitingList.length;

  // 🟢 Não compradas (pendente/aprovado/parcial), dentro do prazo de 36h da aprovação
  // (pendente ainda nem foi aprovada, então o relógio das 36h nem começou a contar)
  const notPurchasedOnTimeList = list
    .filter((r: any) => {
      if (!["pendente", "aprovado", "parcial"].includes(r.status)) return false;
      if (!r.decided_at) return true;
      return (now - new Date(r.decided_at).getTime()) / 36e5 <= SLA_HOURS;
    })
    .map((r: any) => ({
      ...r,
      hoursRemaining: r.decided_at
        ? Math.round(SLA_HOURS - (now - new Date(r.decided_at).getTime()) / 36e5)
        : null,
    }))
    .sort((a: any, b: any) => (a.hoursRemaining ?? Infinity) - (b.hoursRemaining ?? Infinity));
  const notPurchasedOnTimeCount = notPurchasedOnTimeList.length;

  // 🟢 Compradas e entregues no prazo (arrived_at <= needed_by)
  const deliveredOnTimeList = list
    .filter((r: any) => r.arrived_at && (r.arrived_at as string).slice(0, 10) <= r.needed_by)
    .map((r: any) => {
      const arrivedStr = (r.arrived_at as string).slice(0, 10);
      const daysEarly = Math.round((parseLocalDate(r.needed_by).getTime() - parseLocalDate(arrivedStr).getTime()) / 86400000);
      return { ...r, daysEarly };
    })
    .sort((a: any, b: any) => b.daysEarly - a.daysEarly);
  const deliveredOnTimeCount = deliveredOnTimeList.length;

  // 🔴 Compradas mas entregues com atraso (arrived_at > needed_by) — base para % do card "entregues no prazo"
  const deliveredLateCount = list.filter(
    (r: any) => r.arrived_at && (r.arrived_at as string).slice(0, 10) > r.needed_by
  ).length;
  const deliveredTotalCount = deliveredOnTimeCount + deliveredLateCount;

  // Quebra do card Atrasadas: ainda não comprada vs. comprada com entrega atrasada
  const overdueNotPurchasedCount = overdueList.filter((r: any) => r.status !== "comprado").length;
  const overduePurchasedLateCount = overdueList.filter((r: any) => r.status === "comprado").length;

  // Base para os percentuais dos cards da Linha 1 (exceto o de entregues no prazo): total de SCs em aberto
  const openCount = list.filter((r: any) => !CLOSED_STATUS.has(r.status)).length;
  const pct = (n: number, total: number) => (total > 0 ? `${Math.round((n / total) * 100)}%` : "—");

  // SLA Aprovação → Compra: prazo máximo de 36h desde a aprovação
  const approvedList = list.filter((r: any) => r.decided_at && r.status !== "negado");
  const purchasedWithinSlaList = approvedList
    .filter((r: any) => r.purchased_at && (new Date(r.purchased_at).getTime() - new Date(r.decided_at).getTime()) / 36e5 <= SLA_HOURS)
    .map((r: any) => ({
      ...r,
      hoursToPurchase: Math.round((new Date(r.purchased_at).getTime() - new Date(r.decided_at).getTime()) / 36e5),
    }))
    .sort((a: any, b: any) => b.hoursToPurchase - a.hoursToPurchase);
  const purchasedWithinSlaCount = purchasedWithinSlaList.length;
  const notPurchasedOverSlaList = approvedList
    .filter((r: any) => !r.purchased_at && (now - new Date(r.decided_at).getTime()) / 36e5 > SLA_HOURS)
    .map((r: any) => ({
      ...r,
      hoursOver: Math.round((now - new Date(r.decided_at).getTime()) / 36e5 - SLA_HOURS),
    }))
    .sort((a: any, b: any) => b.hoursOver - a.hoursOver);
  const notPurchasedOverSlaCount = notPurchasedOverSlaList.length;

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

  const avgHours = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  const fmtDuration = (h: number | null) => {
    if (h == null) return "—";
    if (h < 24) return `${h.toFixed(1)} h`;
    return `${(h / 24).toFixed(1)} d`;
  };
  const fmtHours = (h: number | null) => (h == null ? "—" : `${h.toFixed(1)} h`);
  const tCreateToApprove = avgHours(
    list.filter((r: any) => r.decided_at).map((r: any) =>
      (new Date(r.decided_at).getTime() - new Date(r.created_at).getTime()) / 36e5)
  );
  const tApproveToPurchase = avgHours(
    list.filter((r: any) => r.decided_at && r.purchased_at).map((r: any) =>
      (new Date(r.purchased_at).getTime() - new Date(r.decided_at).getTime()) / 36e5)
  );
  const tPurchaseToArrival = avgHours(
    list.filter((r: any) => r.purchased_at && r.arrived_at).map((r: any) =>
      (new Date(r.arrived_at).getTime() - new Date(r.purchased_at).getTime()) / 36e5)
  );

  const [ccMonth, setCcMonth] = useState<string>("all");
  const [ccDetail, setCcDetail] = useState<string | null>(null);
  const [showOverdue, setShowOverdue] = useState(false);
  const [showPurchasedAwaiting, setShowPurchasedAwaiting] = useState(false);
  const [showNotPurchased, setShowNotPurchased] = useState(false);
  const [showDeliveredOnTime, setShowDeliveredOnTime] = useState(false);
  const [showSlaPurchased, setShowSlaPurchased] = useState(false);
  const [showSlaNotPurchased, setShowSlaNotPurchased] = useState(false);

  const purchasesList = useMemo(
    () => list.filter((r: any) => r.purchase_amount && r.purchased_at),
    [list]
  );

  const ccMonthOptions = useMemo(() => {
    const set = new Set<string>();
    purchasesList.forEach((r: any) => {
      const d = new Date(r.purchased_at);
      set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [purchasesList]);

  const ccFiltered = useMemo(
    () =>
      purchasesList.filter((r: any) => {
        if (ccMonth === "all") return true;
        const d = new Date(r.purchased_at);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` === ccMonth;
      }),
    [purchasesList, ccMonth]
  );

  const purchaseTotal = (r: any) => Number(r.purchase_amount || 0);
  const byCostCenter = Object.values(
    ccFiltered.reduce((acc: Record<string, { name: string; total: number }>, r: any) => {
      const name = r.cost_centers ? r.cost_centers.name : "Sem CC";
      acc[name] = acc[name] ?? { name, total: 0 };
      acc[name].total += purchaseTotal(r);
      return acc;
    }, {})
  );
  const totalSpent = byCostCenter.reduce((sum, c: any) => sum + c.total, 0);
  const fmtBRL = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const ccDetailRows = ccDetail
    ? ccFiltered.filter((r: any) => (r.cost_centers ? r.cost_centers.name : "Sem CC") === ccDetail)
    : [];
  const ccDetailTotal = ccDetailRows.reduce((s, r: any) => s + purchaseTotal(r), 0);
  const fmtMonth = (k: string) => {
    const [y, m] = k.split("-");
    return `${m}/${y}`;
  };

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

      {/* Linha 1 — semáforo de prazo: 4 cards lado a lado */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card
          role={overdueCount > 0 ? "button" : undefined}
          tabIndex={overdueCount > 0 ? 0 : undefined}
          onClick={() => overdueCount > 0 && setShowOverdue(true)}
          onKeyDown={(e) => { if (overdueCount > 0 && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setShowOverdue(true); } }}
          className={overdueCount > 0 ? "p-5 border-destructive/50 bg-destructive/5 cursor-pointer transition-colors hover:bg-destructive/10" : "p-5 border-success/40 bg-success/5"}
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Atrasadas</div>
              <div className={`mt-2 text-3xl font-bold ${overdueCount > 0 ? "text-destructive" : "text-success"}`}>{overdueCount}</div>
              <p className="mt-1 text-xs text-muted-foreground">{overdueCount > 0 ? "Passaram da data necessária e não chegaram · clique para ver" : "Nenhuma em atraso"}</p>
            </div>
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${overdueCount > 0 ? "bg-destructive/15 text-destructive" : "bg-success/15 text-success"}`}>
              <AlertTriangle className="h-5 w-5" />
            </div>
          </div>
        </Card>

        <Card
          role={purchasedAwaitingCount > 0 ? "button" : undefined}
          tabIndex={purchasedAwaitingCount > 0 ? 0 : undefined}
          onClick={() => purchasedAwaitingCount > 0 && setShowPurchasedAwaiting(true)}
          onKeyDown={(e) => { if (purchasedAwaitingCount > 0 && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setShowPurchasedAwaiting(true); } }}
          className={purchasedAwaitingCount > 0 ? "p-5 border-warning/50 bg-warning/5 cursor-pointer transition-colors hover:bg-warning/10" : "p-5 border-success/40 bg-success/5"}
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Compradas — em trânsito</div>
              <div className={`mt-2 text-3xl font-bold ${purchasedAwaitingCount > 0 ? "text-warning" : "text-success"}`}>{purchasedAwaitingCount}</div>
              <p className="mt-1 text-xs text-muted-foreground">{purchasedAwaitingCount > 0 ? "Compradas, aguardando entrega · prazo não vencido · clique para ver" : "Nenhuma aguardando entrega"}</p>
            </div>
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${purchasedAwaitingCount > 0 ? "bg-warning/15 text-warning" : "bg-success/15 text-success"}`}>
              <Truck className="h-5 w-5" />
            </div>
          </div>
        </Card>

        <Card
          role={notPurchasedOnTimeCount > 0 ? "button" : undefined}
          tabIndex={notPurchasedOnTimeCount > 0 ? 0 : undefined}
          onClick={() => notPurchasedOnTimeCount > 0 && setShowNotPurchased(true)}
          onKeyDown={(e) => { if (notPurchasedOnTimeCount > 0 && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setShowNotPurchased(true); } }}
          className={notPurchasedOnTimeCount > 0 ? "p-5 border-warning/30 bg-warning/5 cursor-pointer transition-colors hover:bg-warning/10" : "p-5 border-success/40 bg-success/5"}
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Não compradas — no prazo</div>
              <div className={`mt-2 text-3xl font-bold ${notPurchasedOnTimeCount > 0 ? "text-warning" : "text-success"}`}>{notPurchasedOnTimeCount}</div>
              <p className="mt-1 text-xs text-muted-foreground">{notPurchasedOnTimeCount > 0 ? "Aguardando aprovação ou dentro das 36h após aprovada · clique para ver" : "Nenhuma pendente dentro do prazo"}</p>
            </div>
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${notPurchasedOnTimeCount > 0 ? "bg-warning/15 text-warning" : "bg-success/15 text-success"}`}>
              <Clock className="h-5 w-5" />
            </div>
          </div>
        </Card>

        <Card
          role={deliveredOnTimeCount > 0 ? "button" : undefined}
          tabIndex={deliveredOnTimeCount > 0 ? 0 : undefined}
          onClick={() => deliveredOnTimeCount > 0 && setShowDeliveredOnTime(true)}
          onKeyDown={(e) => { if (deliveredOnTimeCount > 0 && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setShowDeliveredOnTime(true); } }}
          className={deliveredOnTimeCount > 0 ? "p-5 border-success/40 bg-success/5 cursor-pointer transition-colors hover:bg-success/10" : "p-5"}
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Compradas e entregues no prazo</div>
              <div className="mt-2 text-3xl font-bold text-success">{deliveredOnTimeCount}</div>
              <p className="mt-1 text-xs text-muted-foreground">{deliveredOnTimeCount > 0 ? "Chegaram antes ou na data necessária · clique para ver" : "Nenhuma registrada ainda"}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/15 text-success">
              <PackageCheck className="h-5 w-5" />
            </div>
          </div>
        </Card>
      </div>

      {/* Quebra do Atrasadas em card próprio */}
      {overdueCount > 0 && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card className="p-5 border-destructive/30 bg-destructive/5">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Atrasadas — detalhe</div>
            <div className="mt-3 space-y-1.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Ainda não comprada</span>
                <span className="font-semibold text-destructive">{overdueNotPurchasedCount}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Comprada — entrega atrasada</span>
                <span className="font-semibold text-destructive">{overduePurchasedLateCount}</span>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Linha 1a — percentual de cada um dos 4 cards acima, em quadros próprios */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="p-5 border-destructive/30 bg-destructive/5">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">% Atrasadas</div>
          <div className="mt-2 text-2xl font-bold text-destructive">{pct(overdueCount, openCount)}</div>
          <p className="mt-1 text-xs text-muted-foreground">do total de SCs em aberto</p>
          {overdueCount > 0 && (
            <div className="mt-3 space-y-1 border-t border-destructive/20 pt-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Ainda não comprada</span>
                <span className="font-semibold text-destructive">{pct(overdueNotPurchasedCount, overdueCount)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Comprada — entrega atrasada</span>
                <span className="font-semibold text-destructive">{pct(overduePurchasedLateCount, overdueCount)}</span>
              </div>
            </div>
          )}
        </Card>
        <Card className="p-5 border-warning/30 bg-warning/5">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">% Compradas — em trânsito</div>
          <div className="mt-2 text-2xl font-bold text-warning">{pct(purchasedAwaitingCount, openCount)}</div>
          <p className="mt-1 text-xs text-muted-foreground">do total de SCs em aberto</p>
        </Card>
        <Card className="p-5 border-warning/20 bg-warning/5">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">% Não compradas — no prazo</div>
          <div className="mt-2 text-2xl font-bold text-warning">{pct(notPurchasedOnTimeCount, openCount)}</div>
          <p className="mt-1 text-xs text-muted-foreground">do total de SCs em aberto</p>
        </Card>
      </div>

      {/* Linha extra — SLA Aprovação → Compra (prazo máx. 36h desde a aprovação) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card
          role={purchasedWithinSlaCount > 0 ? "button" : undefined}
          tabIndex={purchasedWithinSlaCount > 0 ? 0 : undefined}
          onClick={() => purchasedWithinSlaCount > 0 && setShowSlaPurchased(true)}
          onKeyDown={(e) => { if (purchasedWithinSlaCount > 0 && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setShowSlaPurchased(true); } }}
          className={purchasedWithinSlaCount > 0 ? "p-5 border-success/40 bg-success/5 cursor-pointer transition-colors hover:bg-success/10" : "p-5"}
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Compradas dentro do prazo (36h da aprovação)</div>
              <div className="mt-2 text-3xl font-bold text-success">{purchasedWithinSlaCount}</div>
              <p className="mt-1 text-xs text-muted-foreground">Comprada em até 36h após a aprovação · clique para ver</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/15 text-success">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>
        </Card>
        <Card
          role={notPurchasedOverSlaCount > 0 ? "button" : undefined}
          tabIndex={notPurchasedOverSlaCount > 0 ? 0 : undefined}
          onClick={() => notPurchasedOverSlaCount > 0 && setShowSlaNotPurchased(true)}
          onKeyDown={(e) => { if (notPurchasedOverSlaCount > 0 && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setShowSlaNotPurchased(true); } }}
          className={notPurchasedOverSlaCount > 0 ? "p-5 border-destructive/50 bg-destructive/5 cursor-pointer transition-colors hover:bg-destructive/10" : "p-5 border-success/40 bg-success/5"}
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Não compradas no prazo (36h da aprovação)</div>
              <div className={`mt-2 text-3xl font-bold ${notPurchasedOverSlaCount > 0 ? "text-destructive" : "text-success"}`}>{notPurchasedOverSlaCount}</div>
              <p className="mt-1 text-xs text-muted-foreground">{notPurchasedOverSlaCount > 0 ? "Aprovadas há mais de 36h e ainda não compradas · clique para ver" : "Nenhuma fora do prazo"}</p>
            </div>
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${notPurchasedOverSlaCount > 0 ? "bg-destructive/15 text-destructive" : "bg-success/15 text-success"}`}>
              <AlertTriangle className="h-5 w-5" />
            </div>
          </div>
        </Card>
      </div>

      {/* Linha 2 — contadores de status */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
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


      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <TrendingUp className="h-4 w-4" />
            Abertura → Aprovação
          </div>
          <div className="mt-1 text-3xl font-bold">{fmtDuration(tCreateToApprove)}</div>
          <p className="text-xs text-muted-foreground">Tempo médio entre criação e decisão do aprovador</p>
        </Card>
        <Card className={tApproveToPurchase != null && tApproveToPurchase > SLA_HOURS ? "p-5 border-destructive/50 bg-destructive/5" : "p-5"}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <TrendingUp className="h-4 w-4" />
              Aprovação → Compra
            </div>
            {tApproveToPurchase != null && tApproveToPurchase > SLA_HOURS && (
              <AlertTriangle className="h-4 w-4 text-destructive" />
            )}
          </div>
          <div className={`mt-1 text-3xl font-bold ${tApproveToPurchase != null && tApproveToPurchase > SLA_HOURS ? "text-destructive" : ""}`}>{fmtHours(tApproveToPurchase)}</div>
          <p className="text-xs text-muted-foreground">
            Tempo médio entre aprovação e registro da compra
            {tApproveToPurchase != null && tApproveToPurchase > SLA_HOURS && " · passou do prazo máximo de 36h"}
          </p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <TrendingUp className="h-4 w-4" />
            Compra → Chegada
          </div>
          <div className="mt-1 text-3xl font-bold">{fmtDuration(tPurchaseToArrival)}</div>
          <p className="text-xs text-muted-foreground">Tempo médio entre compra e chegada do item</p>
        </Card>
      </div>

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
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Valor de compras por centro de custo</h3>
          <div className="flex items-center gap-3">
            <Select value={ccMonth} onValueChange={setCcMonth}>
              <SelectTrigger className="h-8 w-[160px]"><SelectValue placeholder="Mês" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os meses</SelectItem>
                {ccMonthOptions.map((k) => (
                  <SelectItem key={k} value={k}>{fmtMonth(k)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="text-sm text-muted-foreground">Total: <span className="font-semibold text-foreground">{fmtBRL(totalSpent)}</span></div>
          </div>
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

      <Dialog open={showOverdue} onOpenChange={setShowOverdue}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Solicitações atrasadas ({overdueCount})
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">Passaram da data "Necessário em" e o item ainda não chegou (não estão finalizadas, negadas nem canceladas).</p>
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-2 py-2">SC</th>
                  <th className="px-2 py-2">Item / Descrição</th>
                  <th className="px-2 py-2">Setor</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Necessário em</th>
                  <th className="px-2 py-2 text-right">Atraso</th>
                </tr>
              </thead>
              <tbody>
                {overdueList.length === 0 && (
                  <tr><td colSpan={6} className="px-2 py-6 text-center text-muted-foreground">Nenhuma solicitação em atraso 🎉</td></tr>
                )}
                {overdueList.map((r: any) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-2 py-2 font-mono text-xs">
                      <Link to="/requests/$id" params={{ id: r.id }} className="text-primary hover:underline">{r.number}</Link>
                    </td>
                    <td className="px-2 py-2">{r.items?.description ?? r.description}</td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">{r.sectors ? `${r.sectors.code} — ${r.sectors.name}` : "—"}</td>
                    <td className="px-2 py-2 text-xs capitalize text-muted-foreground">{r.status}</td>
                    <td className="px-2 py-2 text-xs">{parseLocalDate(r.needed_by).toLocaleDateString("pt-BR")}</td>
                    <td className="px-2 py-2 text-right">
                      <span className="font-semibold text-destructive">{r.daysLate} {r.daysLate === 1 ? "dia" : "dias"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: Compradas em trânsito */}
      <Dialog open={showPurchasedAwaiting} onOpenChange={setShowPurchasedAwaiting}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-warning" />
              Compradas — aguardando entrega ({purchasedAwaitingCount})
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">Compradas mas ainda não chegaram. Prazo não vencido.</p>
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-2 py-2">SC</th>
                  <th className="px-2 py-2">Descrição</th>
                  <th className="px-2 py-2">Setor</th>
                  <th className="px-2 py-2">Necessário em</th>
                  <th className="px-2 py-2 text-right">Dias restantes</th>
                </tr>
              </thead>
              <tbody>
                {purchasedAwaitingList.map((r: any) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-2 py-2 font-mono text-xs">
                      <Link to="/requests/$id" params={{ id: r.id }} className="text-primary hover:underline">{r.number}</Link>
                    </td>
                    <td className="px-2 py-2">{r.items?.description ?? r.description}</td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">{r.sectors ? `${r.sectors.code} — ${r.sectors.name}` : "—"}</td>
                    <td className="px-2 py-2 text-xs">{parseLocalDate(r.needed_by).toLocaleDateString("pt-BR")}</td>
                    <td className="px-2 py-2 text-right">
                      <span className="font-semibold text-warning">{r.daysRemaining} {r.daysRemaining === 1 ? "dia" : "dias"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: Não compradas dentro do prazo */}
      <Dialog open={showNotPurchased} onOpenChange={setShowNotPurchased}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-warning" />
              Não compradas — dentro do prazo ({notPurchasedOnTimeCount})
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">Aguardando aprovação (prazo ainda não começou) ou aprovada há menos de 36h e ainda sem compra registrada.</p>
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-2 py-2">SC</th>
                  <th className="px-2 py-2">Descrição</th>
                  <th className="px-2 py-2">Setor</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Aprovado em</th>
                  <th className="px-2 py-2 text-right">Horas restantes (36h)</th>
                </tr>
              </thead>
              <tbody>
                {notPurchasedOnTimeList.map((r: any) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-2 py-2 font-mono text-xs">
                      <Link to="/requests/$id" params={{ id: r.id }} className="text-primary hover:underline">{r.number}</Link>
                    </td>
                    <td className="px-2 py-2">{r.items?.description ?? r.description}</td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">{r.sectors ? `${r.sectors.code} — ${r.sectors.name}` : "—"}</td>
                    <td className="px-2 py-2 text-xs capitalize text-muted-foreground">{r.status}</td>
                    <td className="px-2 py-2 text-xs">{r.decided_at ? new Date(r.decided_at).toLocaleString("pt-BR") : "Aguardando aprovação"}</td>
                    <td className="px-2 py-2 text-right">
                      {r.hoursRemaining == null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className={`font-semibold ${r.hoursRemaining <= 6 ? "text-destructive" : "text-warning"}`}>{r.hoursRemaining} h</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: Compradas e entregues no prazo */}
      <Dialog open={showDeliveredOnTime} onOpenChange={setShowDeliveredOnTime}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackageCheck className="h-5 w-5 text-success" />
              Compradas e entregues no prazo ({deliveredOnTimeCount})
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">Chegaram antes ou na data necessária.</p>
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-2 py-2">SC</th>
                  <th className="px-2 py-2">Descrição</th>
                  <th className="px-2 py-2">Setor</th>
                  <th className="px-2 py-2">Chegada</th>
                  <th className="px-2 py-2">Necessário em</th>
                  <th className="px-2 py-2 text-right">Antecedência</th>
                </tr>
              </thead>
              <tbody>
                {deliveredOnTimeList.map((r: any) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-2 py-2 font-mono text-xs">
                      <Link to="/requests/$id" params={{ id: r.id }} className="text-primary hover:underline">{r.number}</Link>
                    </td>
                    <td className="px-2 py-2">{r.items?.description ?? r.description}</td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">{r.sectors ? `${r.sectors.code} — ${r.sectors.name}` : "—"}</td>
                    <td className="px-2 py-2 text-xs">{new Date(r.arrived_at).toLocaleDateString("pt-BR")}</td>
                    <td className="px-2 py-2 text-xs">{parseLocalDate(r.needed_by).toLocaleDateString("pt-BR")}</td>
                    <td className="px-2 py-2 text-right">
                      <span className="font-semibold text-success">
                        {r.daysEarly === 0 ? "No dia" : `${r.daysEarly} ${r.daysEarly === 1 ? "dia" : "dias"} antes`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: Compradas dentro do prazo (SLA 36h) */}
      <Dialog open={showSlaPurchased} onOpenChange={setShowSlaPurchased}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-success" />
              Compradas dentro do prazo — 36h da aprovação ({purchasedWithinSlaCount})
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">Tempo entre aprovação e registro da compra dentro do limite de 36 horas.</p>
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-2 py-2">SC</th>
                  <th className="px-2 py-2">Descrição</th>
                  <th className="px-2 py-2">Setor</th>
                  <th className="px-2 py-2">Aprovado em</th>
                  <th className="px-2 py-2 text-right">Horas até a compra</th>
                </tr>
              </thead>
              <tbody>
                {purchasedWithinSlaList.map((r: any) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-2 py-2 font-mono text-xs">
                      <Link to="/requests/$id" params={{ id: r.id }} className="text-primary hover:underline">{r.number}</Link>
                    </td>
                    <td className="px-2 py-2">{r.items?.description ?? r.description}</td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">{r.sectors ? `${r.sectors.code} — ${r.sectors.name}` : "—"}</td>
                    <td className="px-2 py-2 text-xs">{new Date(r.decided_at).toLocaleString("pt-BR")}</td>
                    <td className="px-2 py-2 text-right">
                      <span className="font-semibold text-success">{r.hoursToPurchase} h</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: Não compradas no prazo (SLA 36h) */}
      <Dialog open={showSlaNotPurchased} onOpenChange={setShowSlaNotPurchased}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Não compradas no prazo — 36h da aprovação ({notPurchasedOverSlaCount})
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">Aprovadas há mais de 36 horas e ainda sem compra registrada.</p>
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-2 py-2">SC</th>
                  <th className="px-2 py-2">Descrição</th>
                  <th className="px-2 py-2">Setor</th>
                  <th className="px-2 py-2">Aprovado em</th>
                  <th className="px-2 py-2 text-right">Horas além do prazo</th>
                </tr>
              </thead>
              <tbody>
                {notPurchasedOverSlaList.map((r: any) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-2 py-2 font-mono text-xs">
                      <Link to="/requests/$id" params={{ id: r.id }} className="text-primary hover:underline">{r.number}</Link>
                    </td>
                    <td className="px-2 py-2">{r.items?.description ?? r.description}</td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">{r.sectors ? `${r.sectors.code} — ${r.sectors.name}` : "—"}</td>
                    <td className="px-2 py-2 text-xs">{new Date(r.decided_at).toLocaleString("pt-BR")}</td>
                    <td className="px-2 py-2 text-right">
                      <span className="font-semibold text-destructive">{r.hoursOver} h</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!ccDetail} onOpenChange={(o) => !o && setCcDetail(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Compras — {ccDetail} {ccMonth !== "all" && <span className="text-sm font-normal text-muted-foreground">({fmtMonth(ccMonth)})</span>}
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
