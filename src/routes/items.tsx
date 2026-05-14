import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, AlertTriangle } from "lucide-react";
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

function ItemsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
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
    const { error } = await supabase.from("items").insert({
      code: parsed.data.code, description: parsed.data.description, supplier: parsed.data.supplier || null,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Item cadastrado");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["items"] });
  };

  const now = Date.now();
  const dueItems = (items ?? []).filter((i: any) => i.last_purchased_at && i.avg_interval_days &&
    (now - new Date(i.last_purchased_at).getTime()) / 86400000 >= Number(i.avg_interval_days));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Catálogo de itens</h1>
          <p className="text-sm text-muted-foreground">Cadastro de itens, preço médio e periodicidade de compra</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Novo item</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Cadastrar item</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2"><Label>Código *</Label><Input name="code" /></div>
              <div className="space-y-2"><Label>Descrição *</Label><Input name="description" /></div>
              <div className="space-y-2"><Label>Fornecedor</Label><Input name="supplier" /></div>
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

      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead><TableHead>Descrição</TableHead><TableHead>Fornecedor</TableHead>
              <TableHead className="text-right">Preço médio</TableHead>
              <TableHead className="text-right">Compras</TableHead>
              <TableHead className="text-right">Periodicidade</TableHead>
              <TableHead>Última compra</TableHead>
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
              </TableRow>
            ))}
            {(items ?? []).length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-sm">Nenhum item cadastrado</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
