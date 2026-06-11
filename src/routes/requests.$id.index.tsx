import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge, PriorityBadge, ClassificationBadge } from "@/components/StatusBadge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/lib/auth";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, XCircle, PackageCheck, Download, Send, Trash2, Pencil, ShoppingCart, Truck, Ban, ClipboardCheck, ArrowRight, Paperclip } from "lucide-react";
import { format } from "date-fns";

export const Route = createFileRoute("/requests/$id/")({
  component: RequestDetail,
});

function RequestDetail() {
  const { id } = Route.useParams();
  const { user, roles } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [comment, setComment] = useState("");
  const [decisionNote, setDecisionNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [purchaseAmount, setPurchaseAmount] = useState("");
  const [unitPrices, setUnitPrices] = useState<Record<string, string>>({});
  const [buyQty, setBuyQty] = useState<Record<string, string>>({});


  const { data: req } = useQuery({
    queryKey: ["request", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("purchase_requests")
        .select("*, sectors(code,name,approver_id), cost_centers(code,name)")
        .eq("id", id).single();
      if (!data) return null;
      const { data: prof } = await supabase.from("profiles").select("full_name,email").eq("id", data.requester_id).single();
      return { ...data, profiles: prof };
    },
  });
  const { data: comments } = useQuery({
    queryKey: ["comments", id],
    queryFn: async () => {
      const { data } = await supabase.from("request_comments").select("*").eq("request_id", id).order("created_at");
      if (!data) return [];
      const ids = Array.from(new Set(data.map((c) => c.user_id)));
      const { data: profs } = await supabase.from("profiles").select("id,full_name,email").in("id", ids);
      const map = new Map((profs ?? []).map((p) => [p.id, p]));
      return data.map((c) => ({ ...c, profiles: map.get(c.user_id) }));
    },
  });
  const { data: history } = useQuery({
    queryKey: ["history", id],
    queryFn: async () => {
      const { data } = await supabase.from("request_history").select("*").eq("request_id", id).order("created_at");
      if (!data) return [];
      const ids = Array.from(new Set(data.map((h) => h.user_id).filter(Boolean))) as string[];
      const { data: profs } = await supabase.from("profiles").select("id,full_name,email").in("id", ids);
      const map = new Map((profs ?? []).map((p) => [p.id, p]));
      return data.map((h) => ({ ...h, profiles: h.user_id ? map.get(h.user_id) : null }));
    },
  });
  const { data: attachments } = useQuery({
    queryKey: ["att", id],
    queryFn: async () => (await supabase.from("request_attachments").select("*").eq("request_id", id)).data ?? [],
  });
  const { data: reqItems } = useQuery({
    queryKey: ["request_items", id],
    queryFn: async () => {
      const { data } = await supabase.from("request_items").select("*, items(code,description,supplier,avg_price)").eq("request_id", id).order("position");
      return data ?? [];
    },
  });
  const { data: purchaseEntries } = useQuery({
    queryKey: ["purchase_entries", id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("purchase_entries")
        .select("*, request_items(description, unit)")
        .eq("request_id", id)
        .order("created_at", { ascending: false });
      if (!data) return [];
      const ids = Array.from(new Set(data.map((e: any) => e.created_by).filter(Boolean))) as string[];
      const { data: profs } = await supabase.from("profiles").select("id,full_name,email").in("id", ids);
      const map = new Map((profs ?? []).map((p) => [p.id, p]));
      return data.map((e: any) => ({ ...e, profiles: map.get(e.created_by) }));
    },
  });
  const { data: evaluation } = useQuery({
    queryKey: ["request-evaluation", id],
    queryFn: async () =>
      (await supabase
        .from("supplier_evaluations")
        .select("id,number,total_points,classification,approved,returned,evaluator_name,observation,created_at")
        .eq("request_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()).data,
  });

  if (!req) return <div className="text-muted-foreground">Carregando...</div>;

  const isApprover = req.sectors?.approver_id === user?.id || roles.includes("admin");
  const isOwner = req.requester_id === user?.id;
  const canDecide = isApprover && req.status === "pendente";
  const canFinalize = (roles.includes("comprador") || roles.includes("admin")) && (req.status === "aprovado" || req.status === "parcial" || req.status === "comprado");

  const decide = async (newStatus: "aprovado" | "negado") => {
    setBusy(true);
    const { error } = await supabase.from("purchase_requests").update({
      status: newStatus, approver_id: user!.id, decided_at: new Date().toISOString(), decision_note: decisionNote || null,
    }).eq("id", id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(newStatus === "aprovado" ? "Solicitação aprovada" : "Solicitação negada");
    qc.invalidateQueries({ queryKey: ["request", id] });
    qc.invalidateQueries({ queryKey: ["history", id] });
  };

  const finalize = async () => {
    setBusy(true);
    const { error } = await supabase.from("purchase_requests").update({
      status: "finalizado", finalized_at: new Date().toISOString(),
    }).eq("id", id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Compra finalizada");
    qc.invalidateQueries({ queryKey: ["request", id] });
    qc.invalidateQueries({ queryKey: ["history", id] });
  };

  const markPurchased = async () => {
    const amount = parseFloat(purchaseAmount.replace(",", "."));
    if (!purchaseAmount || isNaN(amount) || amount <= 0) {
      return toast.error("Informe o valor da compra");
    }
    setBusy(true);
    const { error } = await supabase.from("purchase_requests").update({
      purchased_at: new Date().toISOString(),
      purchase_amount: amount,
      status: "comprado",
    }).eq("id", id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Compra registrada");
    setPurchaseAmount("");
    qc.invalidateQueries({ queryKey: ["request", id] });
  };

  // Registra uma compra (total ou parcial) a partir dos itens: para cada item
  // informa-se a quantidade comprada agora e o preço unitário. Cada lançamento
  // vira um registro em purchase_entries e acumula em request_items.purchased_quantity.
  const registerPartial = async () => {
    if (!reqItems || reqItems.length === 0) return toast.error("Sem itens");
    const rows = reqItems.map((it: any) => {
      const already = Number(it.purchased_quantity ?? 0);
      const remaining = Number(it.quantity) - already;
      // preço só conta se foi digitado agora nesta tela
      const priceRaw = unitPrices[it.id];
      const hasPrice = priceRaw !== undefined && String(priceRaw).trim() !== "" && !isNaN(parseFloat(String(priceRaw).replace(",", ".")));
      const price = hasPrice ? parseFloat(String(priceRaw).replace(",", ".")) : NaN;
      // quantidade: usa o que foi digitado; se em branco, assume o que falta
      const qtyTyped = buyQty[it.id] !== undefined && String(buyQty[it.id]).trim() !== "";
      const qty = qtyTyped ? parseFloat(String(buyQty[it.id]).replace(",", ".")) : remaining;
      return { it, already, remaining, qty, price, hasPrice, qtyTyped };
    });
    // um item só entra nesta compra se você informou o preço dele
    const buying = rows.filter((r) => r.hasPrice && !isNaN(r.qty) && r.qty > 0);
    // digitou quantidade mas esqueceu o preço? avisa
    const missingPrice = rows.find((r) => r.qtyTyped && r.qty > 0 && !r.hasPrice);
    if (missingPrice) return toast.error(`Informe o preço unitário de "${missingPrice.it.description}"`);
    if (buying.length === 0) return toast.error("Informe o preço de pelo menos um item para registrar a compra");
    for (const r of buying) {
      if (r.qty > r.remaining + 1e-9) {
        return toast.error(`"${r.it.description}": quantidade acima do pendente (${r.remaining} ${r.it.unit})`);
      }
      if (r.price < 0) {
        return toast.error(`Preço inválido em "${r.it.description}"`);
      }
    }
    setBusy(true);
    const entries = buying.map((r) => ({
      request_id: id, request_item_id: r.it.id,
      quantity: r.qty, unit_price: r.price, created_by: user!.id,
    }));
    const { error: eErr } = await (supabase as any).from("purchase_entries").insert(entries);
    if (eErr) { setBusy(false); return toast.error(eErr.message); }
    for (const r of buying) {
      const { error } = await supabase.from("request_items")
        .update({ purchased_quantity: r.already + r.qty, unit_price: r.price } as any)
        .eq("id", r.it.id);
      if (error) { setBusy(false); return toast.error(error.message); }
    }
    // recalcula estado da solicitação
    const allFull = rows.every((r) => {
      const bought = r.already + (buying.find((b) => b.it.id === r.it.id)?.qty ?? 0);
      return bought >= Number(r.it.quantity) - 1e-9;
    });
    const addAmount = buying.reduce((s, r) => s + r.price * r.qty, 0);
    const newAmount = Number(req.purchase_amount ?? 0) + addAmount;
    const { error } = await supabase.from("purchase_requests").update({
      purchased_at: req.purchased_at ?? new Date().toISOString(),
      purchase_amount: newAmount,
      status: allFull ? "comprado" : "parcial",
    }).eq("id", id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(allFull ? "Compra registrada (completa)" : "Compra parcial registrada");
    setUnitPrices({});
    setBuyQty({});
    qc.invalidateQueries({ queryKey: ["request", id] });
    qc.invalidateQueries({ queryKey: ["request_items", id] });
    qc.invalidateQueries({ queryKey: ["purchase_entries", id] });
    qc.invalidateQueries({ queryKey: ["history", id] });
  };

  const markArrived = async () => {
    setBusy(true);
    const nowIso = new Date().toISOString();
    const { error } = await supabase.from("purchase_requests").update({
      arrived_at: nowIso,
      status: "finalizado",
      finalized_at: req.finalized_at ?? nowIso,
    }).eq("id", id);
    if (!error) {
      await supabase.from("notifications").insert({
        user_id: req.requester_id,
        request_id: id,
        title: "Material recebido",
        body: `O material da solicitação ${req.number} chegou.`,
      });
    }
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Chegada registrada e solicitante notificado");
    qc.invalidateQueries({ queryKey: ["request", id] });
    qc.invalidateQueries({ queryKey: ["history", id] });
  };

  const canDelete = roles.includes("admin") || (req.requester_id === user?.id && req.status === "pendente");
  const canEdit = canDelete;
  const canPurchase = (roles.includes("comprador") || roles.includes("admin")) && (req.status === "aprovado" || req.status === "parcial" || req.status === "comprado") && !req.arrived_at;
  const itemsFullyPurchased = !!reqItems && reqItems.length > 0 &&
    reqItems.every((it: any) => Number(it.purchased_quantity ?? 0) >= Number(it.quantity) - 1e-9);
  // o que está preenchido na tabela completaria a solicitação? (define o rótulo do botão)
  const purchaseWouldComplete = !!reqItems && reqItems.length > 0 && reqItems.every((it: any) => {
    const already = Number(it.purchased_quantity ?? 0);
    const remaining = Math.max(Number(it.quantity) - already, 0);
    const priceRaw = unitPrices[it.id];
    const hasPrice = priceRaw !== undefined && String(priceRaw).trim() !== "" && !isNaN(parseFloat(String(priceRaw).replace(",", ".")));
    const qtyTyped = buyQty[it.id] !== undefined && String(buyQty[it.id]).trim() !== "";
    const qtyNow = qtyTyped ? (parseFloat(String(buyQty[it.id]).replace(",", ".")) || 0) : remaining;
    const buyingThis = hasPrice && qtyNow > 0; // só conta se tem preço
    return already + (buyingThis ? qtyNow : 0) >= Number(it.quantity) - 1e-9;
  });
  const canCancel = (req.requester_id === user?.id || roles.includes("admin")) &&
    (req.status === "pendente" || req.status === "aprovado" || req.status === "parcial" || req.status === "comprado");

  const cancelRequest = async () => {
    setBusy(true);
    const { error } = await supabase.from("purchase_requests").update({
      status: "cancelado",
    }).eq("id", id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Solicitação cancelada");
    qc.invalidateQueries({ queryKey: ["request", id] });
    qc.invalidateQueries({ queryKey: ["history", id] });
    qc.invalidateQueries({ queryKey: ["requests"] });
  };

  const remove = async () => {
    setBusy(true);
    // remove attachments from storage
    const { data: atts } = await supabase.from("request_attachments").select("path").eq("request_id", id);
    if (atts && atts.length > 0) {
      await supabase.storage.from("request-attachments").remove(atts.map((a) => a.path));
    }
    await supabase.from("request_attachments").delete().eq("request_id", id);
    await supabase.from("request_comments").delete().eq("request_id", id);
    await supabase.from("request_history").delete().eq("request_id", id);
    const { error } = await supabase.from("purchase_requests").delete().eq("id", id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Solicitação excluída");
    qc.invalidateQueries({ queryKey: ["requests"] });
    navigate({ to: "/requests" });
  };

  const addComment = async () => {
    if (!comment.trim()) return;
    const { error } = await supabase.from("request_comments").insert({
      request_id: id, user_id: user!.id, content: comment.trim(),
    });
    if (error) return toast.error(error.message);
    setComment("");
    qc.invalidateQueries({ queryKey: ["comments", id] });
  };

  const downloadAtt = async (path: string, filename: string) => {
    const { data, error } = await supabase.storage
      .from("request-attachments")
      .createSignedUrl(path, 60, { download: filename });
    if (error || !data?.signedUrl) return toast.error("Erro ao baixar anexo");
    window.open(data.signedUrl, "_blank");
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild><Link to="/requests"><ArrowLeft className="mr-2 h-4 w-4" />Voltar</Link></Button>
        <div className="flex gap-2">
          {canEdit ? (
            <Button variant="outline" size="sm" asChild>
              <Link to="/requests/$id/edit" params={{ id }}><Pencil className="mr-2 h-4 w-4" />Editar</Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" asChild>
              <Link to="/requests/$id/edit" params={{ id }}><Paperclip className="mr-2 h-4 w-4" />Anexar foto</Link>
            </Button>
          )}
          {canCancel && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={busy}>
                  <Ban className="mr-2 h-4 w-4" />Cancelar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancelar solicitação?</AlertDialogTitle>
                  <AlertDialogDescription>
                    A solicitação {req.number} será marcada como cancelada. Você pode reabri-la editando o status posteriormente.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Voltar</AlertDialogCancel>
                  <AlertDialogAction onClick={cancelRequest}>Confirmar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {canDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={busy}>
                  <Trash2 className="mr-2 h-4 w-4" />Excluir
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir solicitação?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta ação não pode ser desfeita. A solicitação {req.number}, seus comentários, anexos e histórico serão removidos.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={remove}>Excluir</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-mono text-sm text-muted-foreground">{req.number}</div>
          <h1 className="mt-1 text-2xl font-bold">{req.description.slice(0, 80)}</h1>
        </div>
        <div className="flex items-center gap-2">
          <PriorityBadge priority={req.priority} />
          <StatusBadge status={req.status} />
          {evaluation && (
            <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/15 px-2.5 py-0.5 text-xs font-medium text-success">
              <ClipboardCheck className="h-3.5 w-3.5" /> Avaliada
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2 space-y-5">
          {reqItems && reqItems.length > 0 ? (() => {
            const fullyPurchased = reqItems.every((it: any) => Number(it.purchased_quantity ?? 0) >= Number(it.quantity) - 1e-9);
            const editable = canPurchase && !fullyPurchased;
            const anyPartial = reqItems.some((it: any) => Number(it.purchased_quantity ?? 0) > 0);
            const rowsTotals = reqItems.map((it: any) => {
              const fullQty = Number(it.quantity);
              const already = Number(it.purchased_quantity ?? 0);
              const remaining = Math.max(fullQty - already, 0);
              // em edição, só conta o preço digitado agora; fora de edição, o preço já registrado
              const raw = editable ? (unitPrices[it.id] ?? "") : (it.unit_price != null ? String(it.unit_price) : "");
              const parsedPrice = parseFloat(String(raw).replace(",", "."));
              const price = isNaN(parsedPrice) ? null : parsedPrice;
              const qtyNowRaw = buyQty[it.id] ?? (remaining > 0 ? String(remaining) : "");
              const parsedQty = parseFloat(String(qtyNowRaw).replace(",", "."));
              const qtyNow = isNaN(parsedQty) ? 0 : parsedQty;
              // valor da linha: o que está comprando agora (modo edição) ou o que já foi comprado.
              // sem preço digitado, a linha não entra no total desta compra.
              const refQty = editable ? qtyNow : already;
              const total = price != null ? price * refQty : null;
              const avg = it.items?.avg_price != null ? Number(it.items.avg_price) : null;
              const save = price != null && avg != null && avg > 0 ? (avg - price) * refQty : null;
              return { it, fullQty, already, remaining, price, qtyNow, total, avg, save };
            });
            const grandTotal = rowsTotals.reduce((s, r) => s + (r.total ?? 0), 0);
            const grandSave = rowsTotals.reduce((s, r) => s + (r.save ?? 0), 0);
            const hasSavings = rowsTotals.some((r) => r.save != null);
            return (
              <Section title={`Itens (${reqItems.length})`}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase text-muted-foreground">
                      <tr className="border-b">
                        <th className="py-2 text-left font-medium">#</th>
                        <th className="py-2 text-left font-medium">Código</th>
                        <th className="py-2 text-left font-medium">Descrição</th>
                        <th className="py-2 text-right font-medium">Qtd</th>
                        <th className="py-2 text-left font-medium">Un</th>
                        <th className="py-2 text-right font-medium">Comprado</th>
                        <th className="py-2 text-right font-medium">{editable ? "Comprar agora" : "Preço un."}</th>
                        <th className="py-2 text-right font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rowsTotals.map(({ it, fullQty, already, remaining, price, total, avg, save }, idx) => (
                        <tr key={it.id} className="border-b last:border-0">
                          <td className="py-2 text-muted-foreground">{idx + 1}</td>
                          <td className="py-2 font-mono text-xs">{it.items?.code ?? "—"}</td>
                          <td className="py-2">{it.description}</td>
                          <td className="py-2 text-right">{fullQty.toLocaleString("pt-BR")}</td>
                          <td className="py-2">{it.unit}</td>
                          <td className="py-2 text-right">
                            <span className={remaining <= 1e-9 ? "text-success font-medium" : ""}>
                              {already.toLocaleString("pt-BR")}/{fullQty.toLocaleString("pt-BR")}
                            </span>
                            {editable && remaining > 0 && (
                              <div className="text-xs text-muted-foreground">faltam {remaining.toLocaleString("pt-BR")}</div>
                            )}
                          </td>
                          <td className="py-2 text-right">
                            {editable ? (
                              remaining > 0 ? (
                                <div className="flex flex-col items-end gap-1">
                                  <Input
                                    type="number" step="0.01" min="0" max={remaining} placeholder={`Qtd (máx ${remaining})`}
                                    value={buyQty[it.id] ?? String(remaining)}
                                    onChange={(e) => setBuyQty((p) => ({ ...p, [it.id]: e.target.value }))}
                                    className="h-8 w-28 text-right"
                                  />
                                  <Input
                                    type="number" step="0.01" min="0" placeholder="Preço un."
                                    value={unitPrices[it.id] ?? ""}
                                    onChange={(e) => setUnitPrices((p) => ({ ...p, [it.id]: e.target.value }))}
                                    className="h-8 w-28 text-right"
                                  />
                                </div>
                              ) : (
                                <span className="text-xs text-success">completo</span>
                              )
                            ) : (
                              price != null ? `R$ ${price.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"
                            )}
                            {avg != null && avg > 0 && (
                              <div className="text-xs text-muted-foreground">
                                Média: R$ {avg.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                              </div>
                            )}
                            {save != null && save !== 0 && !editable && (
                              <div className={`text-xs ${save > 0 ? "text-success" : "text-destructive"}`}>
                                {save > 0 ? "Economia" : "Acima"}: R$ {Math.abs(save).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                              </div>
                            )}
                          </td>
                          <td className="py-2 text-right font-medium">
                            {total != null ? `R$ ${total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t">
                        <td colSpan={7} className="py-2 text-right text-sm font-semibold">{editable ? "Total desta compra" : "Total comprado"}</td>
                        <td className="py-2 text-right text-sm font-bold">
                          R$ {grandTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                      {!editable && anyPartial && req.purchase_amount != null && (
                        <tr>
                          <td colSpan={7} className="py-1 text-right text-xs text-muted-foreground">Valor total já registrado</td>
                          <td className="py-1 text-right text-xs font-semibold">
                            R$ {Number(req.purchase_amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      )}
                      {hasSavings && (
                        <tr>
                          <td colSpan={7} className="py-1 text-right text-xs text-muted-foreground">Economia {editable ? "desta compra" : "total"} (vs. preço médio)</td>
                          <td className={`py-1 text-right text-xs font-semibold ${grandSave >= 0 ? "text-success" : "text-destructive"}`}>
                            R$ {grandSave.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      )}
                    </tfoot>
                  </table>
                </div>
              </Section>
            );
          })() : (
            <>
              <Section title="Descrição"><p className="whitespace-pre-wrap text-sm">{req.description}</p></Section>
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Quantidade" value={`${req.quantity} ${req.unit}`} />
              </div>
            </>
          )}
          <Section title="Justificativa"><p className="whitespace-pre-wrap text-sm">{req.justification}</p></Section>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Necessário em" value={(() => { const [y,m,d] = String(req.needed_by).split("-").map(Number); return format(new Date(y, m-1, d), "dd/MM/yyyy"); })()} />
            <Field label="Centro de custo" value={req.cost_centers ? `${req.cost_centers.code} — ${req.cost_centers.name}` : "—"} />
            <Field label="Valor da compra" value={req.purchase_amount != null ? `R$ ${Number(req.purchase_amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"} />
          </div>
          {req.decision_note && (
            <Section title="Nota da decisão"><p className="whitespace-pre-wrap text-sm">{req.decision_note}</p></Section>
          )}
        </Card>

        <Card className="p-6 space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Detalhes</h3>
          <Field label="Setor" value={req.sectors ? `${req.sectors.code} — ${req.sectors.name}` : "—"} />
          <Field label="Solicitante" value={req.profiles?.full_name ?? req.profiles?.email ?? "—"} />
          <Field label="Data da solicitação" value={format(new Date(req.created_at), "dd/MM/yyyy HH:mm")} />
          <Field label="Data da aprovação" value={req.decided_at ? format(new Date(req.decided_at), "dd/MM/yyyy HH:mm") : "—"} />
          <Field label="Data da compra" value={req.purchased_at ? format(new Date(req.purchased_at), "dd/MM/yyyy HH:mm") : "—"} />
          <Field label="Data de chegada" value={req.arrived_at ? format(new Date(req.arrived_at), "dd/MM/yyyy HH:mm") : "—"} />
        </Card>
      </div>

      {(canDecide || canFinalize || canPurchase) && (
        <Card className="p-6 space-y-4 border-primary/30">
          <h3 className="text-sm font-semibold">Ações</h3>
          {canDecide && (
            <>
              <Textarea placeholder="Nota (opcional)" value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} rows={2} />
              <div className="flex gap-2">
                <Button onClick={() => decide("aprovado")} disabled={busy} className="bg-success text-success-foreground hover:bg-success/90">
                  <CheckCircle2 className="mr-2 h-4 w-4" />Aprovar
                </Button>
                <Button onClick={() => decide("negado")} disabled={busy} variant="destructive">
                  <XCircle className="mr-2 h-4 w-4" />Negar
                </Button>
              </div>
            </>
          )}
          {canPurchase && (
            <div className="space-y-3">
              {reqItems && reqItems.length > 0 ? (
                !itemsFullyPurchased && (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Informe a quantidade comprada e o preço de cada item na tabela acima. Você pode registrar parte agora e o restante depois — a solicitação fica como <span className="font-medium">Parcial</span> até comprar tudo.
                    </p>
                    <Button onClick={registerPartial} disabled={busy} variant="outline">
                      <ShoppingCart className="mr-2 h-4 w-4" />{purchaseWouldComplete ? "Registrar compra" : "Registrar compra parcial"}
                    </Button>
                  </div>
                )
              ) : (
                !req.purchased_at && (
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="purchase_amount">Valor da compra (R$) *</Label>
                      <Input
                        id="purchase_amount"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0,00"
                        value={purchaseAmount}
                        onChange={(e) => setPurchaseAmount(e.target.value)}
                        className="w-48"
                      />
                    </div>
                    <Button onClick={markPurchased} disabled={busy} variant="outline">
                      <ShoppingCart className="mr-2 h-4 w-4" />Registrar compra
                    </Button>
                  </div>
                )
              )}
              {!req.arrived_at && (
                <Button onClick={markArrived} disabled={busy} variant="outline">
                  <Truck className="mr-2 h-4 w-4" />Registrar chegada do material
                </Button>
              )}
            </div>
          )}
          {canFinalize && !canPurchase && (
            <Button onClick={finalize} disabled={busy} variant="outline">
              <PackageCheck className="mr-2 h-4 w-4" />Marcar como finalizada
            </Button>
          )}
        </Card>
      )}

      {purchaseEntries && purchaseEntries.length > 0 && (
        <Card className="p-6 space-y-3">
          <h3 className="text-sm font-semibold">Compras registradas</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 text-left font-medium">Data</th>
                  <th className="py-2 text-left font-medium">Item</th>
                  <th className="py-2 text-right font-medium">Qtd</th>
                  <th className="py-2 text-right font-medium">Preço un.</th>
                  <th className="py-2 text-right font-medium">Total</th>
                  <th className="py-2 text-left font-medium">Comprador</th>
                </tr>
              </thead>
              <tbody>
                {purchaseEntries.map((e: any) => (
                  <tr key={e.id} className="border-b last:border-0">
                    <td className="py-2 text-muted-foreground">{format(new Date(e.created_at), "dd/MM/yyyy HH:mm")}</td>
                    <td className="py-2">{e.request_items?.description ?? "—"}</td>
                    <td className="py-2 text-right">{Number(e.quantity).toLocaleString("pt-BR")} {e.request_items?.unit ?? ""}</td>
                    <td className="py-2 text-right">R$ {Number(e.unit_price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                    <td className="py-2 text-right font-medium">R$ {(Number(e.unit_price) * Number(e.quantity)).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                    <td className="py-2 text-muted-foreground">{e.profiles?.full_name ?? e.profiles?.email ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {(evaluation || (req.arrived_at && (roles.includes("comprador") || roles.includes("admin")))) && (
        <Card className="p-6 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <ClipboardCheck className="h-4 w-4 text-primary" /> Avaliação do fornecedor
            </h3>
            {evaluation && (
              <Button asChild size="sm" variant="outline">
                <Link to="/evaluations/$id" params={{ id: evaluation.id }}>Ver avaliação <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
              </Button>
            )}
          </div>
          {evaluation ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-xs text-muted-foreground">{evaluation.number}</span>
                <ClassificationBadge classification={evaluation.classification} />
                <span className="text-sm font-semibold">{evaluation.total_points} <span className="font-normal text-muted-foreground">/ 100</span></span>
                {evaluation.approved
                  ? <span className="inline-flex items-center gap-1 text-success text-xs"><CheckCircle2 className="h-3.5 w-3.5" />Aprovado</span>
                  : <span className="inline-flex items-center gap-1 text-destructive text-xs"><XCircle className="h-3.5 w-3.5" />Não aprovado</span>}
              </div>
              <p className="text-xs text-muted-foreground">Avaliado por {evaluation.evaluator_name}{evaluation.created_at ? ` em ${format(new Date(evaluation.created_at), "dd/MM/yyyy")}` : ""}.</p>
              {evaluation.observation && <p className="whitespace-pre-wrap text-sm">{evaluation.observation}</p>}
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">Material recebido. Avalie o fornecedor no ato da entrega (Procedimento P-04).</p>
              <Button asChild size="sm">
                <Link to="/evaluations/new" search={{ request: id }}>Avaliar fornecedor <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
              </Button>
            </div>
          )}
        </Card>
      )}

      {attachments && attachments.length > 0 && (
        <Card className="p-6 space-y-3">
          <h3 className="text-sm font-semibold">Anexos</h3>
          <ul className="space-y-2">
            {attachments.map((a) => (
              <li key={a.id} className="flex items-center justify-between rounded bg-muted/40 px-3 py-2 text-sm">
                <span className="truncate">{a.filename}</span>
                <Button size="sm" variant="ghost" onClick={() => downloadAtt(a.path, a.filename)}>
                  <Download className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-6 space-y-4">
        <h3 className="text-sm font-semibold">Comentários internos</h3>
        <div className="space-y-3">
          {comments?.length === 0 && <p className="text-sm text-muted-foreground">Sem comentários ainda</p>}
          {comments?.map((c: any) => (
            <div key={c.id} className="rounded-lg border bg-muted/30 p-3">
              <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{c.profiles?.full_name ?? c.profiles?.email}</span>
                <span>{format(new Date(c.created_at), "dd/MM/yyyy HH:mm")}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm">{c.content}</p>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Textarea placeholder="Escreva um comentário..." value={comment} onChange={(e) => setComment(e.target.value)} rows={2} />
          <Button onClick={addComment}><Send className="h-4 w-4" /></Button>
        </div>
      </Card>

      <Card className="p-6 space-y-3">
        <h3 className="text-sm font-semibold">Histórico</h3>
        <ul className="space-y-2 text-sm">
          {history?.map((h: any) => (
            <li key={h.id} className="flex items-center gap-3 text-muted-foreground">
              <span className="text-xs">{format(new Date(h.created_at), "dd/MM/yyyy HH:mm")}</span>
              <span className="font-medium text-foreground">{h.profiles?.full_name ?? h.profiles?.email ?? "Sistema"}</span>
              <span>
                {h.action === "created" ? "criou a solicitação" :
                  `mudou status de ${h.from_status ?? "—"} para ${h.to_status}`}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}
