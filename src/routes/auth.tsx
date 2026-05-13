import { createFileRoute, useNavigate } from "@tanstack/react-router";
import logo from "@/assets/logo.png";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

const schema = z.object({
  email: z.string().email("Email inválido").max(255),
  password: z.string().min(6, "Mínimo 6 caracteres").max(128),
  full_name: z.string().min(2).max(120).optional(),
});

function AuthPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!loading && user) navigate({ to: "/dashboard" }); }, [loading, user, navigate]);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = schema.safeParse({ email: fd.get("email"), password: fd.get("password") });
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
    setBusy(false);
    if (error) toast.error(error.message); else toast.success("Bem-vindo!");
  };

  const handleReset = async () => {
    const email = window.prompt("Informe o e-mail cadastrado para receber o link de redefinição:");
    if (!email) return;
    const parsed = z.string().email().safeParse(email);
    if (!parsed.success) { toast.error("E-mail inválido"); return; }
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Enviamos um link de redefinição para seu e-mail.");
  };

  const handleSignup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = schema.safeParse({
      email: fd.get("email"), password: fd.get("password"), full_name: fd.get("full_name"),
    });
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: { full_name: parsed.data.full_name },
      },
    });
    setBusy(false);
    if (error) toast.error(error.message); else toast.success("Conta criada!");
  };

  return (
    <div
      className="flex min-h-screen items-center justify-center p-4"
      style={{
        backgroundColor: "#ffffff",
        backgroundImage: `url(${logo}), url(${logo})`,
        backgroundRepeat: "repeat, repeat",
        backgroundSize: "160px 160px, 160px 160px",
        backgroundPosition: "0 0, 80px 80px",
      }}
    >
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <img src={logo} alt="Solução Móveis" className="h-20 w-20 rounded-xl object-contain bg-white shadow-lg shadow-primary/10" />
          <div>
            <h1 className="text-2xl font-bold">Sistema de Compras</h1>
            <p className="text-sm text-muted-foreground">Solução Móveis</p>
          </div>
        </div>
        <Card className="p-6">
          <Tabs defaultValue="login">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Criar conta</TabsTrigger>
            </TabsList>
            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2"><Label htmlFor="le">Email</Label><Input id="le" name="email" type="email" required /></div>
                <div className="space-y-2"><Label htmlFor="lp">Senha</Label><Input id="lp" name="password" type="password" required /></div>
                <Button type="submit" className="w-full" disabled={busy}>{busy ? "Entrando..." : "Entrar"}</Button>
                <button type="button" onClick={handleReset} className="w-full text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">
                  Esqueci minha senha
                </button>
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-2"><Label htmlFor="sn">Nome completo</Label><Input id="sn" name="full_name" required /></div>
                <div className="space-y-2"><Label htmlFor="se">Email</Label><Input id="se" name="email" type="email" required /></div>
                <div className="space-y-2"><Label htmlFor="sp">Senha</Label><Input id="sp" name="password" type="password" required minLength={6} /></div>
                <Button type="submit" className="w-full" disabled={busy}>{busy ? "Criando..." : "Criar conta"}</Button>
              </form>
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
