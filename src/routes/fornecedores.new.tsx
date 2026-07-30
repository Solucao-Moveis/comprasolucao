import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { useState } from "react";
import { Search } from "lucide-react";
import { buscarCnpj, formatCnpj, mapToFornecedorRow, type BrasilApiCnpj } from "@/lib/cnpj";

export const Route = createFileRoute("/fornecedores/new")({
  component: () => <AppLayout><NovoFornecedor /></AppLayout>,
});

function NovoFornecedor() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [cnpjInput, setCnpjInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<BrasilApiCnpj | null>(null);

  const handleBuscar = async () => {
    setPreview(null);
    setBusy(true);
    try {
      const raw = await buscarCnpj(cnpjInput);
      setPreview(raw);
    } catch (err: any) {
      toast.error(err.message || "Não foi possível consultar o CNPJ");
    } finally {
      setBusy(false);
    }
  };

  const handleSalvar = async () => {
    if (!preview || !user) return;
    setSaving(true);
    const row = mapToFornecedorRow(preview, user.id);
    const { data, error } = await supabase.from("fornecedores").insert(row as any).select("id").single();
    setSaving(false);
    if (error) {
      if (error.code === "23505") {
        toast.error("Esse CNPJ já está cadastrado.");
      } else {
        toast.error(error.message);
      }
      return;
    }
    toast.success("Fornecedor cadastrado");
    navigate({ to: "/fornecedores/$id", params: { id: data.id } });
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Novo fornecedor</h1>
        <p className="text-sm text-muted-foreground">Busque o CNPJ para preencher os dados automaticamente com informação oficial da Receita Federal</p>
      </div>

      <Card className="p-5 space-y-3">
        <Label>CNPJ *</Label>
        <div className="flex gap-2">
          <Input
            value={cnpjInput}
            onChange={(e) => setCnpjInput(e.target.value)}
            placeholder="00.000.000/0000-00"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleBuscar(); } }}
          />
          <Button type="button" onClick={handleBuscar} disabled={busy || !cnpjInput.trim()}>
            <Search className="mr-2 h-4 w-4" /> {busy ? "Buscando..." : "Buscar"}
          </Button>
        </div>
      </Card>

      {preview && (
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Dados encontrados (somente leitura)</h3>
            <span className="font-mono text-xs text-muted-foreground">{formatCnpj(preview.cnpj)}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 text-sm">
            <Field label="Razão social" value={preview.razao_social} />
            <Field label="Nome fantasia" value={preview.nome_fantasia || "—"} />
            <Field label="Situação cadastral" value={preview.descricao_situacao_cadastral} />
            <Field label="Porte" value={preview.porte || "—"} />
            <Field label="Natureza jurídica" value={preview.natureza_juridica || "—"} />
            <Field label="Simples Nacional" value={preview.opcao_pelo_simples ? "Sim" : "Não"} />
            <Field label="CNAE principal" value={preview.cnae_fiscal_descricao || "—"} />
            <Field label="Data de abertura" value={preview.data_inicio_atividade ? new Date(`${preview.data_inicio_atividade}T00:00:00`).toLocaleDateString("pt-BR") : "—"} />
            <Field
              label="Endereço"
              value={[preview.logradouro, preview.numero, preview.bairro, preview.municipio, preview.uf].filter(Boolean).join(", ") || "—"}
              full
            />
            <Field label="Telefone" value={preview.ddd_telefone_1 || "—"} />
            <Field label="E-mail" value={preview.email || "—"} />
          </div>
          {preview.qsa && preview.qsa.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">Sócios</p>
              <ul className="text-sm space-y-0.5">
                {preview.qsa.map((s, i) => (
                  <li key={i}>{s.nome_socio} <span className="text-muted-foreground">— {s.qualificacao_socio}</span></li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex justify-end">
            <Button onClick={handleSalvar} disabled={saving}>{saving ? "Salvando..." : "Salvar fornecedor"}</Button>
          </div>
        </Card>
      )}
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
