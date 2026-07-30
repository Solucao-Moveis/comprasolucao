import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SituacaoCadastralBadge, SimplesNacionalBadge } from "@/components/StatusBadge";
import { formatCnpj } from "@/lib/cnpj";
import { Plus } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/fornecedores/")({
  component: () => <AppLayout><Fornecedores /></AppLayout>,
});

function Fornecedores() {
  const [search, setSearch] = useState("");

  const { data } = useQuery({
    queryKey: ["fornecedores"],
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("fornecedores")
        .select("id,cnpj,razao_social,nome_fantasia,uf,municipio,descricao_situacao_cadastral,opcao_pelo_simples" as any)
        .order("razao_social");
      return rows ?? [];
    },
  });

  const list = (data ?? []) as any[];
  const q = search.trim().toLowerCase();
  const filtered = list.filter((f) => {
    if (!q) return true;
    return (
      (f.razao_social ?? "").toLowerCase().includes(q) ||
      (f.nome_fantasia ?? "").toLowerCase().includes(q) ||
      (f.cnpj ?? "").includes(q.replace(/\D/g, ""))
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Fornecedores</h1>
          <p className="text-sm text-muted-foreground">Cadastro com dados oficiais consultados por CNPJ</p>
        </div>
        <Button asChild>
          <Link to="/fornecedores/new"><Plus className="mr-2 h-4 w-4" /> Novo fornecedor</Link>
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Input
          placeholder="Pesquisar por razão social, nome fantasia ou CNPJ..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-md"
        />
        <span className="text-xs text-muted-foreground">{filtered.length} de {list.length}</span>
      </div>

      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Razão social</TableHead>
              <TableHead>Nome fantasia</TableHead>
              <TableHead>CNPJ</TableHead>
              <TableHead>UF/Município</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead>Simples Nacional</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((f) => (
              <TableRow key={f.id} className="cursor-pointer">
                <TableCell className="font-medium">
                  <Link to="/fornecedores/$id" params={{ id: f.id }} className="hover:underline">{f.razao_social}</Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{f.nome_fantasia ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">{formatCnpj(f.cnpj)}</TableCell>
                <TableCell className="text-muted-foreground">{f.municipio ? `${f.municipio}/${f.uf}` : "—"}</TableCell>
                <TableCell><SituacaoCadastralBadge descricao={f.descricao_situacao_cadastral} /></TableCell>
                <TableCell><SimplesNacionalBadge optante={f.opcao_pelo_simples} /></TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">{list.length === 0 ? "Nenhum fornecedor cadastrado" : "Nenhum fornecedor encontrado"}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
