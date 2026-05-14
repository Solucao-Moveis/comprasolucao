import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { z } from "zod";
import { Paperclip, X, Plus } from "lucide-react";

export const Route = createFileRoute("/requests/new")({
  component: () => <AppLayout><NewRequest /></AppLayout>,
});

const schema = z.object({
  sector_id: z.string().uuid("Selecione o setor"),
  description: z.string().trim().min(5, "Descrição muito curta").max(2000),
  quantity: z.coerce.number().positive("Quantidade deve ser positiva"),
  unit: z.string().trim().min(1).max(20),
  needed_by: z.string().min(1, "Informe a data necessária"),
  justification: z.string().trim().min(5, "Justificativa muito curta").max(2000),
  priority: z.enum(["baixa", "media", "alta"]),
  cost_center_id: z.string().uuid().optional().or(z.literal("")),
  item_id: z.string().uuid().optional().or(z.literal("")),
});

function NewRequest() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [selectedItem, setSelectedItem] = useState<string>("");
  const [itemDialog, setItemDialog] = useState(false);
  const [newItemBusy, setNewItemBusy] = useState(false);

  const { data: sectors } = useQuery({
    queryKey: ["sectors"],
    queryFn: async () => (await supabase.from("sectors").select("id,name").order("name")).data ?? [],
  });
  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("profiles").select("full_name,email").eq("id", user!.id).single()).data,
  });
  const { data: ccs } = useQuery({
    queryKey: ["cost_centers"],
    queryFn: async () => (await supabase.from("cost_centers").select("id,code,name").order("code")).data ?? [],
  });
  const { data: items } = useQuery({
    queryKey: ["items"],
    queryFn: async () => (await supabase.from("items").select("id,code,description,supplier,avg_price").order("code")).data ?? [],
  });
  const itemSelected = items?.find((i: any) => i.id === selectedItem);

  const createItemInline = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const code = String(fd.get("code") ?? "").trim();
    const description = String(fd.get("description") ?? "").trim();
    const supplier = String(fd.get("supplier") ?? "").trim();
    if (!code || !description) { toast.error("Código e descrição são obrigatórios"); return; }
    setNewItemBusy(true);
    const { data, error } = await supabase.from("items").insert({ code, description, supplier: supplier || null }).select("id").single();
    setNewItemBusy(false);
    if (error || !data) { toast.error(error?.message ?? "Erro"); return; }
    toast.success("Item cadastrado");
    setItemDialog(false);
    await qc.invalidateQueries({ queryKey: ["items"] });
    setSelectedItem(data.id);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const fd = new FormData(e.currentTarget);
    const obj = Object.fromEntries(fd.entries());
    const parsed = schema.safeParse(obj);
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }

    setBusy(true);
    const { data: inserted, error } = await supabase
      .from("purchase_requests")
      .insert({
        sector_id: parsed.data.sector_id,
        requester_id: user.id,
        description: parsed.data.description,
        quantity: parsed.data.quantity,
        unit: parsed.data.unit,
        needed_by: parsed.data.needed_by,
        justification: parsed.data.justification,
        priority: parsed.data.priority,
        cost_center_id: parsed.data.cost_center_id || null,
        item_id: parsed.data.item_id || null,
      })
      .select("id,number")
      .single();

    if (error || !inserted) { setBusy(false); toast.error(error?.message ?? "Erro"); return; }

    for (const f of files) {
      const path = `${user.id}/${inserted.id}/${Date.now()}-${f.name}`;
      const { error: upErr } = await supabase.storage.from("request-attachments").upload(path, f);
      if (upErr) { toast.error(`Falha em ${f.name}: ${upErr.message}`); continue; }
      await supabase.from("request_attachments").insert({
        request_id: inserted.id, path, filename: f.name, size: f.size, uploaded_by: user.id,
      });
    }

    setBusy(false);
    toast.success(`Solicitação ${inserted.number} criada!`);
    navigate({ to: "/requests/$id", params: { id: inserted.id } });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Nova solicitação</h1>
        <p className="text-sm text-muted-foreground">Preencha os campos para abrir uma solicitação de compra</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Card className="p-6 space-y-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Identificação</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Nome do solicitante</Label>
              <Input value={profile?.full_name ?? profile?.email ?? user?.email ?? ""} disabled />
            </div>
            <div className="space-y-2">
              <Label>Setor solicitante *</Label>
              <Select name="sector_id"><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{sectors?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Centro de custo</Label>
              <Select name="cost_center_id"><SelectTrigger><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger>
                <SelectContent>{ccs?.map((c) => <SelectItem key={c.id} value={c.id}>{c.code} — {c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        <Card className="p-6 space-y-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Material / Serviço</h3>
          <div className="space-y-2">
            <Label>Descrição detalhada *</Label>
            <Textarea name="description" rows={4} placeholder="Descreva o material ou serviço..." />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2"><Label>Quantidade *</Label><Input name="quantity" type="number" step="0.01" min="0" /></div>
            <div className="space-y-2"><Label>Unidade *</Label><Input name="unit" placeholder="un, kg, h..." /></div>
            <div className="space-y-2"><Label>Prioridade *</Label>
              <Select name="priority" defaultValue="media"><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="baixa">Baixa</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2"><Label>Data necessária *</Label><Input name="needed_by" type="date" /></div>
          </div>
          <div className="space-y-2">
            <Label>Justificativa *</Label>
            <Textarea name="justification" rows={3} />
          </div>
        </Card>

        <Card className="p-6 space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Anexos (opcional)</h3>
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground hover:bg-accent/40">
            <Paperclip className="h-4 w-4" />
            Adicionar arquivos
            <input type="file" multiple className="hidden" onChange={(e) => setFiles([...files, ...Array.from(e.target.files ?? [])])} />
          </label>
          {files.length > 0 && (
            <ul className="space-y-1">
              {files.map((f, i) => (
                <li key={i} className="flex items-center justify-between rounded bg-muted/50 px-3 py-1.5 text-sm">
                  <span className="truncate">{f.name} <span className="text-xs text-muted-foreground">({(f.size / 1024).toFixed(0)} KB)</span></span>
                  <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))}><X className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate({ to: "/requests" })}>Cancelar</Button>
          <Button type="submit" disabled={busy}>{busy ? "Enviando..." : "Criar solicitação"}</Button>
        </div>
      </form>
    </div>
  );
}
