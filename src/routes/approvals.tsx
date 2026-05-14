import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, PriorityBadge } from "@/components/StatusBadge";
import { useAuth } from "@/lib/auth";
import { format } from "date-fns";
import { CheckSquare, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/approvals")({
  component: () => <AppLayout><Approvals /></AppLayout>,
});

function Approvals() {
  const { user, roles } = useAuth();
  const isAdmin = roles.includes("admin");

  const { data, isLoading } = useQuery({
    queryKey: ["approvals", user?.id, isAdmin],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase
        .from("purchase_requests")
        .select("*, sectors!inner(code,name,approver_id), cost_centers(code,name)")
        .eq("status", "pendente")
        .order("created_at", { ascending: false });
      if (!isAdmin) q = q.eq("sectors.approver_id", user!.id);
      const { data: reqs } = await q;
      if (!reqs) return [];
      const ids = Array.from(new Set(reqs.map((r) => r.requester_id)));
      const { data: profs } = await supabase.from("profiles").select("id,full_name,email").in("id", ids);
      const map = new Map((profs ?? []).map((p) => [p.id, p]));
      return reqs.map((r) => ({ ...r, profiles: map.get(r.requester_id) }));
    },
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <CheckSquare className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Aprovações pendentes</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin ? "Todas as solicitações pendentes" : "Solicitações dos setores em que você é aprovador"}
          </p>
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}

      {!isLoading && (data?.length ?? 0) === 0 && (
        <Card className="p-12 text-center text-muted-foreground">
          Nenhuma solicitação aguardando sua aprovação.
        </Card>
      )}

      <div className="grid gap-3">
        {data?.map((r: any) => (
          <Card key={r.id} className="p-4 hover:border-primary/40 transition-colors">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-mono">{r.number}</span>
                  <span>•</span>
                  <span>{r.sectors?.name}</span>
                  <span>•</span>
                  <span>{format(new Date(r.created_at), "dd/MM/yyyy")}</span>
                </div>
                <h3 className="mt-1 font-medium truncate">{r.description}</h3>
                <div className="mt-1 text-xs text-muted-foreground">
                  Solicitante: {r.profiles?.full_name ?? r.profiles?.email ?? "—"} · Qtd: {r.quantity} {r.unit} · Necessário em {format(new Date(r.needed_by), "dd/MM/yyyy")}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="flex gap-2">
                  <PriorityBadge priority={r.priority} />
                  <StatusBadge status={r.status} />
                </div>
                <Button asChild size="sm">
                  <Link to="/requests/$id" params={{ id: r.id }}>
                    Analisar <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
