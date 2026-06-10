import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/lib/auth";

import appCss from "../styles.css?url";
import faviconUrl from "@/assets/favicon.png?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <div className="mt-6">
          <Link to="/" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Início
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Sistema de Compras Solução Móveis" },
      { name: "description", content: "Sistema de solicitação e aprovação de compras." },
      { property: "og:title", content: "Sistema de Compras Solução Móveis" },
      { name: "twitter:title", content: "Sistema de Compras Solução Móveis" },
      { property: "og:description", content: "Sistema de solicitação e aprovação de compras." },
      { name: "twitter:description", content: "Sistema de solicitação e aprovação de compras." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/86cdb9d7-f1d0-4e4a-81a8-24b56cc90089/id-preview-45d4b9fe--ba0dcd5b-fcf0-4cc7-ac51-56bef760c07f.lovable.app-1778069573379.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/86cdb9d7-f1d0-4e4a-81a8-24b56cc90089/id-preview-45d4b9fe--ba0dcd5b-fcf0-4cc7-ac51-56bef760c07f.lovable.app-1778069573379.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "icon", type: "image/png", href: faviconUrl },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

// Anti-flash: aplica .dark no <html> ANTES da pintura. Lê o tema vindo do Hub
// (#smerp_theme), senão o que estiver salvo, senão o tema do sistema.
const THEME_INIT = `(function(){try{var K='smerp-theme';var h=location.hash||'';var t=null;if(h.indexOf('smerp_theme=')>-1){t=new URLSearchParams(h.replace(/^#/,'')).get('smerp_theme');if(t==='dark'||t==='light')localStorage.setItem(K,t);}t=localStorage.getItem(K)||'light';if(t==='dark')document.documentElement.classList.add('dark');}catch(e){}})();`;

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const [qc] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <Outlet />
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </QueryClientProvider>
  );
}
