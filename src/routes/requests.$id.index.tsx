import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge, PriorityBadge, ClassificationBadge, UrgenteBadge } from "@/components/StatusBadge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, XCircle, PackageCheck, Download, Send, Trash2, Pencil, ShoppingCart, Truck, Ban, ClipboardCheck, ArrowRight, Paperclip, Plus } from "lucide-react";
import { format } from "date-fns";

export const Route = createFileRoute("/requests/$id/")({
  component: RequestDetail,
});

function RequestDetail() {
  const { id } = Route.useParams();
  const { user, roles } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [comment, setComment] = useState("");
  const [decisionNote, setDecisionNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [purchaseAmount, setPurchaseAmount] = useState("");
  const [unitPrices, setUnitPrices] = useState<Record<string, string>>({});
  const [buyQty, setBuyQty] = useState<Record<string, string>>({});
  const [arriveQty, setArriveQty] = useState<Record<string, string>>({});
  const [expectedDelivery, setExpectedDelivery] = useState("");
  const [invoiceBusy, setInvoiceBusy] = useState<string | null>(null);
  const [poDialogOpen, setPoDialogOpen] = useState(false);
  const [poDialogTarget, setPoDialogTarget] = useState<any | null>(null); // null = novo pedido; objeto = editando um existente
  const [poDialogNumber, setPoDialogNumber] = useState("");
  const [poDialogSel, setPoDialogSel] = useState<Record<string, { checked: boolean; qty: string }>>({});
  const [itemRejections, setItemRejections] = useState<Record<string, { rejected: boolean; reason: string }>>({});
  const [revertReason, setRevertReason] = useState("");
  const [revertDialogOpen, setRevertDialogOpen] = useState(false);


  const { data: req } = useQuery({
    queryKey: ["request", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("purchase_requests")
        .select("*, sectors(code,name,approver_id), cost_centers(code,name)")
        .eq("id", id).single();
      if (!data) return null;
      const { data: prof } = await supabase.from("profiles").select("full_name,email").eq("id", data.requester_id).single();
      return { ...data, profiles: prof };
    },
  });
  const { data: comments } = useQuery({
    queryKey: ["comments", id],
    queryFn: async () => {
      const { data } = await supabase.from("request_comments").select("*").eq("request_id", id).order("created_at");
      if (!data) return [];
      const ids = Array.from(new Set(data.map((c) => c.user_id)));
      const { data: profs } = await supabase.from("profiles").select("id,full_name,email").in("id", ids);
      const map = new Map((profs ?? []).map((p) => [p.id, p]));
      return data.map((c) => ({ ...c, profiles: map.get(c.user_id) }));
    },
  });
  const { data: history } = useQuery({
    queryKey: ["history", id],
    queryFn: async () => {
      const { data } = await supabase.from("request_history").select("*").eq("request_id", id).order("created_at");
      if (!data) return [];
      const ids = Array.from(new Set(data.map((h) => h.user_id).filter(Boolean))) as string[];
      const { data: profs } = await supabase.from("profiles").select("id,full_name,email").in("id", ids);
      const map = new Map((profs ?? []).map((p) => [p.id, p]));
      return data.map((h) => ({ ...h, profiles: h.user_id ? map.get(h.user_id) : null }));
    },
  });
  const { data: attachments } = useQuery({
    queryKey: ["att", id],
    queryFn: async () => (await supabase.from("request_attachments").select("*").eq("request_id", id)).data ?? [],
  });
  const { data: reqItems } = useQuery({
    queryKey: ["request_items", id],
    queryFn: async () => {
      const { data } = await supabase.from("request_items").select("*, items(code,description,supplier,avg_price)").eq("request_id", id).order("position");
      return data ?? [];
    },
  });
  const { data: purchaseEntries } = useQuery({
    queryKey: ["purchase_entries", id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("purchase_entries")
        .select("*, request_items(description, unit)")
        .eq("request_id", id)
        .order("created_at", { ascending: false });
      if (!data) return [];
      const ids = Array.from(new Set(data.map((e: any) => e.created_by).filter(Boolean))) as string[];
      const { data: profs } = await supabase.from("profiles").select("id,full_name,email").in("id", ids);
      const map = new Map((profs ?? []).map((p) => [p.id, p]));
      return data.map((e: any) => ({ ...e, profiles: map.get(e.created_by) }));
    },
  });
  const { data: evaluation } = useQuery({
    queryKey: ["request-evaluation", id],
    queryFn: async () =>
      (await supabase
        .from("supplier_evaluations")
        .select("id,number,total_points,classification,approved,returned,evaluator_name,observation,created_at")
        .eq("request_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()).data,
  });
  const { data: purchaseOrders } = useQuery({
    queryKey: ["purchase_orders", id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("purchase_orders")
        .select("*")
        .eq("request_id", id)
        .order("created_at");
      return data ?? [];
    },
  });
  // itens vinculados a cada pedido de compra (pra baixa automática na chegada)
  const { data: poItems } = useQuery({
    queryKey: ["purchase_order_items", id, (purchaseOrders ?? []).map((po: any) => po.id).join(",")],
    queryFn: async () => {
      const poIds = (purchaseOrders ?? []).map((po: any) => po.id);
      if (poIds.length === 0) return [];
      const { data } = await (supabase as any)
        .from("purchase_order_items")
        .select("*")
        .in("purchase_order_id", poIds);
      return data ?? [];
    },
    enabled: !!purchaseOrders,
  });

  // mantém o input da previsão de entrega em sincronia com o valor salvo
  useEffect(() => {
    setExpectedDelivery((req as any)?.expected_delivery_date ?? "");
  }, [(req as any)?.expected_delivery_date]);

  // preenche o estado de rejeição de item a partir do que já está salvo, sem sobrescrever edição em curso
  useEffect(() => {
    if (!reqItems) return;
    setItemRejections((prev) => {
      const next = { ...prev };
      reqItems.forEach((it: any) => {
        if (!(it.id in next)) next[it.id] = { rejected: !!it.rejected, reason: it.rejection_reason ?? "" };
      });
      return next;
    });
  }, [reqItems]);

  if (!req) return <div className="text-muted-foreground">Carregando...</div>;

  const isApprover = req.sectors?.approver_id === user?.id || roles.includes("admin");
  const isOwner = req.requester_id === user?.id;
  const canDecide = isApprover && req.status === "pendente";
  const canFinalize = (roles.includes("comprador") || roles.includes("admin")) && (req.status === "aprovado" || req.status === "parcial" || req.status === "comprado");

  const decide = async (newStatus: "aprovado" | "negado") => {
    if (reqItems) {
      const missingReason = reqItems.find((it: any) => itemRejections[it.id]?.rejected && !itemRejections[it.id]?.reason.trim());
      if (missingReason) return toast.error(`Informe o motivo da rejeição de "${missingReason.description}"`);
    }
    setBusy(true);
    const newlyRejected: { description: string; reason: string }[] = [];
    if (reqItems) {
      for (const it of reqItems as any[]) {
        const rj = itemRejections[it.id];
        if (!rj) continue;
        const changed = !!it.rejected !== rj.rejected || (it.rejection_reason ?? "") !== rj.reason.trim();
        if (!changed) continue;
        const { error: riErr } = await supabase.from("request_items").update({
          rejected: rj.rejected,
          rejection_reason: rj.rejected ? rj.reason.trim() : null,
        } as any).eq("id", it.id);
        if (riErr) { setBusy(false); return toast.error(`Item "${it.description}": ${riErr.message}`); }
        if (rj.rejected) newlyRejected.push({ description: it.description, reason: rj.reason.trim() });
      }
    }
    const { error } = await supabase.from("purchase_requests").update({
      status: newStatus, approver_id: user!.id, decided_at: new Date().toISOString(), decision_note: decisionNote || null,
    }).eq("id", id);
    setBusy(false);
    if (error) return toast.error(error.message);
    // avisa o solicitante de cada item rejeitado, pra ele rever o motivo e, se
    // for o caso, abrir uma nova solicitação corrigindo o que impediu a compra
    if (newlyRejected.length > 0) {
      await supabase.from("notifications").insert(
        newlyRejected.map((r) => ({
          user_id: req.requester_id,
          request_id: id,
          title: `Item rejeitado — ${req.number}`,
          body: `O item "${r.description}" foi rejeitado: ${r.reason}. Revise o motivo e, se for o caso, abra uma nova solicitação corrigindo o que impediu a compra.`,
        }))
      );
    }
    toast.success(newStatus === "aprovado" ? "Solicitação aprovada" : "Solicitação negada");
    qc.invalidateQueries({ queryKey: ["request", id] });
    qc.invalidateQueries({ queryKey: ["request_items", id] });
    qc.invalidateQueries({ queryKey: ["history", id] });
  };

  // Reverte uma aprovação já feita (ex.: urgência marcada sem cumprir os requisitos).
  // Só permitido enquanto nada foi comprado ainda. Zera as rejeições de item também,
  // pra o aprovador decidir tudo de novo.
  const canRevert = req.status === "aprovado" && !req.purchased_at &&
    (reqItems ?? []).every((it: any) => Number(it.purchased_quantity ?? 0) === 0);

  const revertApproval = async () => {
    if (!revertReason.trim()) return toast.error("Informe o motivo da reversão");
    setBusy(true);
    if (reqItems && reqItems.length > 0) {
      const { error: riErr } = await supabase.from("request_items")
        .update({ rejected: false, rejection_reason: null } as any)
        .eq("request_id", id);
      if (riErr) { setBusy(false); return toast.error(riErr.message); }
    }
    const { error } = await supabase.from("purchase_requests").update({
      status: "pendente", decided_at: null, approver_id: null, decision_note: null,
    }).eq("id", id);
    if (error) { setBusy(false); return toast.error(error.message); }
    await supabase.from("request_comments").insert({
      request_id: id, user_id: user!.id, content: `Aprovação revertida: ${revertReason.trim()}`,
    });
    setBusy(false);
    setRevertDialogOpen(false);
    setRevertReason("");
    setItemRejections({});
    toast.success("Aprovação revertida — solicitação voltou para pendente");
    qc.invalidateQueries({ queryKey: ["request", id] });
    qc.invalidateQueries({ queryKey: ["request_items", id] });
    qc.invalidateQueries({ queryKey: ["comments", id] });
    qc.invalidateQueries({ queryKey: ["history", id] });
  };

  const finalize = async () => {
    setBusy(true);
    const { error } = await supabase.from("purchase_requests").update({
      status: "finalizado", finalized_at: new Date().toISOString(),
    }).eq("id", id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Compra finalizada");
    qc.invalidateQueries({ queryKey: ["request", id] });
    qc.invalidateQueries({ queryKey: ["history", id] });
  };

  const markPurchased = async () => {
    const amount = parseFloat(purchaseAmount.replace(",", "."));
    if (!purchaseAmount || isNaN(amount) || amount <= 0) {
      return toast.error("Informe o valor da compra");
    }
    setBusy(true);
    const { error } = await supabase.from("purchase_requests").update({
      purchased_at: new Date().toISOString(),
      purchase_amount: amount,
      status: "comprado",
    }).eq("id", id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Compra registrada");
    setPurchaseAmount("");
    qc.invalidateQueries({ queryKey: ["request", id] });
  };

  // Registra uma compra (total ou parcial) a partir dos itens: para cada item
  // informa-se a quantidade comprada agora e o preço unitário. Cada lançamento
  // vira um registro em purchase_entries e acumula em request_items.purchased_quantity.
  const registerPartial = async () => {
    const activeReqItems = (reqItems ?? []).filter((it: any) => !it.rejected);
    if (activeReqItems.length === 0) return toast.error("Sem itens para comprar (todos rejeitados)");
    const rows = activeReqItems.map((it: any) => {
      const already = Number(it.purchased_quantity ?? 0);
      const remaining = Number(it.quantity) - already;
      // preço só conta se foi digitado agora nesta tela
      const priceRaw = unitPrices[it.id];
      const hasPrice = priceRaw !== undefined && String(priceRaw).trim() !== "" && !isNaN(parseFloat(String(priceRaw).replace(",", ".")));
      const price = hasPrice ? parseFloat(String(priceRaw).replace(",", ".")) : NaN;
      // quantidade: usa o que foi digitado; se em branco, assume o que falta
      const qtyTyped = buyQty[it.id] !== undefined && String(buyQty[it.id]).trim() !== "";
      const qty = qtyTyped ? parseFloat(String(buyQty[it.id]).replace(",", ".")) : remaining;
      return { it, already, remaining, qty, price, hasPrice, qtyTyped };
    });
    // um item só entra nesta compra se você informou o preço dele
    const buying = rows.filter((r) => r.hasPrice && !isNaN(r.qty) && r.qty > 0);
    // digitou quantidade mas esqueceu o preço? avisa
    const missingPrice = rows.find((r) => r.qtyTyped && r.qty > 0 && !r.hasPrice);
    if (missingPrice) return toast.error(`Informe o preço unitário de "${missingPrice.it.description}"`);
    if (buying.length === 0) return toast.error("Informe o preço de pelo menos um item para registrar a compra");
    for (const r of buying) {
      if (r.qty > r.remaining + 1e-9) {
        return toast.error(`"${r.it.description}": quantidade acima do pendente (${r.remaining} ${r.it.unit})`);
      }
      if (r.price < 0) {
        return toast.error(`Preço inválido em "${r.it.description}"`);
      }
    }
    setBusy(true);
    const entries = buying.map((r) => ({
      request_id: id, request_item_id: r.it.id,
      quantity: r.qty, unit_price: r.price, created_by: user!.id,
    }));
    const { error: eErr } = await (supabase as any).from("purchase_entries").insert(entries);
    if (eErr) { setBusy(false); return toast.error(eErr.message); }
    for (const r of buying) {
      const { error } = await supabase.from("request_items")
        .update({ purchased_quantity: r.already + r.qty, unit_price: r.price } as any)
        .eq("id", r.it.id);
      if (error) { setBusy(false); return toast.error(error.message); }
    }
    // recalcula estado da solicitação
    const allFull = rows.every((r) => {
      const bought = r.already + (buying.find((b) => b.it.id === r.it.id)?.qty ?? 0);
      return bought >= Number(r.it.quantity) - 1e-9;
    });
    const addAmount = buying.reduce((s, r) => s + r.price * r.qty, 0);
    const newAmount = Number(req.purchase_amount ?? 0) + addAmount;
    const { error } = await supabase.from("purchase_requests").update({
      purchased_at: req.purchased_at ?? new Date().toISOString(),
      purchase_amount: newAmount,
      status: allFull ? "comprado" : "parcial",
    }).eq("id", id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(allFull ? "Compra registrada (completa)" : "Compra parcial registrada");
    setUnitPrices({});
    setBuyQty({});
    qc.invalidateQueries({ queryKey: ["request", id] });
    qc.invalidateQueries({ queryKey: ["request_items", id] });
    qc.invalidateQueries({ queryKey: ["purchase_entries", id] });
    qc.invalidateQueries({ queryKey: ["history", id] });
  };

  // solicitação legada, sem request_items: chegada continua tudo-ou-nada
  const markArrivedLegacy = async () => {
    setBusy(true);
    const nowIso = new Date().toISOString();
    const { error } = await supabase.from("purchase_requests").update({
      arrived_at: nowIso,
      status: "finalizado",
      finalized_at: req.finalized_at ?? nowIso,
    }).eq("id", id);
    if (!error) {
      await supabase.from("notifications").insert({
        user_id: req.requester_id,
        request_id: id,
        title: "Material recebido",
        body: `O material da solicitação ${req.number} chegou.`,
      });
    }
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Chegada registrada e solicitante notificado");
    qc.invalidateQueries({ queryKey: ["request", id] });
    qc.invalidateQueries({ queryKey: ["history", id] });
  };

  // Registra a chegada (total ou parcial) por item, espelhando registerPartial:
  // cada lançamento vira um registro em arrival_entries e acumula em
  // request_items.arrived_quantity. Só recebe o que já foi comprado.
  const registerArrival = async () => {
    const activeReqItems = (reqItems ?? []).filter((it: any) => !it.rejected);
    if (activeReqItems.length === 0) return toast.error("Sem itens para receber (todos rejeitados)");
    const rows = activeReqItems.map((it: any) => {
      const purchased = Number(it.purchased_quantity ?? 0);
      const alreadyArrived = Number(it.arrived_quantity ?? 0);
      const remaining = Math.max(purchased - alreadyArrived, 0);
      const qtyRaw = arriveQty[it.id];
      const qtyTyped = qtyRaw !== undefined && String(qtyRaw).trim() !== "";
      const qty = qtyTyped ? parseFloat(String(qtyRaw).replace(",", ".")) : remaining;
      return { it, alreadyArrived, remaining, qty, qtyTyped };
    });
    const arriving = rows.filter((r) => !isNaN(r.qty) && r.qty > 0);
    if (arriving.length === 0) return toast.error("Informe a quantidade recebida de pelo menos um item");
    for (const r of arriving) {
      if (r.qty > r.remaining + 1e-9) {
        return toast.error(`"${r.it.description}": quantidade acima do comprado ainda não recebido (${r.remaining} ${r.it.unit})`);
      }
    }
    setBusy(true);
    const entries = arriving.map((r) => ({
      request_id: id, request_item_id: r.it.id, quantity: r.qty, created_by: user!.id,
    }));
    const { error: eErr } = await (supabase as any).from("arrival_entries").insert(entries);
    if (eErr) { setBusy(false); return toast.error(eErr.message); }
    for (const r of arriving) {
      const { error } = await supabase.from("request_items")
        .update({ arrived_quantity: r.alreadyArrived + r.qty } as any)
        .eq("id", r.it.id);
      if (error) { setBusy(false); return toast.error(error.message); }
    }
    const allArrived = rows.every((r) => {
      const arrivedNow = r.alreadyArrived + (arriving.find((a) => a.it.id === r.it.id)?.qty ?? 0);
      return arrivedNow >= Number(r.it.quantity) - 1e-9;
    });
    if (allArrived) {
      const nowIso = new Date().toISOString();
      const { error } = await supabase.from("purchase_requests").update({
        arrived_at: nowIso, status: "finalizado", finalized_at: req.finalized_at ?? nowIso,
      }).eq("id", id);
      if (error) { setBusy(false); return toast.error(error.message); }
      await supabase.from("notifications").insert({
        user_id: req.requester_id, request_id: id, title: "Material recebido",
        body: `O material da solicitação ${req.number} chegou.`,
      });
    }
    setBusy(false);
    toast.success(allArrived ? "Chegada registrada (completa)" : "Chegada parcial registrada");
    setArriveQty({});
    qc.invalidateQueries({ queryKey: ["request", id] });
    qc.invalidateQueries({ queryKey: ["request_items", id] });
    qc.invalidateQueries({ queryKey: ["arrival_entries", id] });
    qc.invalidateQueries({ queryKey: ["history", id] });
  };

  // Dá baixa de uma vez em todos os itens vinculados a um pedido de compra (a quantidade
  // vem travada do vínculo cadastrado — não é digitada aqui). Marca o pedido como chegado.
  const registerArrivalByPO = async (po: any) => {
    const items = (poItems ?? []).filter((pi: any) => pi.purchase_order_id === po.id);
    if (items.length === 0) return toast.error("Este pedido não tem itens vinculados");
    setBusy(true);
    const toArrive = items.map((pi: any) => {
      const it = reqItems?.find((r: any) => r.id === pi.request_item_id);
      const already = Number(it?.arrived_quantity ?? 0);
      const remaining = Math.max(Number(it?.purchased_quantity ?? 0) - already, 0);
      const qty = Math.min(Number(pi.quantity), remaining);
      return { it, already, qty };
    }).filter((r: any) => r.qty > 0);
    if (toArrive.length === 0) { setBusy(false); return toast.error("Os itens deste pedido já foram recebidos"); }
    const entries = toArrive.map((r: any) => ({
      request_id: id, request_item_id: r.it.id, quantity: r.qty, created_by: user!.id, purchase_order_id: po.id,
    }));
    const { error: eErr } = await (supabase as any).from("arrival_entries").insert(entries);
    if (eErr) { setBusy(false); return toast.error(eErr.message); }
    for (const r of toArrive) {
      const { error } = await supabase.from("request_items")
        .update({ arrived_quantity: r.already + r.qty } as any)
        .eq("id", r.it.id);
      if (error) { setBusy(false); return toast.error(error.message); }
    }
    const { error: poErr } = await (supabase as any).from("purchase_orders")
      .update({ arrived_at: new Date().toISOString() }).eq("id", po.id);
    if (poErr) { setBusy(false); return toast.error(poErr.message); }
    const allArrived = (reqItems ?? []).filter((it: any) => !it.rejected).every((it: any) => {
      const bump = toArrive.find((r: any) => r.it.id === it.id)?.qty ?? 0;
      return Number(it.arrived_quantity ?? 0) + bump >= Number(it.quantity) - 1e-9;
    });
    if (allArrived) {
      const nowIso = new Date().toISOString();
      const { error } = await supabase.from("purchase_requests").update({
        arrived_at: nowIso, status: "finalizado", finalized_at: req.finalized_at ?? nowIso,
      }).eq("id", id);
      if (error) { setBusy(false); return toast.error(error.message); }
      await supabase.from("notifications").insert({
        user_id: req.requester_id, request_id: id, title: "Material recebido",
        body: `O material da solicitação ${req.number} chegou.`,
      });
    }
    setBusy(false);
    toast.success(allArrived ? "Chegada registrada (completa)" : `Chegada do pedido ${po.number} registrada`);
    qc.invalidateQueries({ queryKey: ["request", id] });
    qc.invalidateQueries({ queryKey: ["request_items", id] });
    qc.invalidateQueries({ queryKey: ["arrival_entries", id] });
    qc.invalidateQueries({ queryKey: ["purchase_orders", id] });
    qc.invalidateQueries({ queryKey: ["history", id] });
  };

  const canDelete = roles.includes("admin") || (req.requester_id === user?.id && req.status === "pendente");
  const canEdit = canDelete;
  const canPurchase = (roles.includes("comprador") || roles.includes("admin")) && (req.status === "aprovado" || req.status === "parcial" || req.status === "comprado") && !req.arrived_at;
  // itens rejeitados na aprovação ficam fora dos cálculos de "tudo comprado"/"tudo chegado"
  const activeItems = (reqItems ?? []).filter((it: any) => !it.rejected);
  const itemsFullyPurchased = activeItems.length === 0 ||
    activeItems.every((it: any) => Number(it.purchased_quantity ?? 0) >= Number(it.quantity) - 1e-9);
  // o que está preenchido na tabela completaria a solicitação? (define o rótulo do botão)
  const purchaseWouldComplete = activeItems.length === 0 || activeItems.every((it: any) => {
    const already = Number(it.purchased_quantity ?? 0);
    const remaining = Math.max(Number(it.quantity) - already, 0);
    const priceRaw = unitPrices[it.id];
    const hasPrice = priceRaw !== undefined && String(priceRaw).trim() !== "" && !isNaN(parseFloat(String(priceRaw).replace(",", ".")));
    const qtyTyped = buyQty[it.id] !== undefined && String(buyQty[it.id]).trim() !== "";
    const qtyNow = qtyTyped ? (parseFloat(String(buyQty[it.id]).replace(",", ".")) || 0) : remaining;
    const buyingThis = hasPrice && qtyNow > 0; // só conta se tem preço
    return already + (buyingThis ? qtyNow : 0) >= Number(it.quantity) - 1e-9;
  });
  // existe algo já comprado que ainda não chegou? (define se mostra a seção de chegada por item)
  const anyArrivable = activeItems.some((it: any) =>
    Number(it.purchased_quantity ?? 0) > Number(it.arrived_quantity ?? 0) + 1e-9);
  // pedidos de compra com itens vinculados e ainda não recebidos (define a seção de chegada por pedido)
  const arrivablePOs = (purchaseOrders ?? []).filter((po: any) =>
    !po.arrived_at && (poItems ?? []).some((pi: any) => pi.purchase_order_id === po.id));
  // o que está preenchido na tabela completaria a chegada da solicitação? (define o rótulo do botão)
  const arrivalWouldComplete = activeItems.length === 0 || activeItems.every((it: any) => {
    const purchased = Number(it.purchased_quantity ?? 0);
    const alreadyArrived = Number(it.arrived_quantity ?? 0);
    const remaining = Math.max(purchased - alreadyArrived, 0);
    const qtyTyped = arriveQty[it.id] !== undefined && String(arriveQty[it.id]).trim() !== "";
    const qtyNow = qtyTyped ? (parseFloat(String(arriveQty[it.id]).replace(",", ".")) || 0) : remaining;
    return alreadyArrived + qtyNow >= Number(it.quantity) - 1e-9;
  });
  const canCancel = (req.requester_id === user?.id || roles.includes("admin")) &&
    (req.status === "pendente" || req.status === "aprovado" || req.status === "parcial" || req.status === "comprado");

  const cancelRequest = async () => {
    setBusy(true);
    const { error } = await supabase.from("purchase_requests").update({
      status: "cancelado",
    }).eq("id", id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Solicitação cancelada");
    qc.invalidateQueries({ queryKey: ["request", id] });
    qc.invalidateQueries({ queryKey: ["history", id] });
    qc.invalidateQueries({ queryKey: ["requests"] });
  };

  const remove = async () => {
    setBusy(true);
    // remove attachments from storage
    const { data: atts } = await supabase.from("request_attachments").select("path").eq("request_id", id);
    if (atts && atts.length > 0) {
      await supabase.storage.from("request-attachments").remove(atts.map((a) => a.path));
    }
    await supabase.from("request_attachments").delete().eq("request_id", id);
    await supabase.from("request_comments").delete().eq("request_id", id);
    await supabase.from("request_history").delete().eq("request_id", id);
    const { error } = await supabase.from("purchase_requests").delete().eq("id", id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Solicitação excluída");
    qc.invalidateQueries({ queryKey: ["requests"] });
    navigate({ to: "/requests" });
  };

  const addComment = async () => {
    if (!comment.trim()) return;
    const { error } = await supabase.from("request_comments").insert({
      request_id: id, user_id: user!.id, content: comment.trim(),
    });
    if (error) return toast.error(error.message);
    setComment("");
    qc.invalidateQueries({ queryKey: ["comments", id] });
  };

  // só comprador/admin preenche a previsão de entrega do fornecedor
  const saveExpectedDelivery = async () => {
    setBusy(true);
    const { error } = await (supabase as any).rpc("set_expected_delivery", {
      p_request_id: id,
      p_date: expectedDelivery || null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Previsão de entrega salva");
    qc.invalidateQueries({ queryKey: ["request", id] });
  };

  // quanto de um item ainda está livre pra vincular a este pedido (comprado - já vinculado a OUTROS pedidos)
  const poItemAvailability = (itemId: string) => {
    const it = reqItems?.find((r: any) => r.id === itemId);
    const purchased = Number(it?.purchased_quantity ?? 0);
    const linkedElsewhere = (poItems ?? [])
      .filter((pi: any) => pi.request_item_id === itemId && pi.purchase_order_id !== poDialogTarget?.id)
      .reduce((s: number, pi: any) => s + Number(pi.quantity), 0);
    return Math.max(purchased - linkedElsewhere, 0);
  };

  const openNewPoDialog = () => {
    setPoDialogTarget(null);
    setPoDialogNumber("");
    setPoDialogSel({});
    setPoDialogOpen(true);
  };

  const openEditPoDialog = (po: any) => {
    setPoDialogTarget(po);
    setPoDialogNumber(po.number);
    const sel: Record<string, { checked: boolean; qty: string }> = {};
    (poItems ?? []).filter((pi: any) => pi.purchase_order_id === po.id).forEach((pi: any) => {
      sel[pi.request_item_id] = { checked: true, qty: String(pi.quantity) };
    });
    setPoDialogSel(sel);
    setPoDialogOpen(true);
  };

  // comprador/admin cadastram um pedido de compra (uma solicitação pode gerar mais de um) e,
  // opcionalmente, vinculam quais itens (e quanto de cada) esse pedido cobre — pra dar baixa
  // automática na chegada em vez de lançar item a item.
  const savePoDialog = async () => {
    const number = poDialogNumber.trim();
    if (!number) return toast.error("Informe o número do pedido");
    const selectedItems = Object.entries(poDialogSel)
      .filter(([, v]) => v.checked)
      .map(([itemId, v]) => ({ itemId, qty: parseFloat(String(v.qty).replace(",", ".")) }));
    for (const s of selectedItems) {
      const it = reqItems?.find((r: any) => r.id === s.itemId);
      if (isNaN(s.qty) || s.qty <= 0) return toast.error(`Quantidade inválida em "${it?.description}"`);
      const avail = poItemAvailability(s.itemId);
      if (s.qty > avail + 1e-9) {
        return toast.error(`"${it?.description}": quantidade acima do disponível (${avail})`);
      }
    }
    setBusy(true);
    let poId = poDialogTarget?.id as string | undefined;
    if (poDialogTarget) {
      if (number !== poDialogTarget.number) {
        const { error } = await (supabase as any).from("purchase_orders").update({ number }).eq("id", poId);
        if (error) { setBusy(false); return toast.error(error.message); }
      }
      const { error: delErr } = await (supabase as any).from("purchase_order_items").delete().eq("purchase_order_id", poId);
      if (delErr) { setBusy(false); return toast.error(delErr.message); }
    } else {
      const { data, error } = await (supabase as any).from("purchase_orders")
        .insert({ request_id: id, number, created_by: user!.id }).select("id").single();
      if (error) { setBusy(false); return toast.error(error.message); }
      poId = data.id;
    }
    if (selectedItems.length > 0) {
      const rows = selectedItems.map((s) => ({ purchase_order_id: poId, request_item_id: s.itemId, quantity: s.qty }));
      const { error: insErr } = await (supabase as any).from("purchase_order_items").insert(rows);
      if (insErr) { setBusy(false); return toast.error(insErr.message); }
    }
    setBusy(false);
    setPoDialogOpen(false);
    toast.success(poDialogTarget ? "Pedido de compra atualizado" : "Pedido de compra adicionado");
    qc.invalidateQueries({ queryKey: ["purchase_orders", id] });
    qc.invalidateQueries({ queryKey: ["purchase_order_items", id] });
    qc.invalidateQueries({ queryKey: ["requests"] });
  };

  const removePurchaseOrder = async (poId: string) => {
    setBusy(true);
    const { error } = await (supabase as any).from("purchase_orders").delete().eq("id", poId);
    setBusy(false);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["purchase_orders", id] });
    qc.invalidateQueries({ queryKey: ["requests"] });
  };

  const attachInvoice = async (poId: string, file: File) => {
    setInvoiceBusy(poId);
    const path = `${user!.id}/po/${id}/${poId}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("request-attachments").upload(path, file);
    if (upErr) { setInvoiceBusy(null); return toast.error(upErr.message); }
    const { error } = await (supabase as any).from("purchase_orders").update({
      invoice_path: path, invoice_uploaded_by: user!.id, invoice_uploaded_at: new Date().toISOString(),
    }).eq("id", poId);
    setInvoiceBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Nota fiscal anexada");
    qc.invalidateQueries({ queryKey: ["purchase_orders", id] });
  };

  const downloadInvoice = async (path: string, number: string) => {
    const { data, error } = await supabase.storage
      .from("request-attachments")
      .createSignedUrl(path, 60, { download: `NF-${number}` });
    if (error || !data?.signedUrl) return toast.error("Erro ao baixar nota fiscal");
    window.open(data.signedUrl, "_blank");
  };

  const downloadAtt = async (path: string, filename: string) => {
    const { data, error } = await supabase.storage
      .from("request-attachments")
      .createSignedUrl(path, 60, { download: filename });
    if (error || !data?.signedUrl) return toast.error("Erro ao baixar anexo");
    window.open(data.signedUrl, "_blank");
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild><Link to="/requests"><ArrowLeft className="mr-2 h-4 w-4" />Voltar</Link></Button>
        <div className="flex gap-2">
          {canEdit ? (
            <Button variant="outline" size="sm" asChild>
              <Link to="/requests/$id/edit" params={{ id }}><Pencil className="mr-2 h-4 w-4" />Editar</Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" asChild>
              <Link to="/requests/$id/edit" params={{ id }}><Paperclip className="mr-2 h-4 w-4" />Anexar foto</Link>
            </Button>
          )}
          {canCancel && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={busy}>
                  <Ban className="mr-2 h-4 w-4" />Cancelar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancelar solicitação?</AlertDialogTitle>
                  <AlertDialogDescription>
                    A solicitação {req.number} será marcada como cancelada. Você pode reabri-la editando o status posteriormente.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Voltar</AlertDialogCancel>
                  <AlertDialogAction onClick={cancelRequest}>Confirmar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {canDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={busy}>
                  <Trash2 className="mr-2 h-4 w-4" />Excluir
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir solicitação?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta ação não pode ser desfeita. A solicitação {req.number}, seus comentários, anexos e histórico serão removidos.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={remove}>Excluir</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-mono text-sm text-muted-foreground">{req.number}</div>
          <h1 className="mt-1 text-2xl font-bold">{req.description.slice(0, 80)}</h1>
        </div>
        <div className="flex items-center gap-2">
          {(req as any).urgente && <UrgenteBadge />}
          <PriorityBadge priority={req.priority} />
          <StatusBadge status={req.status} />
          {evaluation && (
            <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/15 px-2.5 py-0.5 text-xs font-medium text-success">
              <ClipboardCheck className="h-3.5 w-3.5" /> Avaliada
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2 space-y-5">
          {reqItems && reqItems.length > 0 ? (() => {
            const nonRejected = reqItems.filter((it: any) => !it.rejected);
            const fullyPurchased = nonRejected.length === 0 || nonRejected.every((it: any) => Number(it.purchased_quantity ?? 0) >= Number(it.quantity) - 1e-9);
            const editable = canPurchase && !fullyPurchased;
            const anyPartial = nonRejected.some((it: any) => Number(it.purchased_quantity ?? 0) > 0);
            const rowsTotals = reqItems.map((it: any) => {
              const fullQty = Number(it.quantity);
              const already = Number(it.purchased_quantity ?? 0);
              const remaining = Math.max(fullQty - already, 0);
              // cada linha só entra em modo de edição se ELA MESMA ainda tiver saldo a comprar —
              // não basta o pedido como um todo estar em aberto (item já comprado não pode "sumir" o preço)
              // itens rejeitados na aprovação nunca ficam editáveis
              const rowEditable = canPurchase && remaining > 0 && !it.rejected;
              // em edição, só conta o preço digitado agora; fora de edição, o preço já registrado
              const raw = rowEditable ? (unitPrices[it.id] ?? "") : (it.unit_price != null ? String(it.unit_price) : "");
              const parsedPrice = parseFloat(String(raw).replace(",", "."));
              const price = isNaN(parsedPrice) ? null : parsedPrice;
              const qtyNowRaw = buyQty[it.id] ?? (remaining > 0 ? String(remaining) : "");
              const parsedQty = parseFloat(String(qtyNowRaw).replace(",", "."));
              const qtyNow = isNaN(parsedQty) ? 0 : parsedQty;
              // valor da linha: o que está comprando agora (modo edição) ou o que já foi comprado.
              // sem preço digitado, a linha não entra no total desta compra.
              const refQty = rowEditable ? qtyNow : already;
              const total = price != null ? price * refQty : null;
              const avg = it.items?.avg_price != null ? Number(it.items.avg_price) : null;
              const save = price != null && avg != null && avg > 0 ? (avg - price) * refQty : null;
              const arrived = Number(it.arrived_quantity ?? 0);
              const arrivedRemaining = Math.max(already - arrived, 0);
              const rowArrivable = canPurchase && arrivedRemaining > 0 && !it.rejected;
              return { it, fullQty, already, remaining, price, qtyNow, total, avg, save, rowEditable, arrived, arrivedRemaining, rowArrivable };
            });
            const grandTotal = rowsTotals.reduce((s, r) => s + (r.total ?? 0), 0);
            const grandSave = rowsTotals.reduce((s, r) => s + (r.save ?? 0), 0);
            const hasSavings = rowsTotals.some((r) => r.save != null);
            return (
              <Section title={`Itens (${reqItems.length})`}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase text-muted-foreground">
                      <tr className="border-b">
                        <th className="py-2 text-left font-medium">#</th>
                        <th className="py-2 text-left font-medium">Código</th>
                        <th className="py-2 text-left font-medium">Descrição</th>
                        <th className="py-2 text-right font-medium">Qtd</th>
                        <th className="py-2 text-left font-medium">Un</th>
                        <th className="py-2 text-right font-medium">Comprado</th>
                        <th className="py-2 text-right font-medium">Chegada</th>
                        <th className="py-2 text-right font-medium">{editable ? "Comprar agora" : "Preço un."}</th>
                        <th className="py-2 text-right font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rowsTotals.map(({ it, fullQty, already, remaining, price, total, avg, save, rowEditable, arrived, arrivedRemaining, rowArrivable }, idx) => (
                        <tr key={it.id} className={`border-b last:border-0${it.rejected ? " opacity-60" : ""}`}>
                          <td className="py-2 text-muted-foreground">{idx + 1}</td>
                          <td className="py-2 font-mono text-xs">{it.items?.code ?? "—"}</td>
                          <td className="py-2">
                            {it.description}
                            {it.rejected && (
                              <div className="mt-0.5 text-xs text-destructive">Rejeitado{it.rejection_reason ? `: ${it.rejection_reason}` : ""}</div>
                            )}
                          </td>
                          <td className="py-2 text-right">{fullQty.toLocaleString("pt-BR")}</td>
                          <td className="py-2">{it.unit}</td>
                          <td className="py-2 text-right">
                            <span className={remaining <= 1e-9 ? "text-success font-medium" : ""}>
                              {already.toLocaleString("pt-BR")}/{fullQty.toLocaleString("pt-BR")}
                            </span>
                            {rowEditable && (
                              <div className="text-xs text-muted-foreground">faltam {remaining.toLocaleString("pt-BR")}</div>
                            )}
                          </td>
                          <td className="py-2 text-right">
                            <span className={arrived >= fullQty - 1e-9 ? "text-success font-medium" : ""}>
                              {arrived.toLocaleString("pt-BR")}/{fullQty.toLocaleString("pt-BR")}
                            </span>
                            {rowArrivable && (
                              <div className="mt-1">
                                <Input
                                  type="number" step="0.01" min="0" max={arrivedRemaining} placeholder={`Qtd (máx ${arrivedRemaining})`}
                                  value={arriveQty[it.id] ?? String(arrivedRemaining)}
                                  onChange={(e) => setArriveQty((p) => ({ ...p, [it.id]: e.target.value }))}
                                  className="h-8 w-28 text-right"
                                />
                              </div>
                            )}
                          </td>
                          <td className="py-2 text-right">
                            {rowEditable ? (
                              <div className="flex flex-col items-end gap-1">
                                <Input
                                  type="number" step="0.01" min="0" max={remaining} placeholder={`Qtd (máx ${remaining})`}
                                  value={buyQty[it.id] ?? String(remaining)}
                                  onChange={(e) => setBuyQty((p) => ({ ...p, [it.id]: e.target.value }))}
                                  className="h-8 w-28 text-right"
                                />
                                <Input
                                  type="number" step="0.01" min="0" placeholder="Preço un."
                                  value={unitPrices[it.id] ?? ""}
                                  onChange={(e) => setUnitPrices((p) => ({ ...p, [it.id]: e.target.value }))}
                                  className="h-8 w-28 text-right"
                                />
                              </div>
                            ) : (
                              price != null ? `R$ ${price.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"
                            )}
                            {avg != null && avg > 0 && (
                              <div className="text-xs text-muted-foreground">
                                Média: R$ {avg.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                              </div>
                            )}
                            {save != null && save !== 0 && !rowEditable && (
                              <div className={`text-xs ${save > 0 ? "text-success" : "text-destructive"}`}>
                                {save > 0 ? "Economia" : "Acima"}: R$ {Math.abs(save).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                              </div>
                            )}
                          </td>
                          <td className="py-2 text-right font-medium">
                            {total != null ? `R$ ${total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t">
                        <td colSpan={8} className="py-2 text-right text-sm font-semibold">{editable ? "Total desta compra" : "Total comprado"}</td>
                        <td className="py-2 text-right text-sm font-bold">
                          R$ {grandTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                      {!editable && anyPartial && req.purchase_amount != null && (
                        <tr>
                          <td colSpan={8} className="py-1 text-right text-xs text-muted-foreground">Valor total já registrado</td>
                          <td className="py-1 text-right text-xs font-semibold">
                            R$ {Number(req.purchase_amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      )}
                      {hasSavings && (
                        <tr>
                          <td colSpan={8} className="py-1 text-right text-xs text-muted-foreground">Economia {editable ? "desta compra" : "total"} (vs. preço médio)</td>
                          <td className={`py-1 text-right text-xs font-semibold ${grandSave >= 0 ? "text-success" : "text-destructive"}`}>
                            R$ {grandSave.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      )}
                    </tfoot>
                  </table>
                </div>
              </Section>
            );
          })() : (
            <>
              <Section title="Descrição"><p className="whitespace-pre-wrap text-sm">{req.description}</p></Section>
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Quantidade" value={`${req.quantity} ${req.unit}`} />
              </div>
            </>
          )}
          <Section title="Justificativa"><p className="whitespace-pre-wrap text-sm">{req.justification}</p></Section>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Necessário em" value={(() => { const [y,m,d] = String(req.needed_by).split("-").map(Number); return format(new Date(y, m-1, d), "dd/MM/yyyy"); })()} />
            <Field label="Centro de custo" value={req.cost_centers ? `${req.cost_centers.code} — ${req.cost_centers.name}` : "—"} />
            <Field label="Valor da compra" value={req.purchase_amount != null ? `R$ ${Number(req.purchase_amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"} />
          </div>
          {req.decision_note && (
            <Section title="Nota da decisão"><p className="whitespace-pre-wrap text-sm">{req.decision_note}</p></Section>
          )}
        </Card>

        <Card className="p-6 space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Detalhes</h3>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Pedidos de compra</Label>
            {purchaseOrders && purchaseOrders.length > 0 ? (
              <div className="space-y-1.5">
                {purchaseOrders.map((po: any) => {
                  const itemCount = (poItems ?? []).filter((pi: any) => pi.purchase_order_id === po.id).length;
                  return (
                    <div key={po.id} className="space-y-1 rounded-md border px-2 py-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm">{po.number}</span>
                          {po.arrived_at && (
                            <span className="inline-flex items-center gap-1 text-xs text-success">
                              <Truck className="h-3 w-3" /> Chegou
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {po.invoice_path ? (
                            <Button size="sm" variant="ghost" className="h-7" onClick={() => downloadInvoice(po.invoice_path, po.number)}>
                              <Download className="mr-1 h-3.5 w-3.5" /> Ver NF
                            </Button>
                          ) : canPurchase ? (
                            <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted">
                              <Paperclip className="h-3.5 w-3.5" />
                              {invoiceBusy === po.id ? "Enviando..." : "Anexar NF"}
                              <input
                                type="file"
                                className="hidden"
                                disabled={invoiceBusy === po.id}
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) attachInvoice(po.id, f);
                                  e.target.value = "";
                                }}
                              />
                            </label>
                          ) : (
                            <span className="text-xs text-muted-foreground">Sem NF</span>
                          )}
                          {canPurchase && (
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removePurchaseOrder(po.id)}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </div>
                      {canPurchase && !po.arrived_at ? (
                        <button type="button" onClick={() => openEditPoDialog(po)} className="text-xs text-primary hover:underline">
                          {itemCount > 0 ? `${itemCount} item${itemCount > 1 ? "ns" : ""} vinculado${itemCount > 1 ? "s" : ""}` : "Vincular itens"}
                        </button>
                      ) : itemCount > 0 ? (
                        <span className="text-xs text-muted-foreground">{itemCount} item{itemCount > 1 ? "ns" : ""} vinculado{itemCount > 1 ? "s" : ""}</span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              !canPurchase && <p className="text-sm text-muted-foreground">—</p>
            )}
            {canPurchase && (
              <Button size="sm" variant="outline" onClick={openNewPoDialog}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar pedido de compra
              </Button>
            )}
          </div>
          <Field label="Setor" value={req.sectors ? `${req.sectors.code} — ${req.sectors.name}` : "—"} />
          <Field label="Solicitante" value={req.profiles?.full_name ?? req.profiles?.email ?? "—"} />
          <Field label="Data da solicitação" value={format(new Date(req.created_at), "dd/MM/yyyy HH:mm")} />
          <Field label="Data da aprovação" value={req.decided_at ? format(new Date(req.decided_at), "dd/MM/yyyy HH:mm") : "—"} />
          <Field label="Data da compra" value={req.purchased_at ? format(new Date(req.purchased_at), "dd/MM/yyyy HH:mm") : "—"} />
          {canPurchase ? (
            <div className="space-y-1.5">
              <Label htmlFor="expected_delivery" className="text-xs text-muted-foreground">Previsão de entrega do fornecedor</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="expected_delivery"
                  type="date"
                  value={expectedDelivery}
                  onChange={(e) => setExpectedDelivery(e.target.value)}
                  className="h-8"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={saveExpectedDelivery}
                  disabled={busy || expectedDelivery === ((req as any).expected_delivery_date ?? "")}
                >
                  Salvar
                </Button>
              </div>
            </div>
          ) : (
            <Field
              label="Previsão de entrega do fornecedor"
              value={(req as any).expected_delivery_date ? format(new Date(`${(req as any).expected_delivery_date}T00:00:00`), "dd/MM/yyyy") : "—"}
            />
          )}
          <Field label="Data de chegada" value={req.arrived_at ? format(new Date(req.arrived_at), "dd/MM/yyyy HH:mm") : "—"} />
        </Card>
      </div>

      {(canDecide || canFinalize || canPurchase) && (
        <Card className="p-6 space-y-4 border-primary/30">
          <h3 className="text-sm font-semibold">Ações</h3>
          {canDecide && (
            <>
              {reqItems && reqItems.length > 0 && (
                <div className="space-y-3 rounded-md border p-3">
                  <p className="text-xs font-semibold text-muted-foreground">
                    Marque os itens que devem ser rejeitados (o restante segue para aprovação)
                  </p>
                  {reqItems.map((it: any) => {
                    const rj = itemRejections[it.id] ?? { rejected: false, reason: "" };
                    return (
                      <div key={it.id} className="space-y-1.5 border-b pb-2 last:border-0">
                        <label className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={rj.rejected}
                            onCheckedChange={(v) => setItemRejections((p) => ({ ...p, [it.id]: { rejected: !!v, reason: p[it.id]?.reason ?? "" } }))}
                          />
                          <span className={rj.rejected ? "text-muted-foreground line-through" : ""}>{it.description}</span>
                          <span className="text-xs text-muted-foreground">({it.quantity} {it.unit})</span>
                        </label>
                        {rj.rejected && (
                          <Textarea
                            placeholder="Motivo da rejeição *"
                            rows={2}
                            value={rj.reason}
                            onChange={(e) => setItemRejections((p) => ({ ...p, [it.id]: { rejected: true, reason: e.target.value } }))}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <Textarea placeholder="Nota (opcional)" value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} rows={2} />
              <div className="flex gap-2">
                <Button onClick={() => decide("aprovado")} disabled={busy} className="bg-success text-success-foreground hover:bg-success/90">
                  <CheckCircle2 className="mr-2 h-4 w-4" />Aprovar
                </Button>
                <Button onClick={() => decide("negado")} disabled={busy} variant="destructive">
                  <XCircle className="mr-2 h-4 w-4" />Negar
                </Button>
              </div>
            </>
          )}
          {canRevert && (
            <Dialog open={revertDialogOpen} onOpenChange={setRevertDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" disabled={busy}>
                  <XCircle className="mr-2 h-4 w-4" />Reverter aprovação
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Reverter aprovação</DialogTitle></DialogHeader>
                <p className="text-sm text-muted-foreground">
                  A solicitação volta para "pendente" e as rejeições de item são zeradas — o aprovador decide tudo de novo.
                </p>
                <Textarea placeholder="Motivo da reversão *" value={revertReason} onChange={(e) => setRevertReason(e.target.value)} rows={3} />
                <DialogFooter>
                  <Button onClick={revertApproval} disabled={busy} variant="destructive">Confirmar reversão</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          {canPurchase && (
            <div className="space-y-3">
              {reqItems && reqItems.length > 0 ? (
                !itemsFullyPurchased && (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Informe a quantidade comprada e o preço de cada item na tabela acima. Você pode registrar parte agora e o restante depois — a solicitação fica como <span className="font-medium">Parcial</span> até comprar tudo.
                    </p>
                    <Button onClick={registerPartial} disabled={busy} variant="outline">
                      <ShoppingCart className="mr-2 h-4 w-4" />{purchaseWouldComplete ? "Registrar compra" : "Registrar compra parcial"}
                    </Button>
                  </div>
                )
              ) : (
                !req.purchased_at && (
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="purchase_amount">Valor da compra (R$) *</Label>
                      <Input
                        id="purchase_amount"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0,00"
                        value={purchaseAmount}
                        onChange={(e) => setPurchaseAmount(e.target.value)}
                        className="w-48"
                      />
                    </div>
                    <Button onClick={markPurchased} disabled={busy} variant="outline">
                      <ShoppingCart className="mr-2 h-4 w-4" />Registrar compra
                    </Button>
                  </div>
                )
              )}
              {reqItems && reqItems.length > 0 ? (
                anyArrivable && (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Informe a quantidade recebida de cada item na tabela acima (coluna Chegada). Você pode registrar parte agora e o restante depois — a solicitação só finaliza quando todos os itens chegarem.
                    </p>
                    <Button onClick={registerArrival} disabled={busy} variant="outline">
                      <Truck className="mr-2 h-4 w-4" />{arrivalWouldComplete ? "Registrar chegada" : "Registrar chegada parcial"}
                    </Button>
                  </div>
                )
              ) : null}
              {arrivablePOs.length > 0 && (
                <div className="space-y-2 border-t pt-3">
                  <p className="text-sm text-muted-foreground">
                    Ou registre a chegada de um pedido de compra inteiro (dá baixa em todos os itens vinculados a ele de uma vez):
                  </p>
                  <div className="space-y-1.5">
                    {arrivablePOs.map((po: any) => {
                      const count = (poItems ?? []).filter((pi: any) => pi.purchase_order_id === po.id).length;
                      return (
                        <div key={po.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                          <div>
                            <span className="font-mono text-sm">{po.number}</span>
                            <span className="ml-2 text-xs text-muted-foreground">{count} item{count > 1 ? "ns" : ""}</span>
                          </div>
                          <Button size="sm" variant="outline" onClick={() => registerArrivalByPO(po)} disabled={busy}>
                            <Truck className="mr-2 h-3.5 w-3.5" />Registrar chegada
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {reqItems && reqItems.length === 0 && (
                !req.arrived_at && (
                  <Button onClick={markArrivedLegacy} disabled={busy} variant="outline">
                    <Truck className="mr-2 h-4 w-4" />Registrar chegada do material
                  </Button>
                )
              )}
            </div>
          )}
          {canFinalize && !canPurchase && (
            <Button onClick={finalize} disabled={busy} variant="outline">
              <PackageCheck className="mr-2 h-4 w-4" />Marcar como finalizada
            </Button>
          )}
        </Card>
      )}

      {purchaseEntries && purchaseEntries.length > 0 && (
        <Card className="p-6 space-y-3">
          <h3 className="text-sm font-semibold">Compras registradas</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 text-left font-medium">Data</th>
                  <th className="py-2 text-left font-medium">Item</th>
                  <th className="py-2 text-right font-medium">Qtd</th>
                  <th className="py-2 text-right font-medium">Preço un.</th>
                  <th className="py-2 text-right font-medium">Total</th>
                  <th className="py-2 text-left font-medium">Comprador</th>
                </tr>
              </thead>
              <tbody>
                {purchaseEntries.map((e: any) => (
                  <tr key={e.id} className="border-b last:border-0">
                    <td className="py-2 text-muted-foreground">{format(new Date(e.created_at), "dd/MM/yyyy HH:mm")}</td>
                    <td className="py-2">{e.request_items?.description ?? "—"}</td>
                    <td className="py-2 text-right">{Number(e.quantity).toLocaleString("pt-BR")} {e.request_items?.unit ?? ""}</td>
                    <td className="py-2 text-right">R$ {Number(e.unit_price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                    <td className="py-2 text-right font-medium">R$ {(Number(e.unit_price) * Number(e.quantity)).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                    <td className="py-2 text-muted-foreground">{e.profiles?.full_name ?? e.profiles?.email ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {(evaluation || (req.arrived_at && (roles.includes("comprador") || roles.includes("admin")))) && (
        <Card className="p-6 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <ClipboardCheck className="h-4 w-4 text-primary" /> Avaliação do fornecedor
            </h3>
            {evaluation && (
              <Button asChild size="sm" variant="outline">
                <Link to="/evaluations/$id" params={{ id: evaluation.id }}>Ver avaliação <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
              </Button>
            )}
          </div>
          {evaluation ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-xs text-muted-foreground">{evaluation.number}</span>
                <ClassificationBadge classification={evaluation.classification} />
                <span className="text-sm font-semibold">{evaluation.total_points} <span className="font-normal text-muted-foreground">/ 100</span></span>
                {evaluation.approved
                  ? <span className="inline-flex items-center gap-1 text-success text-xs"><CheckCircle2 className="h-3.5 w-3.5" />Aprovado</span>
                  : <span className="inline-flex items-center gap-1 text-destructive text-xs"><XCircle className="h-3.5 w-3.5" />Não aprovado</span>}
              </div>
              <p className="text-xs text-muted-foreground">Avaliado por {evaluation.evaluator_name}{evaluation.created_at ? ` em ${format(new Date(evaluation.created_at), "dd/MM/yyyy")}` : ""}.</p>
              {evaluation.observation && <p className="whitespace-pre-wrap text-sm">{evaluation.observation}</p>}
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">Material recebido. Avalie o fornecedor no ato da entrega (Procedimento P-04).</p>
              <Button asChild size="sm">
                <Link to="/evaluations/new" search={{ request: id }}>Avaliar fornecedor <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
              </Button>
            </div>
          )}
        </Card>
      )}

      {attachments && attachments.length > 0 && (
        <Card className="p-6 space-y-3">
          <h3 className="text-sm font-semibold">Anexos</h3>
          <ul className="space-y-2">
            {attachments.map((a) => (
              <li key={a.id} className="flex items-center justify-between rounded bg-muted/40 px-3 py-2 text-sm">
                <span className="truncate">{a.filename}</span>
                <Button size="sm" variant="ghost" onClick={() => downloadAtt(a.path, a.filename)}>
                  <Download className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-6 space-y-4">
        <h3 className="text-sm font-semibold">Comentários internos</h3>
        <div className="space-y-3">
          {comments?.length === 0 && <p className="text-sm text-muted-foreground">Sem comentários ainda</p>}
          {comments?.map((c: any) => (
            <div key={c.id} className="rounded-lg border bg-muted/30 p-3">
              <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{c.profiles?.full_name ?? c.profiles?.email}</span>
                <span>{format(new Date(c.created_at), "dd/MM/yyyy HH:mm")}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm">{c.content}</p>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Textarea placeholder="Escreva um comentário..." value={comment} onChange={(e) => setComment(e.target.value)} rows={2} />
          <Button onClick={addComment}><Send className="h-4 w-4" /></Button>
        </div>
      </Card>

      <Card className="p-6 space-y-3">
        <h3 className="text-sm font-semibold">Histórico</h3>
        <ul className="space-y-2 text-sm">
          {history?.map((h: any) => (
            <li key={h.id} className="flex items-center gap-3 text-muted-foreground">
              <span className="text-xs">{format(new Date(h.created_at), "dd/MM/yyyy HH:mm")}</span>
              <span className="font-medium text-foreground">{h.profiles?.full_name ?? h.profiles?.email ?? "Sistema"}</span>
              <span>
                {h.action === "created" ? "criou a solicitação" :
                  `mudou status de ${h.from_status ?? "—"} para ${h.to_status}`}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Dialog open={poDialogOpen} onOpenChange={setPoDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{poDialogTarget ? `Editar pedido ${poDialogTarget.number}` : "Novo pedido de compra"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Número do pedido *</Label>
              <Input value={poDialogNumber} onChange={(e) => setPoDialogNumber(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Itens deste pedido (opcional — vincule pra dar baixa automática na chegada)
              </Label>
              <div className="space-y-2">
                {(reqItems ?? []).map((it: any) => {
                  const avail = poItemAvailability(it.id);
                  const sel = poDialogSel[it.id] ?? { checked: false, qty: String(avail) };
                  if (avail <= 0 && !sel.checked) return null;
                  return (
                    <div key={it.id} className="flex items-center gap-2 rounded-md border px-2 py-1.5">
                      <Checkbox
                        checked={sel.checked}
                        onCheckedChange={(v) =>
                          setPoDialogSel((p) => ({ ...p, [it.id]: { checked: !!v, qty: p[it.id]?.qty ?? String(avail) } }))
                        }
                      />
                      <span className="flex-1 text-sm">{it.description}</span>
                      <span className="text-xs text-muted-foreground">disp. {avail.toLocaleString("pt-BR")} {it.unit}</span>
                      <Input
                        type="number" step="0.01" min="0" max={avail}
                        disabled={!sel.checked}
                        value={sel.qty}
                        onChange={(e) =>
                          setPoDialogSel((p) => ({ ...p, [it.id]: { checked: p[it.id]?.checked ?? false, qty: e.target.value } }))
                        }
                        className="h-8 w-24 text-right"
                      />
                    </div>
                  );
                })}
                {(reqItems ?? []).every((it: any) => poItemAvailability(it.id) <= 0 && !poDialogSel[it.id]?.checked) && (
                  <p className="text-xs text-muted-foreground">Nenhum item com saldo comprado disponível pra vincular.</p>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPoDialogOpen(false)}>Cancelar</Button>
            <Button onClick={savePoDialog} disabled={busy || !poDialogNumber.trim()}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}
