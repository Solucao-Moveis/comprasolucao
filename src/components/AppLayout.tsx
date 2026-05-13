import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, FileText, Plus, LogOut, ShoppingCart, CheckSquare, Settings } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { NotificationsBell } from "@/components/NotificationsBell";

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
  const nav = [
    { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { to: "/requests", icon: FileText, label: "Solicitações" },
    { to: "/approvals", icon: CheckSquare, label: "Aprovações" },
    { to: "/requests/new", icon: Plus, label: "Nova" },
    ...(isAdmin ? [{ to: "/admin", icon: Settings, label: "Administração" }] : []),
  ];

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r bg-sidebar md:flex md:flex-col">
        <div className="flex items-center gap-2 px-6 py-5 border-b">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShoppingCart className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold">Compras</div>
            <div className="text-xs text-muted-foreground">Sistema de Compras Solução Móveis</div>
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
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => signOut()}>
            <LogOut className="mr-2 h-4 w-4" /> Sair
          </Button>
        </div>
      </aside>
      <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-background px-4 py-3 md:hidden">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-5 w-5 text-primary" />
          <span className="font-semibold">Sistema de Compras Solução Móveis</span>
        </div>
        <div className="flex items-center gap-1">
          <NotificationsBell />
          <Button variant="ghost" size="sm" onClick={() => signOut()}><LogOut className="h-4 w-4" /></Button>
        </div>
      </header>
      <nav className="sticky top-[57px] z-10 flex gap-1 overflow-x-auto border-b bg-background px-2 py-2 md:hidden">
        {nav.map((n) => (
          <Link key={n.to} to={n.to} className="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs hover:bg-accent">
            <n.icon className="h-3.5 w-3.5" /> {n.label}
          </Link>
        ))}
      </nav>
      <main className="md:pl-60">
        <div className="mx-auto max-w-7xl p-4 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
