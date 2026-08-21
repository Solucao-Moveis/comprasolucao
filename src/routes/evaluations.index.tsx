import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClassificationBadge } from "@/components/StatusBadge";
import { useMemo, useState } from "react";
import { Plus, Search, Download, ClipboardCheck, ArrowRight, CheckCircle2, XCircle, Truck } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/lib/auth";
import { CLASS_LABEL } from "@/lib/evaluation";

export const Route = createFileRoute("/evaluations/")({
  component: () => <AppLayout><EvaluationsList /></AppLayout>,
});

function fmtDate(d: string) {
  const [y, m, day] = String(d).split("-").map(Number);
  return format(new Date(y, m - 1, day), "dd/MM/yyyy");
}

function EvaluationsList() {
  const { roles } = useAuth();
  const canCreate = roles.includes("comprador") || roles.includes("admin");
  const [q, setQ] = useState("");
  const [cls, setCls] = useState("all");
  const [appr, setAppr] = useState("all");
  const [from, setFrom] = useState("");

  const { data: evals } = useQuery({
    queryKey: ["evaluations"],
    queryFn: async () => {
      const { data } = await supabase
        .from("supplier_evaluations")
        .select("*, purchase_requests(number)")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  // Entregas que chegaram e ainda não foram avaliadas
  const { data: pending } = useQuery({
    queryKey: ["deliveries-pending-eval"],
    queryFn: async () => {
      const { data: deliveries } = await supabase
        .from("purchase_requests")
        .select("id,number,description,arrived_at,items(supplier)")
        .not("arrived_at", "is", null)
        .order("arrived_at", { ascending: false });
      const { data: done } = await supabase
        .from("supplier_evaluations")
        .select("request_id")
        .not("request_id", "is", null);
      const evaluated = new Set((done ?? []).map((d: any) => d.request_id));
      return (deliveries ?? []).filter((d: any) => !evaluated.has(d.id));
    },
  });

  const filtered = useMemo(() => {
    return (evals ?? []).filter((e: any) => {
      if (cls !== "all" && e.classification !== cls) return false;
      if (appr !== "all" && String(e.approved) !== appr) return false;
      if (from && e.evaluation_date < from) return false;
      if (q) {
        const s = q.toLowerCase();
        const hay = `${e.number ?? ""} ${e.supplier ?? ""} ${e.nf ?? ""} ${e.evaluator_name ?? ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [evals, q, cls, appr, from]);

  const exportCSV = () => {
    const rows = [
      ["Número", "Data", "Fornecedor", "NF", "Pontos", "Classificação", "Aprovado", "Avaliador", "Solicitação"],
      ...filtered.map((e: any) => [
        e.number, fmtDate(e.evaluation_date), e.supplier, e.nf ?? "", e.total_points,
        CLASS_LABEL[e.classification as keyof typeof CLASS_LABEL], e.approved ? "Sim" : "Não",
        e.evaluator_name, e.purchase_requests?.number ?? "",
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `avaliacoes-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ClipboardCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Avaliações de fornecedores</h1>
            <p className="text-sm text-muted-foreground">{filtered.length} avaliação(ões) · Procedimento P-04 (ISO 9001:2015)</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV} disabled={filtered.length === 0}>
            <Download className="mr-2 h-4 w-4" />Exportar
          </Button>
          {canCreate && (
            <Button asChild><Link to="/evaluations/new"><Plus className="mr-2 h-4 w-4" />Nova avaliação</Link></Button>
          )}
        </div>
      </div>

      {/* Entregas a avaliar */}
      {(pending?.length ?? 0) > 0 && (
        <Card className="p-4 space-y-3 border-warning/40">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Truck className="h-4 w-4 text-warning" /> Entregas a avaliar
            <span className="text-xs font-normal text-muted-foreground">({pending!.length})</span>
          </div>
          <div className="grid gap-2">
            {pending!.slice(0, 6).map((d: any) => (
              <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/20 px-3 py-2">
                <div className="min-w-0">
                  <span className="font-mono text-xs text-muted-foreground mr-2">{d.number}</span>
                  <span className="text-sm">{d.description}</span>
                </div>
                {canCreate && (
                  <Button asChild size="sm" variant="outline">
                    <Link to="/evaluations/new" search={{ request: d.id }}>Avaliar fornecedor <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
                  </Button>
                )}
              </div>
            ))}
            {pending!.length > 6 && <p className="text-xs text-muted-foreground">+ {pending!.length - 6} outra(s) entrega(s) aguardando avaliação.</p>}
          </div>
        </Card>
      )}

      {/* Filtros */}
      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-5">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar por fornecedor, NF, número..." className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={cls} onValueChange={setCls}>
            <SelectTrigger><SelectValue placeholder="Classificação" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas classificações</SelectItem>
              <SelectItem value="otimo">Ótimo</SelectItem>
              <SelectItem value="bom">Bom</SelectItem>
              <SelectItem value="regular">Regular</SelectItem>
              <SelectItem value="insuficiente">Insuficiente</SelectItem>
            </SelectContent>
          </Select>
          <Select value={appr} onValueChange={setAppr}>
            <SelectTrigger><SelectValue placeholder="Aprovação" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Aprovado e não</SelectItem>
              <SelectItem value="true">Aprovado</SelectItem>
              <SelectItem value="false">Não aprovado</SelectItem>
            </SelectContent>
          </Select>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
      </Card>

      {/* Tabela */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Número</th>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Fornecedor</th>
                <th className="px-4 py-3">NF</th>
                <th className="px-4 py-3 text-right">Pontos</th>
                <th className="px-4 py-3">Classificação</th>
                <th className="px-4 py-3">Aprovação</th>
                <th className="px-4 py-3">Avaliador</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">Nenhuma avaliação encontrada</td></tr>
              )}
              {filtered.map((e: any) => (
                <tr key={e.id} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs">
                    <Link to="/evaluations/$id" params={{ id: e.id }} className="text-primary hover:underline">{e.number}</Link>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">{fmtDate(e.evaluation_date)}</td>
                  <td className="px-4 py-3 max-w-xs truncate">{e.supplier}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{e.nf ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-semibold">{e.total_points}</td>
                  <td className="px-4 py-3"><ClassificationBadge classification={e.classification} /></td>
                  <td className="px-4 py-3">
                    {e.approved
                      ? <span className="inline-flex items-center gap-1 text-success text-xs"><CheckCircle2 className="h-3.5 w-3.5" />Aprovado</span>
                      : <span className="inline-flex items-center gap-1 text-destructive text-xs"><XCircle className="h-3.5 w-3.5" />Não</span>}
                  </td>
                  <td className="px-4 py-3 text-xs">{e.evaluator_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
