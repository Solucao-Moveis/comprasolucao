import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge, PriorityBadge } from "@/components/StatusBadge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/lib/auth";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, XCircle, PackageCheck, Download, Send, Trash2 } from "lucide-react";
import { format } from "date-fns";

export const Route = createFileRoute("/requests/$id")({
  component: () => <AppLayout><RequestDetail /></AppLayout>,
});

function RequestDetail() {
  const { id } = Route.useParams();
  const { user, roles } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [comment, setComment] = useState("");
  const [decisionNote, setDecisionNote] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: req } = useQuery({
    queryKey: ["request", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("purchase_requests")
        .select("*, sectors(name,approver_id), cost_centers(code,name)")
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

  if (!req) return <div className="text-muted-foreground">Carregando...</div>;

  const isApprover = req.sectors?.approver_id === user?.id || roles.includes("admin");
  const isOwner = req.requester_id === user?.id;
  const canDecide = isApprover && req.status === "pendente";
  const canFinalize = (roles.includes("comprador") || roles.includes("admin")) && req.status === "aprovado";

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

  const canDelete = roles.includes("admin") || (req.requester_id === user?.id && req.status === "pendente");

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
    const { data, error } = await supabase.storage.from("request-attachments").createSignedUrl(path, 60);
    if (error || !data) return toast.error("Erro ao baixar");
    const a = document.createElement("a");
    a.href = data.signedUrl; a.download = filename; a.target = "_blank"; a.click();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild><Link to="/requests"><ArrowLeft className="mr-2 h-4 w-4" />Voltar</Link></Button>
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
          <Section title="Descrição"><p className="whitespace-pre-wrap text-sm">{req.description}</p></Section>
          <Section title="Justificativa"><p className="whitespace-pre-wrap text-sm">{req.justification}</p></Section>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Quantidade" value={`${req.quantity} ${req.unit}`} />
            <Field label="Necessário em" value={format(new Date(req.needed_by), "dd/MM/yyyy")} />
            <Field label="Centro de custo" value={req.cost_centers ? `${req.cost_centers.code} — ${req.cost_centers.name}` : "—"} />
          </div>
          {req.decision_note && (
            <Section title="Nota da decisão"><p className="whitespace-pre-wrap text-sm">{req.decision_note}</p></Section>
          )}
        </Card>

        <Card className="p-6 space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Detalhes</h3>
          <Field label="Setor" value={req.sectors?.name ?? "—"} />
          <Field label="Solicitante" value={req.profiles?.full_name ?? req.profiles?.email ?? "—"} />
          <Field label="Criada em" value={format(new Date(req.created_at), "dd/MM/yyyy HH:mm")} />
          {req.decided_at && <Field label="Decidida em" value={format(new Date(req.decided_at), "dd/MM/yyyy HH:mm")} />}
          {req.finalized_at && <Field label="Finalizada em" value={format(new Date(req.finalized_at), "dd/MM/yyyy HH:mm")} />}
        </Card>
      </div>

      {(canDecide || canFinalize) && (
        <Card className="p-6 space-y-4 border-primary/30">
          <h3 className="text-sm font-semibold">Ações de aprovação</h3>
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
          {canFinalize && (
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
