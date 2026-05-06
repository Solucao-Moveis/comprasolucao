import { createFileRoute, Navigate } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Settings, Users, Building2 } from "lucide-react";

export const Route = createFileRoute("/admin")({
  component: () => <AppLayout><AdminPage /></AppLayout>,
});

const ROLES = ["solicitante", "aprovador", "comprador", "admin"] as const;

function AdminPage() {
  const { roles, loading } = useAuth();
  const qc = useQueryClient();
  const isAdmin = roles.includes("admin");

  const { data: sectors } = useQuery({
    enabled: isAdmin,
    queryKey: ["admin-sectors"],
    queryFn: async () => (await supabase.from("sectors").select("*").order("name")).data ?? [],
  });
  const { data: profiles } = useQuery({
    enabled: isAdmin,
    queryKey: ["admin-profiles"],
    queryFn: async () => (await supabase.from("profiles").select("id,email,full_name").order("email")).data ?? [],
  });
  const { data: userRoles } = useQuery({
    enabled: isAdmin,
    queryKey: ["admin-user-roles"],
    queryFn: async () => (await supabase.from("user_roles").select("user_id,role")).data ?? [],
  });

  if (loading) return <div className="text-muted-foreground">Carregando...</div>;
  if (!isAdmin) return <Navigate to="/dashboard" />;

  const setApprover = async (sectorId: string, approverId: string | null) => {
    const { error } = await supabase.from("sectors").update({ approver_id: approverId }).eq("id", sectorId);
    if (error) return toast.error(error.message);
    toast.success("Aprovador atualizado");
    qc.invalidateQueries({ queryKey: ["admin-sectors"] });
  };

  const toggleRole = async (userId: string, role: string, has: boolean) => {
    if (has) {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role as any);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: role as any });
      if (error) return toast.error(error.message);
    }
    qc.invalidateQueries({ queryKey: ["admin-user-roles"] });
  };

  const rolesByUser = new Map<string, Set<string>>();
  (userRoles ?? []).forEach((r) => {
    if (!rolesByUser.has(r.user_id)) rolesByUser.set(r.user_id, new Set());
    rolesByUser.get(r.user_id)!.add(r.role);
  });
  const profileLabel = (id: string | null) => {
    if (!id) return "—";
    const p = profiles?.find((x) => x.id === id);
    return p ? (p.full_name ?? p.email) : id;
  };
  const approvers = (profiles ?? []).filter((p) => rolesByUser.get(p.id)?.has("aprovador") || rolesByUser.get(p.id)?.has("admin"));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Settings className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Administração</h1>
          <p className="text-sm text-muted-foreground">Gerencie aprovadores por setor e papéis de usuários</p>
        </div>
      </div>

      <Card className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-semibold">Aprovadores por setor</h2>
        </div>
        <div className="space-y-2">
          {sectors?.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <div className="font-medium">{s.name}</div>
                <div className="text-xs text-muted-foreground">Atual: {profileLabel(s.approver_id)}</div>
              </div>
              <Select
                value={s.approver_id ?? "none"}
                onValueChange={(v) => setApprover(s.id, v === "none" ? null : v)}
              >
                <SelectTrigger className="w-[280px]"><SelectValue placeholder="Selecionar aprovador" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Sem aprovador —</SelectItem>
                  {approvers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name ?? p.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
        {approvers.length === 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            Nenhum usuário com papel "aprovador" ainda. Atribua o papel abaixo antes de definir o aprovador do setor.
          </p>
        )}
      </Card>

      <Card className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-semibold">Papéis dos usuários</h2>
        </div>
        <div className="space-y-2">
          {profiles?.map((p) => {
            const userRoleSet = rolesByUser.get(p.id) ?? new Set();
            return (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{p.full_name ?? p.email}</div>
                  <div className="text-xs text-muted-foreground truncate">{p.email}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {ROLES.map((r) => {
                    const has = userRoleSet.has(r);
                    return (
                      <Badge
                        key={r}
                        variant={has ? "default" : "outline"}
                        className="cursor-pointer select-none"
                        onClick={() => toggleRole(p.id, r, has)}
                      >
                        {r}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Clique em um papel para adicionar/remover.</p>
      </Card>
    </div>
  );
}
