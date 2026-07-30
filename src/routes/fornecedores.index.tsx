import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { SituacaoCadastralBadge, RegimeFiscalBadge } from "@/components/StatusBadge";
import { buscarCnpj, formatCnpj, mapToFornecedorRow, onlyDigits, sleep } from "@/lib/cnpj";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Plus, Upload, FileSpreadsheet } from "lucide-react";
import { useState } from "react";
import * as XLSX from "xlsx";

export const Route = createFileRoute("/fornecedores/")({
  component: () => <AppLayout><Fornecedores /></AppLayout>,
});

type ImportResult = {
  cnpj: string;
  label: string;
  status: "ok" | "duplicado" | "nao_encontrado" | "erro";
  message?: string;
};

function Fornecedores() {
  const [search, setSearch] = useState("");
  const [importOpen, setImportOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["fornecedores"],
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("fornecedores")
        .select("id,cnpj,razao_social,nome_fantasia,uf,municipio,descricao_situacao_cadastral,opcao_pelo_simples,opcao_pelo_mei,regime_tributario" as any)
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
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="mr-2 h-4 w-4" /> Importar
          </Button>
          <Button asChild>
            <Link to="/fornecedores/new"><Plus className="mr-2 h-4 w-4" /> Novo fornecedor</Link>
          </Button>
        </div>
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
              <TableHead>Classificação fiscal</TableHead>
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
                <TableCell><RegimeFiscalBadge optante={f.opcao_pelo_simples} mei={f.opcao_pelo_mei} regimeTributario={f.regime_tributario} /></TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">{list.length === 0 ? "Nenhum fornecedor cadastrado" : "Nenhum fornecedor encontrado"}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <ImportDialog open={importOpen} onOpenChange={setImportOpen} existingCnpjs={list.map((f) => f.cnpj)} />
    </div>
  );
}

function ImportDialog({ open, onOpenChange, existingCnpjs }: {
  open: boolean; onOpenChange: (v: boolean) => void; existingCnpjs: string[];
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [parsedCnpjs, setParsedCnpjs] = useState<string[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<ImportResult[]>([]);

  const reset = () => { setParsedCnpjs(null); setImporting(false); setResults([]); };

  const handleFile = async (file: File) => {
    setResults([]);
    const buf = await file.arrayBuffer();
    const workbook = XLSX.read(buf, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });

    const found = new Set<string>();
    for (const row of rows) {
      if (!Array.isArray(row)) continue;
      for (const cell of row) {
        const digits = onlyDigits(String(cell ?? ""));
        if (digits.length === 14) { found.add(digits); break; }
      }
    }
    setParsedCnpjs(Array.from(found));
    if (found.size === 0) toast.error("Não encontramos nenhum CNPJ (14 dígitos) na planilha.");
  };

  const handleConfirmImport = async () => {
    if (!parsedCnpjs || !user) return;
    setImporting(true);
    const seen = new Set(existingCnpjs);
    for (const [i, cnpj] of parsedCnpjs.entries()) {
      if (seen.has(cnpj)) {
        setResults((prev) => [...prev, { cnpj, label: "", status: "duplicado" }]);
        continue;
      }
      // espaça as buscas pra não bater no limite de requisições da BrasilAPI
      if (i > 0) await sleep(1500);
      try {
        const raw = await buscarCnpj(cnpj);
        const row = mapToFornecedorRow(raw, user.id);
        const { error } = await supabase.from("fornecedores").insert(row as any);
        if (error) {
          if (error.code === "23505") {
            setResults((prev) => [...prev, { cnpj, label: raw.razao_social, status: "duplicado" }]);
          } else {
            setResults((prev) => [...prev, { cnpj, label: "", status: "erro", message: error.message }]);
          }
        } else {
          seen.add(cnpj);
          setResults((prev) => [...prev, { cnpj, label: raw.razao_social, status: "ok" }]);
        }
      } catch (err: any) {
        const notFound = /não encontrado/i.test(err?.message ?? "");
        setResults((prev) => [...prev, { cnpj, label: "", status: notFound ? "nao_encontrado" : "erro", message: err?.message }]);
      }
    }
    setImporting(false);
    qc.invalidateQueries({ queryKey: ["fornecedores"] });
  };

  const statusLabel: Record<ImportResult["status"], string> = {
    ok: "Importado",
    duplicado: "Já cadastrado",
    nao_encontrado: "CNPJ não encontrado",
    erro: "Erro",
  };
  const statusClass: Record<ImportResult["status"], string> = {
    ok: "text-success",
    duplicado: "text-muted-foreground",
    nao_encontrado: "text-destructive",
    erro: "text-destructive",
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Importar fornecedores</DialogTitle></DialogHeader>

        {!parsedCnpjs && (
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground hover:bg-accent/40">
            <FileSpreadsheet className="h-6 w-6" />
            Clique para escolher uma planilha (.xlsx ou .csv) com uma coluna de CNPJ
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
          </label>
        )}

        {parsedCnpjs && results.length === 0 && !importing && (
          <div className="space-y-3">
            <p className="text-sm">Encontramos <strong>{parsedCnpjs.length}</strong> CNPJ{parsedCnpjs.length === 1 ? "" : "s"} na planilha.</p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={reset}>Escolher outra planilha</Button>
              <Button onClick={handleConfirmImport}>Importar {parsedCnpjs.length}</Button>
            </div>
          </div>
        )}

        {parsedCnpjs && (importing || results.length > 0) && (
          <div className="space-y-3">
            {importing && (
              <div className="space-y-1">
                <Progress value={(results.length / parsedCnpjs.length) * 100} />
                <p className="text-xs text-muted-foreground">Processando {results.length} de {parsedCnpjs.length}...</p>
              </div>
            )}
            <div className="max-h-72 overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <tbody>
                  {results.map((r, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-2 py-1.5 font-mono text-xs">{formatCnpj(r.cnpj)}</td>
                      <td className="px-2 py-1.5 truncate">{r.label || "—"}</td>
                      <td className={`px-2 py-1.5 text-right text-xs font-medium ${statusClass[r.status]}`}>{statusLabel[r.status]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!importing && (
              <div className="flex justify-end">
                <Button onClick={() => { onOpenChange(false); reset(); }}>Fechar</Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
