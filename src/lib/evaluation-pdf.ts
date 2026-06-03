// Geração do PDF da Avaliação de Fornecedores — réplica fiel do modelo Word (P-04),
// porém preenchida. Desenho VETORIAL com jsPDF (sem html2canvas) — evita os problemas
// de parsing de cores oklch/lab do tema (Tailwind v4) e gera texto nítido.
import { jsPDF } from "jspdf";
import logo from "@/assets/logo-solucao-moveis.png";
import {
  QUESTIONS,
  CLASS_LABEL,
  CLASS_CONSULTA,
  CLASS_RANGE,
  type EvaluationClass,
  type ScoreResult,
} from "@/lib/evaluation";

export interface EvaluationPdfData {
  number?: string | null;
  evaluation_date: string; // yyyy-mm-dd
  evaluator_name: string;
  nf?: string | null;
  supplier: string;
  q1_conforme: boolean;
  q2_prazo: boolean;
  q3_quantidade: boolean;
  q4_conservacao: boolean;
  approved: boolean;
  observation?: string | null;
  result: ScoreResult;
}

function fmtDate(d: string): string {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return d;
  return `${day}/${m}/${y}`;
}

export function evaluationFilename(d: EvaluationPdfData): string {
  const base = (d.number ?? `AF-${d.supplier}`).replace(/[\\/:*?"<>|]+/g, "-");
  return `Avaliacao-${base}.pdf`;
}

async function toDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Gera o PDF (Blob). Roda só no cliente. */
export async function generateEvaluationPdf(d: EvaluationPdfData): Promise<Blob> {
  const logoData = await toDataUrl(logo);
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

  const PAGE_W = 210;
  const M = 8;
  const X0 = M;
  const W = 194;
  const XR = X0 + W; // 202
  let y = M;

  doc.setDrawColor(0);
  doc.setLineWidth(0.4);

  const r = d.result;

  // ---------------- Cabeçalho ----------------
  const headH = 16;
  const logoW = 40;
  doc.setFillColor(43, 43, 43);
  doc.rect(X0, y, logoW, headH, "F");
  if (logoData) {
    try { doc.addImage(logoData, "PNG", X0 + 6, y + 3.5, 28, 9); } catch { /* logo é opcional */ }
  }
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("AVALIAÇÃO DE FORNECEDORES E INSUMOS", X0 + logoW + (W - logoW) / 2, y + headH / 2 + 1.5, {
    align: "center",
    maxWidth: W - logoW - 6,
  });
  doc.rect(X0, y, W, headH);
  doc.line(X0 + logoW, y, X0 + logoW, y + headH);
  y += headH;

  // ---------------- Texto normativo ----------------
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  const intro =
    "Em atendimento ao item 9.1.3 da Norma NBR ISO 9001:2015 (Análise e Avaliação) informamos que, " +
    "conforme o Procedimento P-04 da SOLUÇÃO (Avaliação de Fornecedores), o material comprado da sua " +
    "empresa será avaliado no ato da entrega, conforme o questionário abaixo:";
  const introLines = doc.splitTextToSize(intro, W - 6) as string[];
  const introH = introLines.length * 3.7 + 4;
  doc.rect(X0, y, W, introH);
  doc.text(introLines, X0 + 3, y + 4.2);
  y += introH;

  // ---------------- Campos do cabeçalho ----------------
  const fH = 7;
  const cW = W / 2;
  const field = (x: number, label: string, value: string) => {
    doc.rect(x, y, cW, fH);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text(label, x + 2, y + 4.7);
    const lw = doc.getTextWidth(label);
    doc.setFont("helvetica", "normal");
    doc.text(doc.splitTextToSize(value || "", cW - lw - 5)[0] ?? "", x + 2 + lw + 1.5, y + 4.7);
  };
  field(X0, "DATA:", fmtDate(d.evaluation_date));
  field(X0 + cW, "NOME DO AVALIADOR:", d.evaluator_name);
  y += fH;
  field(X0, "NF:", d.nf ?? "");
  field(X0 + cW, "FORNECEDOR:", d.supplier);
  y += fH;

  // ---------------- Questionário ----------------
  const xAt = X0;
  const wAt = 138;
  const xSim = X0 + wAt; // 146
  const xNao = xSim + 16; // 162
  const xPts = xNao + 16; // 178  (Pontos: 24, dividido em peso 12 + obtido 12)
  const xObt = xPts + 12; // 190
  const cx = (a: number, b: number) => (a + b) / 2;

  const hH = 7;
  doc.setFillColor(233, 233, 233);
  doc.rect(X0, y, W, hH, "F");
  doc.rect(X0, y, W, hH);
  doc.line(xSim, y, xSim, y + hH);
  doc.line(xNao, y, xNao, y + hH);
  doc.line(xPts, y, xPts, y + hH);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Atendimento", cx(xAt, xSim), y + 4.6, { align: "center" });
  doc.text("Sim", cx(xSim, xNao), y + 4.6, { align: "center" });
  doc.text("Não", cx(xNao, xPts), y + 4.6, { align: "center" });
  doc.text("Pontos", cx(xPts, XR), y + 4.6, { align: "center" });
  y += hH;

  const answers = [d.q1_conforme, d.q2_prazo, d.q3_quantidade, d.q4_conservacao];
  const points = [r.q1Points, r.q2Points, r.q3Points, r.q4Points];
  const rowH = 7;
  QUESTIONS.forEach((q, i) => {
    doc.rect(X0, y, W, rowH);
    doc.line(xSim, y, xSim, y + rowH);
    doc.line(xNao, y, xNao, y + rowH);
    doc.line(xPts, y, xPts, y + rowH);
    doc.line(xObt, y, xObt, y + rowH);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(`${q.num} - ${q.label}`, xAt + 2, y + 4.6, { maxWidth: wAt - 4 });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    if (answers[i]) doc.text("X", cx(xSim, xNao), y + 4.8, { align: "center" });
    else doc.text("X", cx(xNao, xPts), y + 4.8, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(String(q.weight), cx(xPts, xObt), y + 4.6, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.text(String(points[i]), cx(xObt, XR), y + 4.6, { align: "center" });
    y += rowH;
  });
  // total
  doc.rect(X0, y, W, rowH);
  doc.line(xPts, y, xPts, y + rowH);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("Total de pontos obtidos", xPts - 2, y + 4.6, { align: "right" });
  doc.setFontSize(11);
  doc.text(String(r.total), cx(xPts, XR), y + 4.8, { align: "center" });
  y += rowH;

  // ---------------- Critério de Avaliação ----------------
  const sectionBar = (title: string) => {
    const bh = 6;
    doc.setFillColor(233, 233, 233);
    doc.rect(X0, y, W, bh, "F");
    doc.rect(X0, y, W, bh);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(title, X0 + 2, y + 4.2);
    y += bh;
  };
  sectionBar("Critério de Avaliação");
  const criterios = [
    "A resposta SIM a todas as perguntas equivale a 100 pontos",
    "NÃO para a pergunta 01, o produto será devolvido.",
    "NÃO para a pergunta 02, perderá 5 pontos por dia de atraso até o limite de 30 pontos.",
    "NÃO para a pergunta 03, perderá 1 ponto para cada 10% do produto faltante.",
    "NÃO para a pergunta 04, perderá 2 pontos por quesitos como embalagem, aparência, oxidação, etc.",
  ];
  const numW = 8;
  criterios.forEach((t, i) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    const lines = doc.splitTextToSize(t, W - numW - 4) as string[];
    const h = Math.max(6, lines.length * 3.7 + 2.5);
    doc.rect(X0, y, W, h);
    doc.line(X0 + numW, y, X0 + numW, y + h);
    doc.setFont("helvetica", "bold");
    doc.text(String(i + 1), X0 + numW / 2, y + 4.2, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.text(lines, X0 + numW + 2, y + 4);
    y += h;
  });

  // ---------------- Pontuação ----------------
  sectionBar("Pontuação");
  const xR1 = X0 + 40;
  const xR2 = X0 + 70;
  (["otimo", "bom", "regular", "insuficiente"] as EvaluationClass[]).forEach((c) => {
    const bh = 6;
    const hit = r.classification === c;
    if (hit) {
      doc.setFillColor(255, 224, 138);
      doc.rect(X0, y, W, bh, "F");
    }
    doc.rect(X0, y, W, bh);
    doc.line(xR1, y, xR1, y + bh);
    doc.line(xR2, y, xR2, y + bh);
    doc.setFont("helvetica", hit ? "bold" : "normal");
    doc.setFontSize(8.5);
    doc.text(CLASS_RANGE[c], cx(X0, xR1), y + 4.1, { align: "center" });
    doc.text(CLASS_LABEL[c], cx(xR1, xR2), y + 4.1, { align: "center" });
    doc.text(CLASS_CONSULTA[c], xR2 + 2, y + 4.1);
    y += bh;
  });

  // ---------------- Aprovado / Não Aprovado ----------------
  const apH = 9;
  const checkbox = (bx: number, by: number, checked: boolean) => {
    doc.setLineWidth(0.5);
    doc.rect(bx, by, 4.2, 4.2);
    doc.setLineWidth(0.4);
    if (checked) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("X", bx + 2.1, by + 3.4, { align: "center" });
    }
  };
  doc.rect(X0, y, cW, apH);
  doc.rect(X0 + cW, y, cW, apH);
  checkbox(X0 + 22, y + 2.4, d.approved);
  checkbox(X0 + cW + 16, y + 2.4, !d.approved);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("APROVADO", X0 + 29, y + 5.8);
  doc.text("NÃO APROVADO", X0 + cW + 23, y + 5.8);
  y += apH;

  // ---------------- Observação ----------------
  const obsH = 18;
  doc.rect(X0, y, W, obsH);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("OBSERVAÇÃO:", X0 + 2, y + 5);
  doc.setFont("helvetica", "normal");
  const obsLines = doc.splitTextToSize(d.observation ?? "", W - 6) as string[];
  doc.text(obsLines, X0 + 2, y + 9.5);
  y += obsH;

  // ---------------- Assinatura ----------------
  // Nome em destaque, "assinado" em cima da linha; legenda discreta embaixo.
  y += 22;
  const cxPage = PAGE_W / 2;
  const halfLine = 58;
  doc.setFont("times", "italic");
  doc.setFontSize(22);
  doc.setTextColor(0, 0, 0);
  doc.text(d.evaluator_name, cxPage, y, { align: "center", maxWidth: halfLine * 2 - 6 });
  doc.setLineWidth(0.5);
  doc.line(cxPage - halfLine, y + 2.5, cxPage + halfLine, y + 2.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(60, 60, 60);
  doc.text(`Assinante: ${d.evaluator_name}  ·  Assinatura do Avaliador`, cxPage, y + 7.5, { align: "center" });

  // ---------------- Rodapé ----------------
  doc.setFontSize(7.5);
  doc.setTextColor(90, 90, 90);
  doc.text(
    `AF - Revisão 002 - 30/04/2026${d.number ? "   |   " + d.number : ""}`,
    XR,
    290,
    { align: "right" },
  );

  return doc.output("blob");
}

/** Dispara o download de um Blob no navegador. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
