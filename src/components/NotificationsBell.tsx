import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { toast } from "sonner";

type Notif = {
  id: string;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
  request_id: string | null;
};

export function NotificationsBell() {
  const { user } = useAuth();
  const [items, setItems] = useState<Notif[]>([]);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications").select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }).limit(20);
    setItems((data as Notif[]) ?? []);
  };

  useEffect(() => {
    load();
    if (!user) return;
    const ch = supabase
      .channel(`notif-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const n = payload.new as Notif;
          setItems((prev) => [n, ...prev]);
          toast.success(n.title, { description: n.body ?? undefined });
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const unread = items.filter((i) => !i.read_at).length;

  const markAllRead = async () => {
    if (!user || unread === 0) return;
    await supabase.from("notifications").update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id).is("read_at", null);
    setItems(items.map((i) => ({ ...i, read_at: i.read_at ?? new Date().toISOString() })));
  };

  return (
    <Popover onOpenChange={(o) => { if (o) markAllRead(); }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-3 py-2 text-sm font-semibold">Notificações</div>
        <div className="max-h-80 overflow-auto">
          {items.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">Nenhuma notificação</div>
          )}
          {items.map((n) => {
            const content = (
              <div className={`border-b px-3 py-2 text-sm ${!n.read_at ? "bg-accent/40" : ""}`}>
                <div className="font-medium">{n.title}</div>
                {n.body && <div className="text-muted-foreground">{n.body}</div>}
                <div className="mt-1 text-xs text-muted-foreground">{format(new Date(n.created_at), "dd/MM/yyyy HH:mm")}</div>
              </div>
            );
            return n.request_id ? (
              <Link key={n.id} to="/requests/$id" params={{ id: n.request_id }} className="block hover:bg-muted/50">{content}</Link>
            ) : <div key={n.id}>{content}</div>;
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
