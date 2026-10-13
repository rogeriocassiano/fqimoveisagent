"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "fq-theme";
const THEME_COLOR: Record<"light" | "dark", string> = { light: "#f0f0f0", dark: "#0f0f0f" };

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

export function applyTheme(theme: "light" | "dark") {
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // modo privado — apenas não persiste
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[theme]);
}

export default function ThemeToggle() {
  const isDark = useSyncExternalStore(
    subscribe,
    () => document.documentElement.classList.contains("dark"),
    () => true,
  );

  const toggle = useCallback(() => {
    applyTheme(isDark ? "light" : "dark");
  }, [isDark]);

  return (
    <button
      className="button ghost icon"
      onClick={toggle}
      title={isDark ? "Mudar para tema claro" : "Mudar para tema escuro"}
      aria-label="Alternar tema claro e escuro"
    >
      {isDark ? "☀" : "🌙"}
    </button>
  );
}
