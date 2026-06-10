import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getTheme, toggleTheme, type Theme } from "@/lib/theme";

// Botão sol/lua — vai no canto superior direito do cabeçalho (AppShell).
// Inicia em "light" no SSR e sincroniza no cliente (evita mismatch de hidratação).
export function ThemeToggle() {
  const [theme, setThemeState] = useState<Theme>("light");
  useEffect(() => { setThemeState(getTheme()); }, []);

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      aria-label="Alternar tema claro/escuro"
      title="Tema claro/escuro"
      onClick={() => setThemeState(toggleTheme())}
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
