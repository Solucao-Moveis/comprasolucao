// Regras de pontuação da Avaliação de Fornecedores (Procedimento P-04 / ISO 9001:2015 9.1.3).
// Pesos: Q01=40, Q02=30, Q03=10, Q04=20 (total 100). Cada "Não" reduz a contribuição
// daquela pergunta, com piso 0.

export type EvaluationClass = "otimo" | "bom" | "regular" | "insuficiente";

export const QUESTIONS = [
  { key: "q1", num: "01", label: "Os requisitos técnicos estão conforme?", weight: 40 },
  { key: "q2", num: "02", label: "O fornecimento foi no prazo estabelecido?", weight: 30 },
  { key: "q3", num: "03", label: "O fornecimento foi na quantidade correta?", weight: 10 },
  { key: "q4", num: "04", label: "O produto está bem conservado?", weight: 20 },
] as const;

export interface ScoreInputs {
  q1_conforme: boolean; // requisitos técnicos
  q2_prazo: boolean; // prazo
  q3_quantidade: boolean; // quantidade
  q4_conservacao: boolean; // conservação
}

export interface ScoreResult {
  q1Points: number;
  q2Points: number;
  q3Points: number;
  q4Points: number;
  total: number;
  classification: EvaluationClass;
  returned: boolean; // Q01 Não → produto devolvido
  suggestedApproved: boolean;
}

/**
 * Pontuação fechada das 4 perguntas: Sim = peso cheio, Não = 0.
 * As deduções graduadas dos "Critérios" (atraso, % faltante, quesitos) NÃO entram
 * aqui — são apuradas posteriormente em outro processo. O comprador só dá o número.
 */
export function computeScore(i: ScoreInputs): ScoreResult {
  const q1Points = i.q1_conforme ? 40 : 0;
  const q2Points = i.q2_prazo ? 30 : 0;
  const q3Points = i.q3_quantidade ? 10 : 0;
  const q4Points = i.q4_conservacao ? 20 : 0;

  const total = q1Points + q2Points + q3Points + q4Points;
  const classification = classify(total);
  const returned = !i.q1_conforme; // Q01 Não → produto devolvido
  const suggestedApproved = !returned && total >= 65;

  return { q1Points, q2Points, q3Points, q4Points, total, classification, returned, suggestedApproved };
}

/** Faixa de classificação por pontuação. */
export function classify(total: number): EvaluationClass {
  if (total >= 95) return "otimo";
  if (total >= 80) return "bom";
  if (total >= 65) return "regular";
  return "insuficiente";
}

export const CLASS_LABEL: Record<EvaluationClass, string> = {
  otimo: "Ótimo",
  bom: "Bom",
  regular: "Regular",
  insuficiente: "Insuficiente",
};

/** Consequência de consulta de cada faixa (texto do P-04). */
export const CLASS_CONSULTA: Record<EvaluationClass, string> = {
  otimo: "Prioridade para consulta",
  bom: "Sem restrições para consulta",
  regular: "Terceira opção de consulta",
  insuficiente: "Não será consultado",
};

/** Faixa textual (para o PDF). */
export const CLASS_RANGE: Record<EvaluationClass, string> = {
  otimo: "95 a 100 pontos",
  bom: "80 a 94 pontos",
  regular: "65 a 79 pontos",
  insuficiente: "0 a 64 pontos",
};
