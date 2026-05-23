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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Paperclip, X, Plus, Check, ChevronsUpDown, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/requests/new")({
  component: () => <AppLayout><NewRequest /></AppLayout>,
});

type ItemRow = {
  uid: string;
  item_id: string;
  description: string;
  quantity: string;
  unit: string;
};

const newRow = (): ItemRow => ({
  uid: Math.random().toString(36).slice(2),
  item_id: "", description: "", quantity: "", unit: "",
});

function NewRequest() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [newItemBusy, setNewItemBusy] = useState(false);
  const [rows, setRows] = useState<ItemRow[]>([newRow()]);

  const { data: sectors } = useQuery({
    queryKey: ["sectors"],
    queryFn: async () => (await supabase.from("sectors").select("id,code,name").order("code")).data ?? [],
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
    queryFn: async () => {
      const all: any[] = [];
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from("items")
          .select("id,code,description,supplier,avg_price")
          .order("code")
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < pageSize) break;
      }
      return all;
    },
  });

  const updateRow = (uid: string, patch: Partial<ItemRow>) =>
    setRows((rs) => rs.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));
  const removeRow = (uid: string) => setRows((rs) => rs.length === 1 ? rs : rs.filter((r) => r.uid !== uid));
  const addRow = () => setRows((rs) => [...rs, newRow()]);

  const onPickItem = (uid: string, itemId: string) => {
    const it = items?.find((i: any) => i.id === itemId);
    updateRow(uid, {
      item_id: itemId,
      description: it?.description ?? "",
    });
  };

  const createItemInline = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const code = String(fd.get("code") ?? "").trim();
    const desc = String(fd.get("description") ?? "").trim();
    const supplier = String(fd.get("supplier") ?? "").trim();
    if (!code || !desc) { toast.error("Código e descrição são obrigatórios"); return; }
    setNewItemBusy(true);
    const { error } = await supabase.from("items").insert({ code, description: desc, supplier: supplier || null });
    setNewItemBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Item cadastrado");
    await qc.invalidateQueries({ queryKey: ["items"] });
    setItemDialogOpen(false);
  };


  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const fd = new FormData(e.currentTarget);
    const sector_id = String(fd.get("sector_id") ?? "");
    const cost_center_id = String(fd.get("cost_center_id") ?? "");
    const needed_by = String(fd.get("needed_by") ?? "");
    const justification = String(fd.get("justification") ?? "").trim();
    const priority = String(fd.get("priority") ?? "media") as "baixa" | "media" | "alta";

    if (!sector_id) return toast.error("Selecione o setor");
    if (!needed_by) return toast.error("Informe a data necessária");
    if (justification.length < 5) return toast.error("Justificativa muito curta");

    const validRows = rows.map((r) => ({
      ...r,
      quantity: parseFloat(r.quantity.replace(",", ".")),
      expected_price: r.expected_price ? parseFloat(r.expected_price.replace(",", ".")) : null,
    })).filter((r) => r.description.trim() && !isNaN(r.quantity) && r.quantity > 0 && r.unit.trim());

    if (validRows.length === 0) return toast.error("Adicione ao menos um item válido");

    setBusy(true);
    const first = validRows[0];
    const aggDescription = validRows.length === 1
      ? first.description
      : `${validRows.length} itens: ${validRows.map((r) => r.description).join("; ").slice(0, 1500)}`;

    const { data: inserted, error } = await supabase
      .from("purchase_requests")
      .insert({
        sector_id,
        requester_id: user.id,
        description: aggDescription,
        quantity: first.quantity,
        unit: first.unit,
        needed_by,
        justification,
        priority,
        cost_center_id: cost_center_id || null,
        item_id: first.item_id || null,
      })
      .select("id,number")
      .single();

    if (error || !inserted) { setBusy(false); toast.error(error?.message ?? "Erro"); return; }

    const itemsPayload = validRows.map((r, idx) => ({
      request_id: inserted.id,
      item_id: r.item_id || null,
      description: r.description.trim(),
      quantity: r.quantity,
      unit: r.unit.trim(),
      position: idx,
      expected_price: r.expected_price,
    }));
    const { error: riErr } = await supabase.from("request_items").insert(itemsPayload as any);
    if (riErr) { setBusy(false); toast.error(`Itens: ${riErr.message}`); return; }

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
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Nova solicitação</h1>
        <p className="text-sm text-muted-foreground">Preencha os campos para abrir uma solicitação de compra.</p>
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
                <SelectContent>{sectors?.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.code} — {s.name}</SelectItem>)}</SelectContent>
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

        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Itens</h3>
            <div className="flex gap-2">
              <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
                <DialogTrigger asChild>
                  <Button type="button" variant="ghost" size="sm">
                    <Plus className="mr-1 h-3.5 w-3.5" /> Cadastrar item
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Cadastrar novo item</DialogTitle></DialogHeader>
                  <form onSubmit={createItemInline} className="space-y-4">
                    <div className="space-y-2"><Label>Código *</Label><Input name="code" /></div>
                    <div className="space-y-2"><Label>Descrição *</Label><Input name="description" /></div>
                    <div className="space-y-2"><Label>Fornecedor</Label><Input name="supplier" /></div>
                    <DialogFooter><Button type="submit" disabled={newItemBusy}>{newItemBusy ? "Salvando..." : "Salvar"}</Button></DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
              <Button type="button" variant="outline" size="sm" onClick={addRow}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar item
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {rows.map((row, idx) => {
              const selected = items?.find((i: any) => i.id === row.item_id);
              return (
                <div key={row.uid} className="rounded-lg border bg-muted/20 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">Item {idx + 1}</span>
                    {rows.length > 1 && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeRow(row.uid)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Item do catálogo</Label>
                    <ItemPicker
                      items={items ?? []}
                      value={row.item_id}
                      selected={selected}
                      onPick={(id) => onPickItem(row.uid, id)}
                      onClear={() => updateRow(row.uid, { item_id: "" })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Descrição *</Label>
                    <Textarea
                      rows={2}
                      placeholder="Descreva o material ou serviço..."
                      value={row.description}
                      onChange={(e) => updateRow(row.uid, { description: e.target.value })}
                    />
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Quantidade *</Label>
                      <Input
                        type="number" step="0.01" min="0"
                        value={row.quantity}
                        onChange={(e) => updateRow(row.uid, { quantity: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Unidade *</Label>
                      <Input
                        placeholder="un, kg, h..."
                        value={row.unit}
                        onChange={(e) => updateRow(row.uid, { unit: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {totalExpected > 0 && (
            <div className="flex justify-end text-sm">
              <span className="text-muted-foreground mr-2">Total esperado:</span>
              <span className="font-semibold">R$ {totalExpected.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
            </div>
          )}
        </Card>

        <Card className="p-6 space-y-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Detalhes</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2"><Label>Data necessária *</Label><Input name="needed_by" type="date" /></div>
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

function ItemPicker({ items, value, selected, onPick, onClear }: {
  items: any[]; value: string; selected: any; onPick: (id: string) => void; onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" className="w-full justify-between font-normal">
          <span className="truncate">
            {selected ? `${selected.code} — ${selected.description}` : "Selecione um item (opcional)"}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command filter={(val, search) => val.toLowerCase().includes(search.toLowerCase()) ? 1 : 0}>
          <CommandInput placeholder="Pesquisar por código ou descrição..." />
          <CommandList className="max-h-72">
            <CommandEmpty>Nenhum item encontrado.</CommandEmpty>
            <CommandGroup>
              {value && (
                <CommandItem value="__clear__" onSelect={() => { onClear(); setOpen(false); }}>
                  <X className="mr-2 h-4 w-4" /> Limpar seleção
                </CommandItem>
              )}
              {items.map((i: any) => (
                <CommandItem
                  key={i.id}
                  value={`${i.code} ${i.description} ${i.supplier ?? ""}`}
                  onSelect={() => { onPick(i.id); setOpen(false); }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === i.id ? "opacity-100" : "opacity-0")} />
                  <span className="font-mono text-xs mr-2">{i.code}</span>
                  <span className="truncate">{i.description}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
