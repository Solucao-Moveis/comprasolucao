import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import { SituacaoCadastralBadge, RegimeFiscalBadge } from "@/components/StatusBadge";
import { formatCnpj } from "@/lib/cnpj";
import { ArrowLeft, TrendingUp, TrendingDown } from "lucide-react";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/fornecedores/$id")({
  component: () => <AppLayout><FornecedorDetalhe /></AppLayout>,
});

const fmtDate = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("pt-BR") : "—");
const fmtBRL = (v: number | null) => (v != null ? `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—");

function FornecedorDetalhe() {
  const { id } = Route.useParams();

  const { data: f } = useQuery({
    queryKey: ["fornecedor", id],
    queryFn: async () => {
      const { data } = await supabase.from("fornecedores").select("*" as any).eq("id", id).single();
      return data as any;
    },
  });

  // Produtos vinculados a este fornecedor — o vínculo ainda não tem UI manual
  // (vem de uma importação por planilha CNPJ+nome numa etapa futura), então
  // essa lista fica vazia até lá.
  const { data: linkedItemsData } = useQuery({
    queryKey: ["fornecedor-items", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("items")
        .select("id,code,description,avg_price,last_purchased_at,purchase_count" as any)
        .eq("fornecedor_id", id);
      return data ?? [];
    },
  });
  const linkedItems = (linkedItemsData ?? []) as any[];

  // Mesmo padrão do card SAVE em indicadores.tsx: busca todo o histórico de
  // purchase_entries e agrupa em memória (dataset pequeno hoje).
  const { data: purchaseEntriesData } = useQuery({
    queryKey: ["fornecedor-purchase-entries"],
    queryFn: async () => {
      const { data } = await supabase
        .from("purchase_entries")
        .select("id,quantity,unit_price,created_at,request_items(item_id)" as any);
      return data ?? [];
    },
  });

  const priceHistoryByItem = useMemo(() => {
    const map = new Map<string, { date: string; unit_price: number }[]>();
    for (const e of (purchaseEntriesData ?? []) as any[]) {
      const itemId = e.request_items?.item_id;
      if (!itemId) continue;
      if (!map.has(itemId)) map.set(itemId, []);
      map.get(itemId)!.push({ date: e.created_at, unit_price: Number(e.unit_price) });
    }
    map.forEach((arr) => arr.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
    return map;
  }, [purchaseEntriesData]);

  const trendFor = (itemId: string): "up" | "down" | null => {
    const hist = priceHistoryByItem.get(itemId);
    if (!hist || hist.length < 2) return null;
    const last = hist[hist.length - 1].unit_price;
    const prev = hist[hist.length - 2].unit_price;
    if (last > prev) return "up";
    if (last < prev) return "down";
    return null;
  };

  const [selectedItem, setSelectedItem] = useState<any>(null);
  const chartData = selectedItem
    ? (priceHistoryByItem.get(selectedItem.id) ?? []).map((p) => ({
        date: new Date(p.date).toLocaleDateString("pt-BR"),
        preco: p.unit_price,
      }))
    : [];

  if (!f) return <div className="text-muted-foreground">Carregando...</div>;

  const endereco = [f.logradouro, f.numero, f.complemento, f.bairro].filter(Boolean).join(", ");

  return (
    <div className="max-w-3xl space-y-6">
      <Link to="/fornecedores" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">{f.razao_social}</h1>
          <SituacaoCadastralBadge descricao={f.descricao_situacao_cadastral} />
          <RegimeFiscalBadge optante={f.opcao_pelo_simples} mei={f.opcao_pelo_mei} regimeTributario={f.regime_tributario} />
        </div>
        <p className="text-sm text-muted-foreground">
          {f.nome_fantasia ? `${f.nome_fantasia} — ` : ""}{formatCnpj(f.cnpj)}
        </p>
      </div>

      <Card className="p-5 space-y-4">
        <h3 className="text-sm font-semibold">Dados cadastrais</h3>
        <div className="grid gap-3 sm:grid-cols-2 text-sm">
          <Field label="Natureza jurídica" value={f.natureza_juridica ?? "—"} />
          <Field label="Porte" value={f.porte ?? "—"} />
          <Field label="Capital social" value={fmtBRL(f.capital_social)} />
          <Field label="Data de abertura" value={fmtDate(f.data_inicio_atividade)} />
          <Field label="Situação cadastral desde" value={fmtDate(f.data_situacao_cadastral)} />
          <Field label="CNAE principal" value={f.cnae_fiscal_descricao ?? "—"} />
        </div>
        {f.cnaes_secundarios && f.cnaes_secundarios.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">CNAEs secundários</p>
            <ul className="text-sm space-y-0.5 text-muted-foreground">
              {f.cnaes_secundarios.map((c: any, i: number) => <li key={i}>{c.codigo} — {c.descricao}</li>)}
            </ul>
          </div>
        )}
      </Card>

      <Card className="p-5 space-y-4">
        <h3 className="text-sm font-semibold">Endereço e contato</h3>
        <div className="grid gap-3 sm:grid-cols-2 text-sm">
          <Field label="Endereço" value={endereco || "—"} full />
          <Field label="Município/UF" value={f.municipio ? `${f.municipio}/${f.uf}` : "—"} />
          <Field label="CEP" value={f.cep ?? "—"} />
          <Field label="Telefone" value={f.ddd_telefone_1 || f.ddd_telefone_2 || "—"} />
          <Field label="E-mail" value={f.email ?? "—"} />
        </div>
      </Card>

      {f.qsa && f.qsa.length > 0 && (
        <Card className="p-5 space-y-3">
          <h3 className="text-sm font-semibold">Sócios (QSA)</h3>
          <ul className="text-sm space-y-1">
            {f.qsa.map((s: any, i: number) => (
              <li key={i} className="flex justify-between border-b pb-1 last:border-0">
                <span>{s.nome_socio}</span>
                <span className="text-muted-foreground">{s.qualificacao_socio}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {f.regime_tributario && f.regime_tributario.length > 0 && (
        <Card className="p-5 space-y-3">
          <h3 className="text-sm font-semibold">Regime tributário (histórico)</h3>
          <ul className="text-sm space-y-1">
            {f.regime_tributario.map((r: any, i: number) => (
              <li key={i} className="flex justify-between border-b pb-1 last:border-0">
                <span>{r.ano}</span>
                <span className="text-muted-foreground">{r.forma_de_tributacao}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-5 space-y-3">
        <h3 className="text-sm font-semibold">Produtos comprados</h3>
        {linkedItems.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhum produto vinculado a este fornecedor ainda</p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">Clique num produto para ver o histórico de preço.</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Preço médio</TableHead>
                  <TableHead>Última compra</TableHead>
                  <TableHead className="text-center">Tendência</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linkedItems.map((it) => {
                  const trend = trendFor(it.id);
                  return (
                    <TableRow key={it.id} className="cursor-pointer" onClick={() => setSelectedItem(it)}>
                      <TableCell className="font-mono text-xs">{it.code}</TableCell>
                      <TableCell>{it.description}</TableCell>
                      <TableCell className="text-right">{it.avg_price ? fmtBRL(Number(it.avg_price)) : "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{it.last_purchased_at ? new Date(it.last_purchased_at).toLocaleDateString("pt-BR") : "—"}</TableCell>
                      <TableCell className="text-center">
                        {trend === "up" && <TrendingUp className="inline h-4 w-4 text-destructive" />}
                        {trend === "down" && <TrendingDown className="inline h-4 w-4 text-success" />}
                        {trend == null && <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </>
        )}
      </Card>

      <Dialog open={!!selectedItem} onOpenChange={(o) => !o && setSelectedItem(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedItem?.code} — {selectedItem?.description}</DialogTitle>
          </DialogHeader>
          {chartData.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Sem histórico de compras suficiente</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.015 250)" />
                <XAxis dataKey="date" stroke="oklch(0.5 0.03 255)" fontSize={11} />
                <YAxis stroke="oklch(0.5 0.03 255)" fontSize={11} tickFormatter={(v) => `R$${v}`} />
                <Tooltip
                  contentStyle={{ background: "oklch(1 0 0)", border: "1px solid oklch(0.9 0.015 250)", borderRadius: 8 }}
                  formatter={(v: number) => fmtBRL(v)}
                />
                <Line type="monotone" dataKey="preco" stroke="oklch(0.52 0.18 255)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : undefined}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
