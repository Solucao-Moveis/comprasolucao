// Consulta de CNPJ via BrasilAPI (brasilapi.com.br) — gratuita, sem chave,
// dado público da Receita Federal. Usada no cadastro de fornecedores: os
// campos vindos daqui ficam congelados no momento do cadastro (sem edição
// manual nem refresh — ver 20260730100000_fornecedores.sql).
//
// A busca passa pela Edge Function `cnpj-lookup` (não é chamada direto do
// navegador): quando a BrasilAPI aplica rate limit (429), a resposta de
// erro dela não vem com cabeçalho CORS, e o navegador reporta isso como
// "bloqueado por CORS" em vez do 429 real — o proxy no servidor evita esse
// problema e já tenta de novo automaticamente em caso de 429.

import { supabase } from "@/integrations/supabase/client";

export const onlyDigits = (v: string) => v.replace(/\D/g, "");

export const formatCnpj = (v: string) => {
  const d = onlyDigits(v).padEnd(14, " ").slice(0, 14);
  if (onlyDigits(v).length < 14) return v;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;
};

export type BrasilApiSocio = {
  nome_socio: string;
  qualificacao_socio: string;
  data_entrada_sociedade: string | null;
  faixa_etaria: string | null;
};

export type BrasilApiCnae = { codigo: number; descricao: string };

export type BrasilApiRegimeTributario = {
  ano: number;
  forma_de_tributacao: string;
  quantidade_de_escrituracoes: number;
};

export type BrasilApiCnpj = {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  situacao_cadastral: number;
  descricao_situacao_cadastral: string;
  data_situacao_cadastral: string | null;
  natureza_juridica: string | null;
  porte: string | null;
  capital_social: number | null;
  data_inicio_atividade: string | null;
  cnae_fiscal: number | null;
  cnae_fiscal_descricao: string | null;
  cnaes_secundarios: BrasilApiCnae[] | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cep: string | null;
  municipio: string | null;
  uf: string | null;
  ddd_telefone_1: string | null;
  ddd_telefone_2: string | null;
  email: string | null;
  opcao_pelo_simples: boolean | null;
  opcao_pelo_mei: boolean | null;
  qsa: BrasilApiSocio[] | null;
  regime_tributario: BrasilApiRegimeTributario[] | null;
  [key: string]: unknown;
};

export async function buscarCnpj(cnpjInput: string): Promise<BrasilApiCnpj> {
  const digits = onlyDigits(cnpjInput);
  if (digits.length !== 14) throw new Error("CNPJ inválido — precisa ter 14 dígitos.");

  const { data, error } = await supabase.functions.invoke("cnpj-lookup", { body: { cnpj: digits } });
  if (error) {
    const status = (error as any)?.context?.status;
    if (status === 404) throw new Error("CNPJ não encontrado na Receita Federal.");
    if (status === 429) throw new Error("Muitas consultas em pouco tempo — aguarde um instante e tente de novo.");
    throw new Error("Não foi possível consultar o CNPJ agora. Tente novamente.");
  }
  return data as BrasilApiCnpj;
}

export function mapToFornecedorRow(raw: BrasilApiCnpj, userId: string) {
  return {
    cnpj: onlyDigits(raw.cnpj),
    razao_social: raw.razao_social,
    nome_fantasia: raw.nome_fantasia || null,
    situacao_cadastral: raw.situacao_cadastral ?? null,
    descricao_situacao_cadastral: raw.descricao_situacao_cadastral || null,
    data_situacao_cadastral: raw.data_situacao_cadastral || null,
    natureza_juridica: raw.natureza_juridica || null,
    porte: raw.porte || null,
    capital_social: raw.capital_social ?? null,
    data_inicio_atividade: raw.data_inicio_atividade || null,
    cnae_fiscal: raw.cnae_fiscal ?? null,
    cnae_fiscal_descricao: raw.cnae_fiscal_descricao || null,
    cnaes_secundarios: raw.cnaes_secundarios ?? null,
    logradouro: raw.logradouro || null,
    numero: raw.numero || null,
    complemento: raw.complemento || null,
    bairro: raw.bairro || null,
    cep: raw.cep || null,
    municipio: raw.municipio || null,
    uf: raw.uf || null,
    ddd_telefone_1: raw.ddd_telefone_1 || null,
    ddd_telefone_2: raw.ddd_telefone_2 || null,
    email: raw.email || null,
    opcao_pelo_simples: raw.opcao_pelo_simples ?? null,
    opcao_pelo_mei: raw.opcao_pelo_mei ?? null,
    qsa: raw.qsa ?? null,
    regime_tributario: raw.regime_tributario ?? null,
    raw_response: raw,
    created_by: userId,
  };
}
