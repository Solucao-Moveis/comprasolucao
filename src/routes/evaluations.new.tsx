import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ClassificationBadge } from "@/components/StatusBadge";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown, X, ClipboardCheck, AlertTriangle } from "lucide-react";
import { QUESTIONS, CLASS_CONSULTA, computeScore, type ScoreInputs } from "@/lib/evaluation";
import { generateEvaluationPdf, downloadBlob, evaluationFilename, type EvaluationPdfData } from "@/lib/evaluation-pdf";

export const Route = createFileRoute("/evaluations/new")({
  validateSearch: (s: Record<string, unknown>): { request?: string } => ({
    request: typeof s.request === "string" ? s.request : undefined,
  }),
  component: () => <AppLayout><NewEvaluation /></AppLayout>,
});

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function NewEvaluation() {
  const { user, roles } = useAuth();
  const navigate = useNavigate();
  const { request: preRequest } = Route.useSearch();
  const canCreate = roles.includes("comprador") || roles.includes("admin");
  const [busy, setBusy] = useState(false);

  // cabeçalho
  const [requestId, setRequestId] = useState<string>("");
  const [supplier, setSupplier] = useState("");
  const [nf, setNf] = useState("");
  const [date, setDate] = useState(todayISO());
  const [assinante, setAssinante] = useState("");

  // questionário
  const [q1, setQ1] = useState<boolean | null>(null);
  const [q2, setQ2] = useState<boolean | null>(null);
  const [q3, setQ3] = useState<boolean | null>(null);
  const [q4, setQ4] = useState<boolean | null>(null);

  const [observation, setObservation] = useState("");
  const [approved, setApproved] = useState(true);
  const [approvedTouched, setApprovedTouched] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("profiles").select("full_name,email").eq("id", user!.id).single()).data,
  });
  useEffect(() => {
    if (!assinante && profile) setAssinante(profile.full_name ?? profile.email ?? "");
  }, [profile]); // eslint-disable-line react-hooks/exhaustive-deps

  // entregas (solicitações que chegaram) para vínculo opcional
  const { data: deliveries } = useQuery({
    queryKey: ["deliveries-for-eval"],
    queryFn: async () => {
      const { data } = await supabase
        .from("purchase_requests")
        .select("id,number,description,arrived_at,items(supplier)")
        .not("arrived_at", "is", null)
        .order("arrived_at", { ascending: false });
      return data ?? [];
    },
  });

  // pré-seleciona via ?request= e preenche fornecedor
  useEffect(() => {
    if (!deliveries) return;
    if (preRequest && !requestId) onPickRequest(preRequest);
  }, [deliveries, preRequest]); // eslint-disable-line react-hooks/exhaustive-deps

  const onPickRequest = (id: string) => {
    setRequestId(id);
    const r = (deliveries ?? []).find((x: any) => x.id === id);
    if (r?.items?.supplier && !supplier) setSupplier(r.items.supplier);
  };

  const inputs: ScoreInputs = {
    q1_conforme: !!q1,
    q2_prazo: !!q2,
    q3_quantidade: !!q3,
    q4_conservacao: !!q4,
  };
  const allAnswered = q1 !== null && q2 !== null && q3 !== null && q4 !== null;
  const result = useMemo(() => computeScore(inputs), [q1, q2, q3, q4]); // eslint-disable-line react-hooks/exhaustive-deps

  // sugestão de aprovação acompanha o cálculo até o usuário mexer manualmente
  useEffect(() => {
    if (!approvedTouched && allAnswered) setApproved(result.suggestedApproved);
  }, [result.suggestedApproved, approvedTouched, allAnswered]);

  const conclude = async () => {
    if (!user) return;
    if (!supplier.trim()) return toast.error("Informe o fornecedor");
    if (!assinante.trim()) return toast.error("Informe o nome do assinante");
    if (!date) return toast.error("Informe a data");
    if (!allAnswered) return toast.error("Responda as 4 perguntas (Sim/Não)");

    setBusy(true);
    const { data: inserted, error } = await supabase
      .from("supplier_evaluations")
      .insert({
        request_id: requestId || null,
        supplier: supplier.trim(),
        nf: nf.trim() || null,
        evaluation_date: date,
        evaluator_name: assinante.trim(),
        evaluator_id: user.id,
        q1_conforme: !!q1,
        q2_prazo: !!q2,
        q3_quantidade: !!q3,
        q4_conservacao: !!q4,
        total_points: result.total,
        classification: result.classification,
        returned: result.returned,
        approved,
        observation: observation.trim() || null,
      })
      .select("id,number")
      .single();

    if (error || !inserted) { setBusy(false); return toast.error(error?.message ?? "Erro ao salvar"); }

    // PDF: réplica fiel do P-04, preenchida
    const pdfData: EvaluationPdfData = {
      number: inserted.number,
      evaluation_date: date,
      evaluator_name: assinante.trim(),
      nf: nf.trim() || null,
      supplier: supplier.trim(),
      q1_conforme: !!q1,
      q2_prazo: !!q2,
      q3_quantidade: !!q3,
      q4_conservacao: !!q4,
      approved,
      observation: observation.trim() || null,
      result,
    };
    try {
      const blob = await generateEvaluationPdf(pdfData);
      // 1) download automático no PC do avaliador
      downloadBlob(blob, evaluationFilename(pdfData));
      // 2) arquiva no sistema (storage) + registra o caminho
      const path = `${user.id}/${inserted.id}/${evaluationFilename(pdfData)}`;
      const { error: upErr } = await supabase.storage
        .from("supplier-evaluations")
        .upload(path, blob, { contentType: "application/pdf", upsert: true });
      if (!upErr) {
        await supabase.from("supplier_evaluations").update({ pdf_path: path }).eq("id", inserted.id);
      } else {
        toast.warning("Avaliação salva, mas o arquivo não foi arquivado: " + upErr.message);
      }
    } catch (e: any) {
      toast.warning("Avaliação salva, mas houve falha ao gerar o PDF: " + (e?.message ?? e));
    }

    setBusy(false);
    toast.success(`Avaliação ${inserted.number ?? ""} concluída`);
    navigate({ to: "/evaluations/$id", params: { id: inserted.id } });
  };

  if (!canCreate) {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        Apenas comprador ou administrador podem registrar avaliações de fornecedor.
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ClipboardCheck className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Nova avaliação de fornecedor</h1>
          <p className="text-sm text-muted-foreground">Avaliação no ato da entrega — Procedimento P-04 (ISO 9001:2015).</p>
        </div>
      </div>

      {/* Cabeçalho */}
      <Card className="p-6 space-y-5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Identificação</h3>
        <div className="space-y-2">
          <Label>Entrega vinculada (opcional)</Label>
          <RequestPicker
            deliveries={deliveries ?? []}
            value={requestId}
            onPick={onPickRequest}
            onClear={() => setRequestId("")}
          />
          <p className="text-xs text-muted-foreground">Vincule à solicitação que chegou para puxar o fornecedor e rastrear quem avaliou a entrega.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2"><Label>Data *</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="space-y-2"><Label>Nome do avaliador (Assinante) *</Label><Input value={assinante} onChange={(e) => setAssinante(e.target.value)} placeholder="Quem está avaliando" /></div>
          <div className="space-y-2"><Label>NF</Label><Input value={nf} onChange={(e) => setNf(e.target.value)} placeholder="Nota fiscal" /></div>
          <div className="space-y-2"><Label>Fornecedor *</Label><Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Nome do fornecedor" /></div>
        </div>
      </Card>

      {/* Questionário */}
      <Card className="p-6 space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Questionário</h3>
        <div className="space-y-3">
          <QuestionRow num="01" label={QUESTIONS[0].label} weight={40} value={q1} onChange={setQ1} />
          <QuestionRow num="02" label={QUESTIONS[1].label} weight={30} value={q2} onChange={setQ2} />
          <QuestionRow num="03" label={QUESTIONS[2].label} weight={10} value={q3} onChange={setQ3} />
          <QuestionRow num="04" label={QUESTIONS[3].label} weight={20} value={q4} onChange={setQ4} />
        </div>
      </Card>

      {/* Resultado ao vivo */}
      <Card className="p-6 space-y-4 border-primary/30">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Total de pontos</div>
            <div className="text-3xl font-bold">{allAnswered ? result.total : "—"}<span className="text-base font-normal text-muted-foreground"> / 100</span></div>
          </div>
          {allAnswered && (
            <div className="flex flex-col items-end gap-1">
              <ClassificationBadge classification={result.classification} />
              <span className="text-xs text-muted-foreground">{CLASS_CONSULTA[result.classification]}</span>
            </div>
          )}
        </div>
        {result.returned && allAnswered && (
          <Hint danger icon>Produto será <b>devolvido</b> (requisitos técnicos não conformes).</Hint>
        )}
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <div className="text-sm font-medium">{approved ? "Aprovado" : "Não aprovado"}</div>
            <div className="text-xs text-muted-foreground">Sugestão automática — ajuste se necessário.</div>
          </div>
          <Switch checked={approved} onCheckedChange={(v) => { setApproved(v); setApprovedTouched(true); }} />
        </div>
        <div className="space-y-2">
          <Label>Observação</Label>
          <Textarea rows={3} value={observation} onChange={(e) => setObservation(e.target.value)} placeholder="Observações da avaliação (opcional)" />
        </div>
      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => navigate({ to: "/evaluations" })}>Cancelar</Button>
        <Button onClick={conclude} disabled={busy || !allAnswered}>
          {busy ? "Concluindo..." : "Concluir avaliação"}
        </Button>
      </div>
    </div>
  );
}

