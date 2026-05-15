import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type Role = "admin" | "aprovador" | "solicitante" | "comprador";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  loading: boolean;
  rolesLoading: boolean;
  roles: Role[];
  signOut: () => Promise<void>;
  refreshRoles: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [roles, setRoles] = useState<Role[]>([]);

  const loadRoles = async (userId: string) => {
    setRolesLoading(true);
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    setRoles((data?.map((r) => r.role) ?? []) as Role[]);
    setRolesLoading(false);
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s?.user) {
        setTimeout(() => loadRoles(s.user.id), 0);
      } else {
        setRoles([]);
        setRolesLoading(false);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) loadRoles(data.session.user.id);
      else setRolesLoading(false);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <Ctx.Provider
      value={{
        user: session?.user ?? null,
        session,
        loading,
        rolesLoading,
        roles,
        signOut: async () => { await supabase.auth.signOut(); },
        refreshRoles: async () => { if (session?.user) await loadRoles(session.user.id); },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
