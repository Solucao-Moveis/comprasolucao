import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, AlertTriangle, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

export const Route = createFileRoute("/items")({
  component: () => <AppLayout><ItemsPage /></AppLayout>,
});

const schema = z.object({
  code: z.string().trim().min(1).max(50),
  description: z.string().trim().min(2).max(200),
  supplier: z.string().trim().max(120).optional().or(z.literal("")),
});

const fmtBRL = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type ItemRow = {
  id: string;
  code: string;
  description: string;
  supplier: string | null;
  avg_price: number | null;
  purchase_count: number;
  avg_interval_days: number | null;
  last_purchased_at: string | null;
};

function ItemsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<ItemRow | null>(null);
  const [search, setSearch] = useState("");
  const { data: items } = useQuery({
    queryKey: ["items"],
    queryFn: async () => (await supabase.from("items").select("*").order("code")).data ?? [],
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = schema.safeParse(Object.fromEntries(fd.entries()));
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    setBusy(true);
    const payload = {
      code: parsed.data.code,
      description: parsed.data.description,
      supplier: parsed.data.supplier || null,
    };
    const { error } = editing
      ? await supabase.from("items").update(payload).eq("id", editing.id)
      : await supabase.from("items").insert(payload);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Item atualizado" : "Item cadastrado");
    setOpen(false);
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["items"] });
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("items").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Item excluído");
    qc.invalidateQueries({ queryKey: ["items"] });
  };

  const openNew = () => { setEditing(null); setOpen(true); };
  const openEdit = (item: ItemRow) => { setEditing(item); setOpen(true); };

  const now = Date.now();
  const q = search.trim().toLowerCase();
  const filteredItems = (items ?? []).filter((i: any) => {
    if (!q) return true;
    return (
      (i.code ?? "").toLowerCase().includes(q) ||
      (i.description ?? "").toLowerCase().includes(q) ||
      (i.supplier ?? "").toLowerCase().includes(q)
    );
  });
  const dueItems = (items ?? []).filter((i: any) => i.last_purchased_at && i.avg_interval_days &&
    (now - new Date(i.last_purchased_at).getTime()) / 86400000 >= Number(i.avg_interval_days));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Catálogo de itens</h1>
          <p className="text-sm text-muted-foreground">Cadastro de itens, preço médio e periodicidade de compra</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild><Button onClick={openNew}><Plus className="mr-2 h-4 w-4" /> Novo item</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Editar item" : "Cadastrar item"}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4" key={editing?.id ?? "new"}>
              <div className="space-y-2"><Label>Código *</Label><Input name="code" defaultValue={editing?.code ?? ""} /></div>
              <div className="space-y-2"><Label>Descrição *</Label><Input name="description" defaultValue={editing?.description ?? ""} /></div>
              <div className="space-y-2"><Label>Fornecedor</Label><Input name="supplier" defaultValue={editing?.supplier ?? ""} /></div>
              <DialogFooter><Button type="submit" disabled={busy}>{busy ? "Salvando..." : "Salvar"}</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {dueItems.length > 0 && (
        <Card className="p-5 border-warning/40 bg-warning/5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <h3 className="text-sm font-semibold">Sugestão de compra ({dueItems.length})</h3>
          </div>
          <ul className="space-y-1 text-sm">
            {dueItems.map((i: any) => (
              <li key={i.id} className="flex justify-between">
                <span><span className="font-medium">{i.code}</span> — {i.description}</span>
                <span className="text-muted-foreground">a cada {Number(i.avg_interval_days).toFixed(0)} dias</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="flex items-center gap-2">
        <Input
          placeholder="Pesquisar por código, descrição ou fornecedor..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-md"
        />
        <span className="text-xs text-muted-foreground">{filteredItems.length} de {(items ?? []).length}</span>
      </div>

      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead><TableHead>Descrição</TableHead><TableHead>Fornecedor</TableHead>
              <TableHead className="text-right">Preço médio</TableHead>
              <TableHead className="text-right">Compras</TableHead>
              <TableHead className="text-right">Periodicidade</TableHead>
              <TableHead>Última compra</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(items ?? []).map((i: any) => (
              <TableRow key={i.id}>
                <TableCell className="font-mono text-xs">{i.code}</TableCell>
                <TableCell>{i.description}</TableCell>
                <TableCell className="text-muted-foreground">{i.supplier ?? "—"}</TableCell>
                <TableCell className="text-right">{Number(i.avg_price) > 0 ? fmtBRL(Number(i.avg_price)) : "—"}</TableCell>
                <TableCell className="text-right">{i.purchase_count}</TableCell>
                <TableCell className="text-right">{i.avg_interval_days ? `${Number(i.avg_interval_days).toFixed(0)} d` : "—"}</TableCell>
                <TableCell className="text-muted-foreground text-xs">{i.last_purchased_at ? new Date(i.last_purchased_at).toLocaleDateString("pt-BR") : "—"}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(i)} aria-label="Editar"><Pencil className="h-4 w-4" /></Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Excluir"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir item?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta ação não pode ser desfeita. O item "{i.code} — {i.description}" será removido do catálogo.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(i.id)}>Excluir</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {(items ?? []).length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground text-sm">Nenhum item cadastrado</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
