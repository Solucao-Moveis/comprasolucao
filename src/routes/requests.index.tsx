import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge, PriorityBadge } from "@/components/StatusBadge";
import { useMemo, useState } from "react";
import { Plus, Search, Download } from "lucide-react";
import { format } from "date-fns";

export const Route = createFileRoute("/requests/")({
  component: () => <AppLayout><RequestsList /></AppLayout>,
});

function RequestsList() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [sector, setSector] = useState<string>("all");
  const [priority, setPriority] = useState<string>("all");
  const [from, setFrom] = useState("");

  const { data: sectors } = useQuery({
    queryKey: ["sectors"],
    queryFn: async () => (await supabase.from("sectors").select("id,name").order("name")).data ?? [],
  });

  const { data: requests } = useQuery({
    queryKey: ["requests"],
    queryFn: async () => {
      const { data } = await supabase
        .from("purchase_requests")
        .select("*, sectors(name)")
        .order("created_at", { ascending: false });
      if (!data) return [];
      const ids = Array.from(new Set(data.map((r) => r.requester_id)));
      const { data: profs } = await supabase.from("profiles").select("id,full_name,email").in("id", ids);
      const map = new Map((profs ?? []).map((p) => [p.id, p]));
      return data.map((r) => ({ ...r, profiles: map.get(r.requester_id) }));
    },
  });

  const filtered = useMemo(() => {
    return (requests ?? []).filter((r: any) => {
      if (status !== "all" && r.status !== status) return false;
      if (sector !== "all" && r.sector_id !== sector) return false;
      if (priority !== "all" && r.priority !== priority) return false;
      if (from && new Date(r.created_at) < new Date(from)) return false;
      
      if (q) {
        const s = q.toLowerCase();
        const hay = `${r.number} ${r.description} ${r.profiles?.full_name ?? ""} ${r.profiles?.email ?? ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [requests, q, status, sector, priority, from]);

  const exportCSV = () => {
    const rows = [
      ["Número", "Status", "Prioridade", "Setor", "Solicitante", "Descrição", "Quantidade", "Unidade", "Data", "Necessário em"],
      ...filtered.map((r: any) => [
        r.number, r.status, r.priority, r.sectors?.name ?? "",
        r.profiles?.full_name ?? r.profiles?.email ?? "",
        r.description.replace(/[\n;,]/g, " "), r.quantity, r.unit,
        format(new Date(r.created_at), "yyyy-MM-dd"),
        r.needed_by,
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `solicitacoes-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Solicitações</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} resultado(s)</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV}><Download className="mr-2 h-4 w-4" />Exportar</Button>
          <Button asChild><Link to="/requests/new"><Plus className="mr-2 h-4 w-4" />Nova solicitação</Link></Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-6">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar por número, descrição..." className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="aprovado">Aprovado</SelectItem>
              <SelectItem value="negado">Negado</SelectItem>
              <SelectItem value="finalizado">Finalizado</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sector} onValueChange={setSector}>
            <SelectTrigger><SelectValue placeholder="Setor" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos setores</SelectItem>
              {sectors?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger><SelectValue placeholder="Prioridade" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas prioridades</SelectItem>
              <SelectItem value="baixa">Baixa</SelectItem>
              <SelectItem value="media">Média</SelectItem>
              <SelectItem value="alta">Alta</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Número</th>
                <th className="px-4 py-3">Descrição</th>
                <th className="px-4 py-3">Setor</th>
                <th className="px-4 py-3">Solicitante</th>
                <th className="px-4 py-3">Prioridade</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Data</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">Nenhuma solicitação encontrada</td></tr>
              )}
              {filtered.map((r: any) => (
                <tr key={r.id} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs">
                    <Link to="/requests/$id" params={{ id: r.id }} className="text-primary hover:underline">{r.number}</Link>
                  </td>
                  <td className="px-4 py-3 max-w-xs truncate">{r.description}</td>
                  <td className="px-4 py-3">{r.sectors?.name}</td>
                  <td className="px-4 py-3">{r.profiles?.full_name ?? r.profiles?.email}</td>
                  <td className="px-4 py-3"><PriorityBadge priority={r.priority} /></td>
                  <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-3 text-muted-foreground">{format(new Date(r.created_at), "dd/MM/yyyy")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