function QuestionRow({ num, label, weight, value, onChange }: {
  num: string; label: string; weight: number; value: boolean | null; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3">
      <div className="min-w-0 flex-1">
        <span className="font-mono text-xs text-muted-foreground mr-2">{num}</span>
        <span className="text-sm">{label}</span>
        <span className="ml-2 text-xs text-muted-foreground">({weight} pts)</span>
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant={value === true ? "default" : "outline"}
          className={cn(value === true && "bg-success text-success-foreground hover:bg-success/90")}
          onClick={() => onChange(true)}>Sim</Button>
        <Button type="button" size="sm" variant={value === false ? "default" : "outline"}
          className={cn(value === false && "bg-destructive text-destructive-foreground hover:bg-destructive/90")}
          onClick={() => onChange(false)}>Não</Button>
      </div>
    </div>
  );
}

function Hint({ children, danger, icon }: { children: React.ReactNode; danger?: boolean; icon?: boolean }) {
  return (
    <div className={cn("flex items-start gap-2 rounded-lg border p-3 text-sm",
      danger ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-border bg-muted/30")}>
      {icon && <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
      <div>{children}</div>
    </div>
  );
}

function RequestPicker({ deliveries, value, onPick, onClear }: {
  deliveries: any[]; value: string; onPick: (id: string) => void; onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = deliveries.find((d) => d.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" className="w-full justify-between font-normal">
          <span className="truncate">
            {selected ? `${selected.number} — ${selected.description}` : "Selecione a entrega (opcional)"}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[520px] max-w-[92vw] p-0" align="start" sideOffset={4}>
        <Command filter={(val, search) => (val.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}>
          <CommandInput placeholder="Buscar por número ou descrição..." />
          <CommandList className="max-h-56">
            <CommandEmpty>Nenhuma entrega encontrada.</CommandEmpty>
            <CommandGroup>
              {value && (
                <CommandItem value="__clear__" onSelect={() => { onClear(); setOpen(false); }}>
                  <X className="mr-2 h-4 w-4" /> Limpar seleção
                </CommandItem>
              )}
              {deliveries.map((d) => (
                <CommandItem key={d.id} value={`${d.number} ${d.description} ${d.items?.supplier ?? ""}`}
                  onSelect={() => { onPick(d.id); setOpen(false); }}>
                  <Check className={cn("mr-2 h-4 w-4", value === d.id ? "opacity-100" : "opacity-0")} />
                  <span className="font-mono text-xs mr-2">{d.number}</span>
                  <span className="truncate">{d.description}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
