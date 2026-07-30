import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { SituacaoCadastralBadge, SimplesNacionalBadge } from "@/components/StatusBadge";
import { formatCnpj } from "@/lib/cnpj";
import { ArrowLeft } from "lucide-react";

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
          <SimplesNacionalBadge optante={f.opcao_pelo_simples} />
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
