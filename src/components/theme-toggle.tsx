"use client";
import { useEffect, useState } from "react";
import { IconMoon, IconSun } from "./icons";

/** Dark is the default; the choice is kept in a cookie so the server renders the right theme with no flash. */
export function ThemeToggle({ initial }: { initial: "dark" | "light" }) {
  const [theme, setTheme] = useState(initial);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.cookie = `aos_theme=${theme}; path=/; max-age=31536000; samesite=lax`;
  }, [theme]);
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button className="icon-btn" onClick={() => setTheme(next)} aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`}>
      {theme === "dark" ? <IconSun size={18} /> : <IconMoon size={18} />}
    </button>
  );
}
