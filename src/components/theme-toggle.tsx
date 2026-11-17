"use client";
import { useEffect, useState } from "react";

type Choice = "system" | "light" | "dark";

/**
 * Appearance in Settings: follow the phone (the default) or force light or
 * dark. The choice is a cookie so the server renders it with no flash.
 */
export function AppearancePicker({ initial }: { initial: Choice }) {
  const [choice, setChoice] = useState<Choice>(initial);
  useEffect(() => {
    const d = document.documentElement;
    if (choice === "system") {
      document.cookie = "aos_theme=; path=/; max-age=0; samesite=lax";
      d.dataset.theme = matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
      d.dataset.themeSource = "system";
    } else {
      document.cookie = `aos_theme=${choice}; path=/; max-age=31536000; samesite=lax`;
      d.dataset.theme = choice;
      delete d.dataset.themeSource;
    }
  }, [choice]);
  return (
    <div className="seg" role="radiogroup" aria-label="Appearance">
      {(["system", "light", "dark"] as const).map((c) => (
        <a key={c} href="#" role="radio" aria-checked={choice === c} className={choice === c ? "on" : undefined}
          onClick={(e) => { e.preventDefault(); setChoice(c); }}>
          {c === "system" ? "Automatic" : c === "light" ? "Light" : "Dark"}
        </a>
      ))}
    </div>
  );
}
