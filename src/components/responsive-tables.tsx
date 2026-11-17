"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * On phones, data tables render as cards (globals.css). Each cell needs its
 * column name for that, so this copies header text into data-label. It also
 * keeps explicit table roles, because WebKit drops table semantics once the
 * cells are display:block and VoiceOver would otherwise read loose text.
 */
function label(root: ParentNode) {
  for (const table of root.querySelectorAll<HTMLTableElement>("table.t:not(.keep-table)")) {
    const heads = [...table.querySelectorAll("thead th")].map((th) => th.textContent?.trim() ?? "");
    table.setAttribute("role", "table");
    for (const tr of table.querySelectorAll("tr")) {
      tr.setAttribute("role", "row");
      [...tr.children].forEach((cell, i) => {
        cell.setAttribute("role", cell.tagName === "TH" ? "columnheader" : "cell");
        if (cell.tagName === "TD" && !cell.hasAttribute("data-label")) cell.setAttribute("data-label", heads[i] ?? "");
      });
    }
  }
}

export function ResponsiveTables() {
  const path = usePathname();
  useEffect(() => {
    label(document);
    // Streamed sections (Suspense) arrive after the first render.
    let t = 0;
    const mo = new MutationObserver(() => { clearTimeout(t); t = window.setTimeout(() => label(document), 50); });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { mo.disconnect(); clearTimeout(t); };
  }, [path]);
  return null;
}
