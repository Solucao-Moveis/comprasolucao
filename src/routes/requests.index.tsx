import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ALLOWED_SECTOR_CODES } from "@/lib/sectors";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { StatusBadge, PriorityBadge } from "@/components/StatusBadge";
import { Checkbox } from "@/components/ui/checkbox";
import { useMemo, useState } from "react";
import { Plus, Search, Download, Pencil, Trash2, FileText } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/requests/")({
  component: () => <AppLayout><RequestsList /></AppLayout>,
});

function RequestsList() {
  const { user, roles } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [sector, setSector] = useState<string>("all");
  const [priority, setPriority] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: sectors } = useQuery({
    queryKey: ["sectors"],
    queryFn: async () => (await supabase.from("sectors").select("id,code,name").in("code", ALLOWED_SECTOR_CODES).order("code")).data ?? [],
  });

  const { data: requests } = useQuery({
    queryKey: ["requests"],
    queryFn: async () => {
      const { data } = await supabase
        .from("purchase_requests")
        .select("*, sectors(code,name), items(code)")
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
    // Se houver itens marcados, exporta só os selecionados; senão, exporta tudo que está na lista.
    const source = selected.size > 0 ? filtered.filter((r: any) => selected.has(r.id)) : filtered;
    const rows = [
      ["Número", "Status", "Prioridade", "Setor", "Solicitante", "Descrição", "Quantidade", "Unidade", "Data", "Necessário em"],
      ...source.map((r: any) => [
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

  const allVisibleSelected = filtered.length > 0 && filtered.every((r: any) => selected.has(r.id));
  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) filtered.forEach((r: any) => next.delete(r.id));
      else filtered.forEach((r: any) => next.add(r.id));
      return next;
    });
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const generateReport = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return toast.error("Selecione ao menos uma solicitação");
    const rows = (requests ?? []).filter((r: any) => selected.has(r.id));
    const { data: enrichData } = await supabase
      .from("purchase_requests")
      .select("id,cost_centers(code,name)")
      .in("id", ids);
    const enrich = new Map((enrichData ?? []).map((x: any) => [x.id, x]));

    const { data: riData } = await supabase
      .from("request_items")
      .select("request_id,item_id,description,quantity,unit,position,items(code,description)")
      .in("request_id", ids)
      .order("position");
    const itemsByReq = new Map<string, any[]>();
    (riData ?? []).forEach((it: any) => {
      const arr = itemsByReq.get(it.request_id) ?? [];
      arr.push(it);
      itemsByReq.set(it.request_id, arr);
    });

    // Consolidate items across selected requests (sum by item_id when present, else by code+description+unit)
    const agg = new Map<string, { code: string; description: string; unit: string; quantity: number; requests: Set<string> }>();
    (riData ?? []).forEach((it: any) => {
      const code = it.items?.code ?? "";
      const desc = it.items?.description ?? it.description ?? "";
      const unit = it.unit ?? "";
      const key = it.item_id ? `id:${it.item_id}|${unit}` : `txt:${code}|${desc}|${unit}`;
      const cur = agg.get(key) ?? { code, description: desc, unit, quantity: 0, requests: new Set<string>() };
      cur.quantity += Number(it.quantity) || 0;
      cur.requests.add(it.request_id);
      agg.set(key, cur);
    });
    const consolidated = Array.from(agg.values()).sort((a, b) => (a.code || a.description).localeCompare(b.code || b.description));

    const fmtBRL = (v: any) => v == null ? "—" : `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
    const fmtNum = (v: any) => Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
    const esc = (s: any) => String(s ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));
    const total = rows.reduce((s: number, r: any) => s + Number(r.purchase_amount || 0), 0);

    const reqRowsHtml = rows.flatMap((r: any) => {
      const its = itemsByReq.get(r.id) ?? [];
      if (its.length === 0) {
        return [`<tr>
          <td>${esc(r.number)}</td><td>${esc(r.status)}</td>
          <td>${esc(r.sectors ? `${r.sectors.code} — ${r.sectors.name}` : "—")}</td>
          <td>—</td><td>${esc(r.description)}</td>
          <td>${esc(r.quantity)} ${esc(r.unit)}</td>
          <td>${fmtBRL(r.purchase_amount)}</td>
          <td>${esc(format(new Date(r.created_at), "dd/MM/yyyy"))}</td>
        </tr>`];
      }
      return its.map((it: any, idx: number) => `<tr>
        <td>${idx === 0 ? esc(r.number) : ""}</td>
        <td>${idx === 0 ? esc(r.status) : ""}</td>
        <td>${idx === 0 ? esc(r.sectors ? `${r.sectors.code} — ${r.sectors.name}` : "—") : ""}</td>
        <td>${esc(it.items?.code ?? "—")}</td>
        <td>${esc(it.items?.description ?? it.description)}</td>
        <td>${fmtNum(it.quantity)} ${esc(it.unit)}</td>
        <td>${idx === 0 ? fmtBRL(r.purchase_amount) : ""}</td>
        <td>${idx === 0 ? esc(format(new Date(r.created_at), "dd/MM/yyyy")) : ""}</td>
      </tr>`);
    }).join("");

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Relatório de Solicitações</title>
<style>
body{font-family:system-ui,sans-serif;color:#111;padding:24px;max-width:960px;margin:0 auto}
h1{font-size:20px;margin:0 0 4px}h2{font-size:14px;margin:18px 0 6px;color:#444}
.meta{font-size:12px;color:#666;margin-bottom:16px}
.card{border:1px solid #ddd;border-radius:8px;padding:14px;margin-bottom:12px;page-break-inside:avoid}
.row{display:flex;justify-content:space-between;gap:12px;font-size:13px;margin:2px 0}
.label{color:#666}.val{font-weight:500}
.tag{display:inline-block;font-size:11px;padding:2px 8px;border-radius:999px;background:#eef;border:1px solid #cce;margin-right:6px}
.total{margin-top:18px;font-size:14px;font-weight:600;text-align:right}
table{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px}
th,td{border:1px solid #ddd;padding:6px;text-align:left;vertical-align:top}
th{background:#f5f5f7}
ul.items{margin:4px 0 0 18px;padding:0;font-size:12px}
@media print{.no-print{display:none}}
</style></head><body>
<div class="no-print" style="margin-bottom:12px"><button onclick="window.print()">Imprimir / Salvar PDF</button></div>
<h1>Relatório de Solicitações de Compra</h1>
<div class="meta">Gerado em ${new Date().toLocaleString("pt-BR")} · ${rows.length} solicitação(ões)</div>

<h2>Itens consolidados</h2>
<table>
<thead><tr><th>Código</th><th>Descrição</th><th>Qtd. total</th><th>Unidade</th><th>Solicitações</th></tr></thead>
<tbody>
${consolidated.map((c) => `<tr>
  <td>${esc(c.code || "—")}</td>
  <td>${esc(c.description)}</td>
  <td>${fmtNum(c.quantity)}</td>
  <td>${esc(c.unit)}</td>
  <td>${c.requests.size}</td>
</tr>`).join("")}
</tbody>
</table>

<h2>Solicitações</h2>
<table>
<thead><tr><th>Número</th><th>Status</th><th>Setor</th><th>Cód.</th><th>Descrição</th><th>Qtd.</th><th>Valor</th><th>Data</th></tr></thead>
<tbody>
${reqRowsHtml}
</tbody>
</table>
<div class="total">Total comprado: ${fmtBRL(total)}</div>

<h2>Detalhamento</h2>
${rows.map((r: any) => {
  const ex = enrich.get(r.id) as any;
  const its = itemsByReq.get(r.id) ?? [];
  return `<div class="card">
  <div class="row"><span><span class="tag">${esc(r.number)}</span><span class="tag">${esc(r.status)}</span><span class="tag">${esc(r.priority)}</span></span><span class="label">${esc(format(new Date(r.created_at), "dd/MM/yyyy"))}</span></div>
  <div class="row"><span class="label">Solicitante</span><span class="val">${esc(r.profiles?.full_name ?? r.profiles?.email ?? "—")}</span></div>
  <div class="row"><span class="label">Setor</span><span class="val">${esc(r.sectors ? `${r.sectors.code} — ${r.sectors.name}` : "—")}</span></div>
  <div class="row"><span class="label">Centro de custo</span><span class="val">${esc(ex?.cost_centers ? `${ex.cost_centers.code} — ${ex.cost_centers.name}` : "—")}</span></div>
  <div class="row"><span class="label">Itens</span><span class="val">${its.length || 1}</span></div>
  ${its.length > 0
    ? `<ul class="items">${its.map((it: any) => `<li>${esc(it.items?.code ?? "—")} — ${esc(it.items?.description ?? it.description)} · ${fmtNum(it.quantity)} ${esc(it.unit)}</li>`).join("")}</ul>`
    : `<div class="row"><span class="label">Descrição</span><span class="val">${esc(r.description)} (${esc(r.quantity)} ${esc(r.unit)})</span></div>`}
  <div class="row"><span class="label">Necessário em</span><span class="val">${esc(r.needed_by)}</span></div>
  <div class="row"><span class="label">Justificativa</span><span class="val">${esc(r.justification)}</span></div>
  <div class="row"><span class="label">Valor da compra</span><span class="val">${fmtBRL(r.purchase_amount)}</span></div>
  ${r.decision_note ? `<div class="row"><span class="label">Decisão</span><span class="val">${esc(r.decision_note)}</span></div>` : ""}
</div>`;
}).join("")}
</body></html>`;
    const w = window.open("", "_blank");
    if (!w) return toast.error("Habilite popups para gerar o relatório");
    w.document.write(html);
    w.document.close();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Solicitações</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} resultado(s){selected.size > 0 && ` · ${selected.size} selecionada(s)`}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={generateReport} disabled={selected.size === 0}>
            <FileText className="mr-2 h-4 w-4" />Gerar relatório
          </Button>
          <Button variant="outline" onClick={exportCSV}>
            <Download className="mr-2 h-4 w-4" />Exportar{selected.size > 0 ? ` (${selected.size})` : ""}
          </Button>
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
              <SelectItem value="comprado">Comprado</SelectItem>
              <SelectItem value="finalizado">Finalizado</SelectItem>
              <SelectItem value="cancelado">Cancelado</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sector} onValueChange={setSector}>
            <SelectTrigger><SelectValue placeholder="Setor" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos setores</SelectItem>
              {sectors?.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.code} — {s.name}</SelectItem>)}
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
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-10 px-3 py-3">
                  <Checkbox checked={allVisibleSelected} onCheckedChange={toggleAll} aria-label="Selecionar todas" />
                </th>
                <th className="px-4 py-3">Número</th>
                <th className="px-4 py-3">Abertura</th>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Descrição</th>
                <th className="px-4 py-3">Setor</th>
                <th className="px-4 py-3">Solicitante</th>
                <th className="px-4 py-3">Prioridade</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">Nenhuma solicitação encontrada</td></tr>
              )}
              {filtered.map((r: any) => {
                const canModify = roles.includes("admin") || (r.requester_id === user?.id && r.status === "pendente");
                return (
                <tr key={r.id} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-3">
                    <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggleOne(r.id)} aria-label={`Selecionar ${r.number}`} />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    <Link to="/requests/$id" params={{ id: r.id }} className="text-primary hover:underline">{r.number}</Link>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">{format(new Date(r.created_at), "dd/MM/yyyy")}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.items?.code ?? "—"}</td>
                  <td className="px-4 py-3 max-w-xs truncate">{r.description}</td>
                  <td className="px-4 py-3">{r.sectors ? `${r.sectors.code} — ${r.sectors.name}` : "—"}</td>
                  <td className="px-4 py-3">{r.profiles?.full_name ?? r.profiles?.email}</td>
                  <td className="px-4 py-3"><PriorityBadge priority={r.priority} /></td>
                  <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      {canModify && (
                        <>
                          <Button asChild size="icon" variant="ghost" title="Editar">
                            <Link to="/requests/$id/edit" params={{ id: r.id }}><Pencil className="h-4 w-4" /></Link>
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="icon" variant="ghost" title="Excluir"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir solicitação?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  A solicitação {r.number} e seus comentários, anexos e histórico serão removidos permanentemente.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={async () => {
                                    const { data: atts } = await supabase.from("request_attachments").select("path").eq("request_id", r.id);
                                    if (atts && atts.length > 0) {
                                      await supabase.storage.from("request-attachments").remove(atts.map((a) => a.path));
                                    }
                                    await supabase.from("request_attachments").delete().eq("request_id", r.id);
                                    await supabase.from("request_comments").delete().eq("request_id", r.id);
                                    await supabase.from("request_history").delete().eq("request_id", r.id);
                                    const { error } = await supabase.from("purchase_requests").delete().eq("id", r.id);
                                    if (error) return toast.error(error.message);
                                    toast.success("Solicitação excluída");
                                    qc.invalidateQueries({ queryKey: ["requests"] });
                                  }}
                                >Excluir</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
