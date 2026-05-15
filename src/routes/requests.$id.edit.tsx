import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { z } from "zod";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/requests/$id/edit")({
  component: EditRequest,
});

const schema = z.object({
  sector_id: z.string().uuid(),
  description: z.string().trim().min(5).max(2000),
  quantity: z.coerce.number().positive(),
  unit: z.string().trim().min(1).max(20),
  needed_by: z.string().min(1),
  justification: z.string().trim().min(5).max(2000),
  priority: z.enum(["baixa", "media", "alta"]),
  cost_center_id: z.string().uuid().optional().or(z.literal("")),
});

const selectClassName = "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

function EditRequest() {
  const { id } = Route.useParams();
  const { user, roles } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<any>(null);

  const { data: req } = useQuery({
    queryKey: ["request", id],
    queryFn: async () => (await supabase.from("purchase_requests").select("*").eq("id", id).single()).data,
  });
  const { data: sectors } = useQuery({
    queryKey: ["sectors"],
    queryFn: async () => (await supabase.from("sectors").select("id,code,name").order("code")).data ?? [],
  });
  const { data: ccs } = useQuery({
    queryKey: ["cost_centers"],
    queryFn: async () => (await supabase.from("cost_centers").select("id,code,name").order("code")).data ?? [],
  });

  useEffect(() => {
    if (req && !form) setForm({
      sector_id: req.sector_id, description: req.description, quantity: req.quantity,
      unit: req.unit, needed_by: req.needed_by, justification: req.justification,
      priority: req.priority, cost_center_id: req.cost_center_id ?? "",
    });
  }, [req, form]);

  if (!req || !form) return <div className="text-muted-foreground">Carregando...</div>;

  const canEdit = roles.includes("admin") || (req.requester_id === user?.id && req.status === "pendente");
  if (!canEdit) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">Você não tem permissão para editar esta solicitação.</p>
        <Button asChild variant="outline" className="mt-4"><Link to="/requests/$id" params={{ id }}>Voltar</Link></Button>
      </Card>
    );
  }

  const set = (k: string, v: any) => setForm({ ...form, [k]: v });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setBusy(true);
    const { error } = await supabase.from("purchase_requests").update({
      ...parsed.data,
      cost_center_id: parsed.data.cost_center_id || null,
    }).eq("id", id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Solicitação atualizada");
    qc.invalidateQueries({ queryKey: ["request", id] });
    qc.invalidateQueries({ queryKey: ["requests"] });
    navigate({ to: "/requests/$id", params: { id } });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Button variant="ghost" size="sm" asChild><Link to="/requests/$id" params={{ id }}><ArrowLeft className="mr-2 h-4 w-4" />Voltar</Link></Button>
      <h1 className="text-2xl font-bold">Editar solicitação {req.number}</h1>
      <form onSubmit={submit} className="space-y-5">
        <Card className="p-6 space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Setor *</Label>
              <select className={selectClassName} value={form.sector_id} onChange={(e) => set("sector_id", e.target.value)}>
                <option value="" disabled>Selecione</option>
                {sectors?.map((s: any) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Centro de custo</Label>
              <select className={selectClassName} value={form.cost_center_id || ""} onChange={(e) => set("cost_center_id", e.target.value)}>
                <option value="">—</option>
                {ccs?.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Descrição *</Label>
            <Textarea rows={4} value={form.description} onChange={(e) => set("description", e.target.value)} />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2"><Label>Quantidade *</Label><Input type="number" step="0.01" value={form.quantity} onChange={(e) => set("quantity", e.target.value)} /></div>
            <div className="space-y-2"><Label>Unidade *</Label><Input value={form.unit} onChange={(e) => set("unit", e.target.value)} /></div>
            <div className="space-y-2">
              <Label>Prioridade *</Label>
              <select className={selectClassName} value={form.priority} onChange={(e) => set("priority", e.target.value)}>
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
              </select>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2"><Label>Data necessária *</Label><Input type="date" value={form.needed_by} onChange={(e) => set("needed_by", e.target.value)} /></div>
          </div>
          <div className="space-y-2">
            <Label>Justificativa *</Label>
            <Textarea rows={3} value={form.justification} onChange={(e) => set("justification", e.target.value)} />
          </div>
        </Card>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate({ to: "/requests/$id", params: { id } })}>Cancelar</Button>
          <Button type="submit" disabled={busy}>{busy ? "Salvando..." : "Salvar alterações"}</Button>
        </div>
      </form>
    </div>
  );
}
