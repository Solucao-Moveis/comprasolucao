import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type Role = "admin" | "aprovador" | "solicitante" | "comprador" | "visualizador";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  loading: boolean;
  rolesLoading: boolean;
  roles: Role[];
  signOut: () => Promise<void>;
  refreshRoles: () => Promise<void>;
}

// SMERP SSO: se o ERP abriu este app com a sessão no hash (#smerp_sso&at=&rt=),
// adota essa sessão e limpa a URL — assim a pessoa entra sem logar de novo.
async function consumeSmerpSso() {
  if (typeof window === "undefined") return;
  const hash = window.location.hash;
  if (!hash || hash.indexOf("smerp_sso") === -1) return;
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const access_token = params.get("at");
  const refresh_token = params.get("rt");
  if (access_token && refresh_token) {
    try {
      await supabase.auth.setSession({ access_token, refresh_token });
    } catch (e) {
      console.error("[SMERP SSO]", e);
    }
  }
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
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
    (async () => {
      await consumeSmerpSso();
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      if (data.session?.user) loadRoles(data.session.user.id);
      else setRolesLoading(false);
      setLoading(false);
    })();
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
