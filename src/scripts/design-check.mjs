// Renders AthleteOS the way an iPhone shows it and audits every screen, for
// the /design-check skill. Read-only: it signs in and opens pages, nothing
// else, so it is safe against any instance you can sign in to.
//
//   DC_BASE=http://127.0.0.1:3020 DC_EMAIL=you@example.com DC_PASSWORD=... node scripts/design-check.mjs [out-dir]
//
// out-dir defaults to <system temp>/athleteos-design-check; keep it outside the repo.
//
// Needs Playwright (with Chromium) and axe-core resolvable from here
// (`npm i --no-save playwright axe-core` if they aren't). Writes one PNG per
// page × configuration and report.json with, per page:
//   overflowX   horizontal scroll in CSS px (should be 0)
//   small       controls under 44×44 pt (inline text links excepted)
//   zoomInputs  fields under 16px text, which make iOS Safari zoom on focus
//   noKeyboard  email/number-like fields without a matching type/inputmode
//   unlabeled   controls with no accessible name
//   axe         WCAG 2 A/AA violations (contrast, names, ARIA)
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

const B = process.env.DC_BASE ?? "http://127.0.0.1:3020";
const EMAIL = process.env.DC_EMAIL, PASSWORD = process.env.DC_PASSWORD;
if (!EMAIL || !PASSWORD) throw new Error("DC_EMAIL and DC_PASSWORD are required");
// Screenshots go to the system temp folder by default, never into the repo.
const OUT = path.resolve(process.argv[2] ?? path.join(os.tmpdir(), "athleteos-design-check"));
fs.mkdirSync(OUT, { recursive: true });
const T = { timeout: 180_000 };
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const phone = (w, h, scale = 2) => ({ viewport: { width: w, height: h }, deviceScaleFactor: scale, isMobile: true, hasTouch: true, userAgent: UA });

// Signed-in pages, then pages anyone can open. Add new screens here.
const PAGES = [
  ["today", "/"], ["plan", "/plan"], ["training", "/history"], ["zones", "/history/zones"], ["trends", "/trends"],
  ["readiness", "/readiness"], ["review", "/review"], ["body", "/wearables"], ["checkin", "/wellness"],
  ["questionnaire", "/questionnaires/morning-wellness"], ["more", "/more"], ["settings", "/settings"],
  ["accounts", "/settings/accounts"], ["notifications", "/settings/notifications"], ["security", "/settings/security"],
  ["analysis", "/settings/analysis"], ["welcome", "/welcome"], ["welcome-connect", "/welcome?step=connect"], ["welcome-checkin", "/welcome?step=checkin"],
  ["welcome-reminders", "/welcome?step=reminders"], ["welcome-install", "/welcome?step=install"],
];
const PUBLIC = [["login", "/login"], ["login-error", "/login?error=1"], ["forgot", "/forgot"], ["invite-entry", "/invite"], ["invite-bad", "/invite/AAAA-AAAA-AAAA"]];

// 375 = iPhone SE/mini width, 440 = Pro Max. "text200" approximates Safari's
// largest page text size: a 188-pt-wide layout drawn at 4x.
const CONFIGS = [
  { name: "375-dark", ctx: phone(375, 812), theme: "dark", audit: true, full: true },
  { name: "375-light", ctx: phone(375, 812), theme: "light", audit: true, full: false },
  { name: "440-dark", ctx: phone(440, 956), theme: "dark", audit: false, full: false },
  { name: "text200", ctx: phone(188, 406, 4), theme: "dark", audit: false, full: false },
];

async function audit(p) {
  const r = await p.evaluate(() => {
    const vis = (e) => { const b = e.getBoundingClientRect(); const s = getComputedStyle(e); return b.width > 0 && b.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
    const name = (e) => (e.getAttribute("aria-label") || e.getAttribute("title") || e.innerText || e.value || "").trim();
    const desc = (e) => `${e.tagName.toLowerCase()}${e.type ? `[${e.type}]` : ""} "${name(e).slice(0, 28) || e.getAttribute("name") || ""}"`;
    const ctrls = [...document.querySelectorAll("a[href], button, input:not([type=hidden]), select, textarea, summary")].filter(vis);
    const small = ctrls.filter((e) => {
      const b = e.getBoundingClientRect();
      const inline = e.tagName === "A" && getComputedStyle(e).display === "inline" && e.closest("p, li, .help");
      return (b.width < 44 || b.height < 44) && !inline;
    }).map((e) => { const b = e.getBoundingClientRect(); return `${desc(e)} ${Math.round(b.width)}x${Math.round(b.height)}`; });
    const fields = [...document.querySelectorAll("input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea")].filter(vis);
    return {
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      small,
      zoomInputs: fields.filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16).map((e) => `${desc(e)} ${getComputedStyle(e).fontSize}`),
      noKeyboard: fields.filter((e) => /email/i.test(e.name) && e.type !== "email").map(desc),
      unlabeled: ctrls.filter((e) => !name(e) && !e.labels?.length && !e.getAttribute("aria-labelledby")).map(desc),
    };
  });
  await p.addScriptTag({ content: AXE });
  r.axe = await p.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] } })).violations
    .map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, examples: v.nodes.slice(0, 3).map((n) => n.target.join(" ")) })));
  return r;
}

const browser = await chromium.launch();
const report = {};
try {
  const login = await browser.newContext(phone(375, 812));
  const lp = await login.newPage();
  await lp.goto(`${B}/login`);
  await lp.fill("input[name=email]", EMAIL);
  await lp.fill("input[name=password]", PASSWORD);
  await Promise.all([lp.waitForLoadState("load", T), lp.click("button[type=submit]")]);
  if (lp.url().includes("/login")) throw new Error(`Sign-in didn't complete (${lp.url()}); a user with emailed codes on needs a trusted session, so use one without`);
  const state = await login.storageState();
  await login.close();

  for (const c of CONFIGS) {
    const ctx = await browser.newContext({ ...c.ctx, storageState: state });
    await ctx.addCookies([{ name: "aos_theme", value: c.theme, url: B }]);
    const pg = await ctx.newPage();
    for (const [key, route] of PAGES) {
      await pg.goto(B + route, T);
      await pg.waitForLoadState("networkidle").catch(() => {});
      await pg.screenshot({ path: `${OUT}/${c.name}-${key}.png`, fullPage: c.full });
      if (c.audit) report[`${c.name}:${key}`] = await audit(pg);
      else report[`${c.name}:${key}`] = { overflowX: await pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) };
    }
    await ctx.close();
  }

  const anon = await browser.newContext(phone(375, 812));
  const ap = await anon.newPage();
  for (const [key, route] of PUBLIC) {
    await ap.goto(B + route, T);
    await ap.screenshot({ path: `${OUT}/375-dark-${key}.png` });
    report[`375-dark:${key}`] = await audit(ap);
  }

  // Offline: the service worker should answer with its offline page.
  const off = await browser.newContext({ ...phone(375, 812), storageState: state });
  const op = await off.newPage();
  await op.goto(`${B}/plan`, T);
  await op.evaluate(() => Promise.race([navigator.serviceWorker?.ready, new Promise((r) => setTimeout(r, 8000))]));
  await off.setOffline(true);
  await op.goto(`${B}/trends`).catch(() => {});
  await op.screenshot({ path: `${OUT}/375-dark-offline.png` });
} finally {
  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
  await browser.close();
}
console.log(`Screens and report.json in ${OUT}`);
