import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, FileText, Plus, LogOut, CheckSquare, Settings, Package, Home, ClipboardCheck } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { NotificationsBell } from "@/components/NotificationsBell";
import logo from "@/assets/logo.png";

// SMERP: hub central (para o botão "Voltar ao ERP")
const ERP_URL = "https://solucaomoveis-erp.h5xdag.easypanel.host/";

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, loading, signOut, roles } = useAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Carregando...</div>;
  }

  const isAdmin = roles.includes("admin");
  const canCreate = roles.includes("solicitante") || roles.includes("admin") || roles.includes("comprador") || roles.includes("aprovador");
  const nav = [
    { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { to: "/requests", icon: FileText, label: "Solicitações" },
    { to: "/approvals", icon: CheckSquare, label: "Aprovações" },
    { to: "/evaluations", icon: ClipboardCheck, label: "Avaliações" },
    { to: "/items", icon: Package, label: "Itens" },
    ...(canCreate ? [{ to: "/requests/new", icon: Plus, label: "Nova" }] : []),
    ...(isAdmin ? [{ to: "/admin", icon: Settings, label: "Administração" }] : []),
  ];

  return (
    <div className="min-h-screen bg-background">
      <img
        src={logo}
        alt=""
        aria-hidden
        style={{ pointerEvents: "none" }}
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[60vw] max-w-[640px] opacity-15 select-none md:left-[calc(50%+120px)]"
      />
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 border-r bg-sidebar md:flex md:flex-col">
        <div className="flex items-center gap-3 px-4 py-4 border-b">
          <img src={logo} alt="Solução Móveis" className="h-10 w-10 rounded-md object-contain bg-white" />
          <div>
            <div className="text-sm font-semibold leading-tight">Solução Móveis</div>
            <div className="text-xs text-muted-foreground">Sistema de Compras</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {nav.map((n) => {
            const active = path === n.to || (n.to === "/requests" && path.startsWith("/requests") && path !== "/requests/new");
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                  active ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                }`}
              >
                <n.icon className="h-4 w-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t p-3">
          <div className="mb-2 flex items-center justify-between gap-2 px-3">
            <span className="truncate text-xs text-muted-foreground">{user.email}</span>
            <NotificationsBell />
          </div>
          <a
            href={ERP_URL}
            className="mb-1 flex items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent/50"
          >
            <Home className="h-4 w-4" /> Voltar ao ERP
          </a>
        </div>
      </aside>
      <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-background px-4 py-3 md:hidden">
        <div className="flex items-center gap-2">
          <img src={logo} alt="Solução Móveis" className="h-7 w-7 rounded object-contain bg-white" />
          <span className="font-semibold text-sm">Sistema de Compras</span>
        </div>
        <div className="flex items-center gap-1">
          <a href={ERP_URL} aria-label="Voltar ao ERP" className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent">
            <Home className="h-4 w-4" />
          </a>
          <NotificationsBell />
        </div>
      </header>
      <nav className="sticky top-[57px] z-10 flex gap-1 overflow-x-auto border-b bg-background px-2 py-2 md:hidden">
        {nav.map((n) => (
          <Link key={n.to} to={n.to} className="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs hover:bg-accent">
            <n.icon className="h-3.5 w-3.5" /> {n.label}
          </Link>
        ))}
      </nav>
      <main className="md:pl-60 relative">
        <div className="mx-auto max-w-7xl p-4 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
