import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, X, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/requests/$id/edit")({
  component: EditRequest,
});

const selectClassName = "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

type ItemRow = {
  uid: string;
  id?: string; // existing request_items.id
  item_id: string;
  description: string;
  quantity: string;
  unit: string;
};

const newRow = (): ItemRow => ({
  uid: Math.random().toString(36).slice(2),
  item_id: "", description: "", quantity: "", unit: "",
});

function EditRequest() {
  const { id } = Route.useParams();
  const { user, roles } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<any>(null);
  const [rows, setRows] = useState<ItemRow[]>([]);
  const [initialized, setInitialized] = useState(false);

  const { data: req } = useQuery({
    queryKey: ["request", id],
    queryFn: async () => (await supabase.from("purchase_requests").select("*").eq("id", id).single()).data,
  });
  const { data: existingItems } = useQuery({
    queryKey: ["request_items", id],
    queryFn: async () => (await supabase.from("request_items").select("*").eq("request_id", id).order("position")).data ?? [],
  });
  const { data: sectors } = useQuery({
    queryKey: ["sectors"],
    queryFn: async () => (await supabase.from("sectors").select("id,code,name").order("code")).data ?? [],
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
          .from("items").select("id,code,description,supplier")
          .order("code").range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < pageSize) break;
      }
      return all;
    },
  });

  useEffect(() => {
    if (req && !form) setForm({
      sector_id: req.sector_id,
      needed_by: req.needed_by,
      justification: req.justification,
      priority: req.priority,
      cost_center_id: req.cost_center_id ?? "",
    });
  }, [req, form]);

  useEffect(() => {
    if (initialized || !req || !existingItems) return;
    if (existingItems.length > 0) {
      setRows(existingItems.map((it: any) => ({
        uid: Math.random().toString(36).slice(2),
        id: it.id,
        item_id: it.item_id ?? "",
        description: it.description ?? "",
        quantity: String(it.quantity ?? ""),
        unit: it.unit ?? "",
      })));
    } else {
      // legacy request without request_items rows: seed from purchase_request fields
      setRows([{
        uid: Math.random().toString(36).slice(2),
        item_id: req.item_id ?? "",
        description: req.description ?? "",
        quantity: String(req.quantity ?? ""),
        unit: req.unit ?? "",
      }]);
    }
    setInitialized(true);
  }, [existingItems, req, initialized]);

  if (!req || !form || !initialized) return <div className="text-muted-foreground">Carregando...</div>;

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
  const updateRow = (uid: string, patch: Partial<ItemRow>) =>
    setRows((rs) => rs.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));
  const removeRow = (uid: string) => setRows((rs) => rs.length === 1 ? rs : rs.filter((r) => r.uid !== uid));
  const addRow = () => setRows((rs) => [...rs, newRow()]);
  const onPickItem = (uid: string, itemId: string) => {
    const it = items?.find((i: any) => i.id === itemId);
    updateRow(uid, { item_id: itemId, description: it?.description ?? "" });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.sector_id) return toast.error("Selecione o setor");
    if (!form.needed_by) return toast.error("Informe a data necessária");
    if ((form.justification ?? "").trim().length < 5) return toast.error("Justificativa muito curta");

    const validRows = rows.map((r) => ({
      ...r,
      qtyNum: parseFloat(String(r.quantity).replace(",", ".")),
    })).filter((r) => r.description.trim() && !isNaN(r.qtyNum) && r.qtyNum > 0 && r.unit.trim());
    if (validRows.length === 0) return toast.error("Adicione ao menos um item válido");

    setBusy(true);
    const first = validRows[0];
    const aggDescription = validRows.length === 1
      ? first.description
      : `${validRows.length} itens: ${validRows.map((r) => r.description).join("; ").slice(0, 1500)}`;

    const { error } = await supabase.from("purchase_requests").update({
      sector_id: form.sector_id,
      needed_by: form.needed_by,
      justification: form.justification,
      priority: form.priority,
      cost_center_id: form.cost_center_id || null,
      description: aggDescription,
      quantity: first.qtyNum,
      unit: first.unit,
      item_id: first.item_id || null,
    }).eq("id", id);
    if (error) { setBusy(false); return toast.error(error.message); }

    // Sync request_items: delete removed, update existing, insert new
    const keptIds = validRows.filter((r) => r.id).map((r) => r.id!);
    const toDelete = (existingItems ?? []).filter((it: any) => !keptIds.includes(it.id)).map((it: any) => it.id);
    if (toDelete.length > 0) {
      const { error: delErr } = await supabase.from("request_items").delete().in("id", toDelete);
      if (delErr) { setBusy(false); return toast.error(`Itens: ${delErr.message}`); }
    }
    for (let idx = 0; idx < validRows.length; idx++) {
      const r = validRows[idx];
      const payload = {
        request_id: id,
        item_id: r.item_id || null,
        description: r.description.trim(),
        quantity: r.qtyNum,
        unit: r.unit.trim(),
        position: idx,
      };
      if (r.id) {
        const { error: upErr } = await supabase.from("request_items").update(payload).eq("id", r.id);
        if (upErr) { setBusy(false); return toast.error(`Itens: ${upErr.message}`); }
      } else {
        const { error: insErr } = await supabase.from("request_items").insert(payload as any);
        if (insErr) { setBusy(false); return toast.error(`Itens: ${insErr.message}`); }
      }
    }

    setBusy(false);
    toast.success("Solicitação atualizada");
    qc.invalidateQueries({ queryKey: ["request", id] });
    qc.invalidateQueries({ queryKey: ["request_items", id] });
    qc.invalidateQueries({ queryKey: ["requests"] });
    navigate({ to: "/requests/$id", params: { id } });
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
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
        </Card>

        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Itens</h3>
            <Button type="button" variant="outline" size="sm" onClick={addRow}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar item
            </Button>
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
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Código *</Label>
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
                      <Input value={row.description} onChange={(e) => updateRow(row.uid, { description: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Quantidade *</Label>
                      <Input type="number" step="0.01" min="0" value={row.quantity} onChange={(e) => updateRow(row.uid, { quantity: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Unidade *</Label>
                      <Input placeholder="un, kg, h..." value={row.unit} onChange={(e) => updateRow(row.uid, { unit: e.target.value })} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-6 space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Prioridade *</Label>
              <select className={selectClassName} value={form.priority} onChange={(e) => set("priority", e.target.value)}>
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
              </select>
            </div>
            <div className="space-y-2 md:col-span-2"><Label>Data necessária *</Label><Input type="date" value={form.needed_by} onChange={(e) => set("needed_by", e.target.value)} /></div>
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

function ItemPicker({ items, value, selected, onPick, onClear }: {
  items: any[]; value: string; selected: any; onPick: (id: string) => void; onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" className="w-full justify-between font-normal">
          <span className="truncate">
            {selected ? `${selected.code} — ${selected.description}` : "Selecione um item"}
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
                <CommandItem key={i.id} value={`${i.code} ${i.description} ${i.supplier ?? ""}`} onSelect={() => { onPick(i.id); setOpen(false); }}>
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
