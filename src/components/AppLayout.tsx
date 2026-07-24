import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { LayoutDashboard, FileText, Plus, CheckSquare, Settings, Package, ClipboardCheck, TrendingUp } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { NotificationsBell } from "@/components/NotificationsBell";
import { AppShell, type NavItem } from "@/components/AppShell";
import logo from "@/assets/logo.png";

// SMERP: hub central (para o botão "Voltar ao ERP")
const ERP_URL = "https://solucaomoveis-erp.h5xdag.easypanel.host/";

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, loading, roles } = useAuth();
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
  const nav: NavItem[] = [
    { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { to: "/indicadores", icon: TrendingUp, label: "Indicadores" },
    { to: "/requests", icon: FileText, label: "Solicitações" },
    { to: "/approvals", icon: CheckSquare, label: "Aprovações" },
    { to: "/evaluations", icon: ClipboardCheck, label: "Avaliações" },
    { to: "/items", icon: Package, label: "Itens" },
    ...(canCreate ? [{ to: "/requests/new", icon: Plus, label: "Nova" }] : []),
    ...(isAdmin ? [{ to: "/admin", icon: Settings, label: "Administração" }] : []),
  ];

  // "/requests" só fica ativo quando não é a tela "Nova" (/requests/new).
  const isActive = (to: string, pathname: string) => {
    if (to === "/requests") return pathname.startsWith("/requests") && pathname !== "/requests/new";
    return pathname === to || pathname.startsWith(to + "/");
  };

  const pageTitle = nav.find((n) => isActive(n.to, path))?.label;

  return (
    <AppShell
      brand={{ logo, title: "Solução Móveis", subtitle: "Sistema de Compras" }}
      navItems={nav}
      pathname={path}
      isActive={isActive}
      pageTitle={pageTitle}
      user={user}
      erpUrl={ERP_URL}
      headerRight={<NotificationsBell />}
    >
      {children}
    </AppShell>
  );
}
