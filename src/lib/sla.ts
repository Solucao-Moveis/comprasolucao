// Prazos padrão de entrega por tipo de compra, usados no aviso de
// necessidade x prazo (formulário), no cálculo automático do prazo
// limite de aprovação→entrega e no indicador "SC aberta tardia" do
// dashboard. Urgente tem prioridade sobre o tipo de compra.
export const SLA_ENTREGA_DIAS: Record<"materia_prima" | "insumos_outros", number> = {
  materia_prima: 15,
  insumos_outros: 5,
};

export const SLA_URGENTE_HORAS = 24;

export function prazoEntregaPadraoHoras(tipoCompra: string | null | undefined, urgente: boolean): number | null {
  if (urgente) return SLA_URGENTE_HORAS;
  if (tipoCompra === "materia_prima" || tipoCompra === "insumos_outros") {
    return SLA_ENTREGA_DIAS[tipoCompra] * 24;
  }
  return null;
}
