import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ClassificationBadge } from "@/components/StatusBadge";
import { useAuth } from "@/lib/auth";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Download, CheckCircle2, XCircle, FileText, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { QUESTIONS, CLASS_CONSULTA, computeScore, type ScoreInputs } from "@/lib/evaluation";
import { generateEvaluationPdf, downloadBlob, evaluationFilename, type EvaluationPdfData } from "@/lib/evaluation-pdf";

export const Route = createFileRoute("/evaluations/$id")({
  component: () => <AppLayout><EvaluationDetail /></AppLayout>,
});

function fmtDate(d: string) {
  const [y, m, day] = String(d).split("-").map(Number);
  return format(new Date(y, m - 1, day), "dd/MM/yyyy");
}

function EvaluationDetail() {
  const { id } = Route.useParams();
  const { user, roles } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const { data: e } = useQuery({
    queryKey: ["evaluation", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("supplier_evaluations")
        .select("*, purchase_requests(id,number)")
        .eq("id", id).single();
      return data;
    },
  });

  if (!e) return <div className="text-muted-foreground">Carregando...</div>;

  const canDelete = e.evaluator_id === user?.id || roles.includes("admin");

  const remove = async () => {
    setBusy(true);
    if (e.pdf_path) {
      await supabase.storage.from("supplier-evaluations").remove([e.pdf_path]);
    }
    const { error } = await supabase.from("supplier_evaluations").delete().eq("id", id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Avaliação excluída");
    qc.invalidateQueries({ queryKey: ["evaluations"] });
    qc.invalidateQueries({ queryKey: ["deliveries-pending-eval"] });
    navigate({ to: "/evaluations" });
  };

  const inputs: ScoreInputs = {
    q1_conforme: e.q1_conforme, q2_prazo: e.q2_prazo, q3_quantidade: e.q3_quantidade, q4_conservacao: e.q4_conservacao,
  };
  const result = computeScore(inputs);
  const answers = [e.q1_conforme, e.q2_prazo, e.q3_quantidade, e.q4_conservacao];
  const points = [result.q1Points, result.q2Points, result.q3Points, result.q4Points];

  const download = async () => {
    setBusy(true);
    try {
      // 1) PDF arquivado (signed URL)
      if (e.pdf_path) {
        const { data, error } = await supabase.storage
          .from("supplier-evaluations")
          .createSignedUrl(e.pdf_path, 60, { download: evaluationFilename(e as any) });
        if (!error && data?.signedUrl) { window.open(data.signedUrl, "_blank"); return; }
      }
      // 2) fallback: regenera a partir dos dados
      const pdfData: EvaluationPdfData = {
        number: e.number, evaluation_date: e.evaluation_date, evaluator_name: e.evaluator_name,
        nf: e.nf, supplier: e.supplier,
        q1_conforme: e.q1_conforme, q2_prazo: e.q2_prazo, q3_quantidade: e.q3_quantidade, q4_conservacao: e.q4_conservacao,
        approved: e.approved, observation: e.observation, result,
      };
      const blob = await generateEvaluationPdf(pdfData);
      downloadBlob(blob, evaluationFilename(pdfData));
    } catch (err: any) {
      toast.error("Falha ao baixar o PDF: " + (err?.message ?? err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild><Link to="/evaluations"><ArrowLeft className="mr-2 h-4 w-4" />Voltar</Link></Button>
        <div className="flex gap-2">
          <Button onClick={download} disabled={busy}><Download className="mr-2 h-4 w-4" />{busy ? "Gerando..." : "Baixar PDF"}</Button>
          {canDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" disabled={busy}><Trash2 className="mr-2 h-4 w-4 text-destructive" />Excluir</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir avaliação?</AlertDialogTitle>
                  <AlertDialogDescription>
                    A avaliação {e.number} e o PDF arquivado serão removidos permanentemente. Use isto se foi preenchida errada.
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
          <div className="font-mono text-sm text-muted-foreground">{e.number}</div>
          <h1 className="mt-1 text-2xl font-bold">{e.supplier}</h1>
        </div>
        <div className="flex flex-col items-end gap-1">
          <ClassificationBadge classification={e.classification} />
          <span className="text-xs text-muted-foreground">{CLASS_CONSULTA[e.classification as keyof typeof CLASS_CONSULTA]}</span>
        </div>
      </div>

      <Card className="p-6 grid gap-4 md:grid-cols-2">
        <Field label="Data" value={fmtDate(e.evaluation_date)} />
        <Field label="Avaliador (Assinante)" value={e.evaluator_name} />
        <Field label="NF" value={e.nf || "—"} />
        <Field label="Fornecedor" value={e.supplier} />
        <div>
          <div className="text-xs text-muted-foreground">Entrega vinculada</div>
          {e.purchase_requests
            ? <Link to="/requests/$id" params={{ id: e.purchase_requests.id }} className="text-sm font-medium text-primary hover:underline">{e.purchase_requests.number}</Link>
            : <div className="text-sm font-medium">—</div>}
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Decisão</div>
          <div className="text-sm font-medium">
            {e.approved
              ? <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="h-4 w-4" />Aprovado</span>
              : <span className="inline-flex items-center gap-1 text-destructive"><XCircle className="h-4 w-4" />Não aprovado</span>}
            {e.returned && <span className="ml-2 text-xs text-destructive">(produto devolvido)</span>}
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-3">
        <h3 className="text-sm font-semibold">Questionário</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr className="border-b">
                <th className="py-2 text-left font-medium">Atendimento</th>
                <th className="py-2 text-center font-medium w-16">Resposta</th>
                <th className="py-2 text-right font-medium w-20">Pontos</th>
              </tr>
            </thead>
            <tbody>
              {QUESTIONS.map((q, idx) => (
                <tr key={q.key} className="border-b last:border-0">
                  <td className="py-2">{q.num} - {q.label}</td>
                  <td className="py-2 text-center">
                    {answers[idx]
                      ? <span className="text-success font-medium">Sim</span>
                      : <span className="text-destructive font-medium">Não</span>}
                  </td>
                  <td className="py-2 text-right font-medium">{points[idx]} <span className="text-xs text-muted-foreground">/ {q.weight}</span></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t">
                <td colSpan={2} className="py-2 text-right font-semibold">Total de pontos obtidos</td>
                <td className="py-2 text-right text-base font-bold">{e.total_points}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {e.observation && (
        <Card className="p-6 space-y-1">
          <h3 className="text-sm font-semibold">Observação</h3>
          <p className="whitespace-pre-wrap text-sm">{e.observation}</p>
        </Card>
      )}

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <FileText className="h-3.5 w-3.5" />
        {e.pdf_path ? "PDF arquivado no sistema." : "PDF não arquivado — será regerado a partir dos dados ao baixar."}
      </p>
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
