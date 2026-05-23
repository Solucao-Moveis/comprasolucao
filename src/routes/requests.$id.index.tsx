import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge, PriorityBadge } from "@/components/StatusBadge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/lib/auth";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, XCircle, PackageCheck, Download, Send, Trash2, Pencil, ShoppingCart, Truck, Ban } from "lucide-react";
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
      const { data } = await supabase.from("request_items").select("*, items(code,description,supplier)").eq("request_id", id).order("position");
      return data ?? [];
    },
  });

  if (!req) return <div className="text-muted-foreground">Carregando...</div>;

  const isApprover = req.sectors?.approver_id === user?.id || roles.includes("admin");
  const isOwner = req.requester_id === user?.id;
  const canDecide = isApprover && req.status === "pendente";
  const canFinalize = (roles.includes("comprador") || roles.includes("admin")) && (req.status === "aprovado" || req.status === "comprado");

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
  const canPurchase = (roles.includes("comprador") || roles.includes("admin")) && (req.status === "aprovado" || req.status === "comprado") && !req.arrived_at;
  const canCancel = (req.requester_id === user?.id || roles.includes("admin")) &&
    (req.status === "pendente" || req.status === "aprovado" || req.status === "comprado");

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
          {canEdit && (
            <Button variant="outline" size="sm" asChild>
              <Link to="/requests/$id/edit" params={{ id }}><Pencil className="mr-2 h-4 w-4" />Editar</Link>
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
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2 space-y-5">
          {reqItems && reqItems.length > 0 ? (
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
                    </tr>
                  </thead>
                  <tbody>
                    {reqItems.map((it: any, idx: number) => (
                      <tr key={it.id} className="border-b last:border-0">
                        <td className="py-2 text-muted-foreground">{idx + 1}</td>
                        <td className="py-2 font-mono text-xs">{it.items?.code ?? "—"}</td>
                        <td className="py-2">{it.description}</td>
                        <td className="py-2 text-right">{Number(it.quantity).toLocaleString("pt-BR")}</td>
                        <td className="py-2">{it.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          ) : (
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
              {!req.purchased_at && (
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
