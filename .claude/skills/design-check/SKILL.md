---
name: design-check
description: Run every mobile design check on AthleteOS (ios-review, ios-flows, onboarding) against rendered iPhone screens and report one prioritised list.
disable-model-invocation: true
---

# Design check

One pass of all the mobile design checks that apply to AthleteOS, judged on
rendered screens, ending in a single list for the person to pick from. It
changes nothing until they pick.

Which checks apply:

- `mobile-app-design:ios-review` covers every screen.
- `mobile-app-design:ios-flows` and `mobile-app-design:onboarding` cover the flows listed in step 2.
- Paywall checks don't apply: there is no paywall.
- `mobile-release-check` waits for the native app. AthleteOS is still a web app installed to the home screen.

## 1. Render

Run the app against a throwaway database, never the live install: steps 2 and 3 create users. With Postgres reachable, from `src/`:

```bash
npm run build && DATABASE_URL=postgresql://…/scratch SESSION_SECRET=$(openssl rand -hex 32) ATHLETEOS_PASSWORD=pw PORT=3022 node .next/standalone/server.js
```

Sign in once as `admin@example.com` / `pw` to create the admin. Device data needs Open Wearables in Settings → Credentials and a linked account, or the data screens only show their empty states. Then run:

```bash
DC_BASE=http://127.0.0.1:3022 DC_EMAIL=admin@example.com DC_PASSWORD=pw node scripts/design-check.mjs
```

Screenshots go to the system temp folder (`athleteos-design-check`; the script prints the path), so they stay out of the repo. Report findings from them and leave them uncommitted.

The script writes one screenshot per page × configuration plus `report.json`. Each configuration covers:

- 375 and 440 points wide;
- dark and light;
- a 200% text size;
- the signed-out pages;
- offline.

Its header says what each audit field means.

The script can't reach some states, so render these by hand with Playwright on a 375-point phone:

- invite form → code shown;
- typing the code → set password;
- a new member's first Today, Body and Connected accounts, with no device data;
- the emailed-code step;
- the safe areas in home-screen mode. Overlay the status bar (59 pt) and home indicator (34 pt), because a desktop browser has no notch.

Rendering is done when every page and state above has a screenshot.

## 2. Check

Open every screenshot before writing a finding about it.

- **Screens:** go through each one with the `ios-review` checklist.
- **Flows:** apply `ios-flows` and `onboarding` to each of these, step by step. Note the start, every step, what each step asks for, the way back or out, and the end.
  - first sign-in
  - invite code → password → first Today → connect a wearable
  - emailed code
  - password reset
  - Apple Health pairing
- **Automated audits:** put the `report.json` results through the same severity bar.

UXKIN references are optional: say whether they were used.

## 3. Report

Write one list:

- **Must fix**: blocks use, breaks accessibility, or puts content under system UI.
- **Should fix**: feels unfinished or not native.
- **Nice to have**: polish.

Give each finding:

- where it is: the route, plus the screenshot or flow step;
- why it hurts the person;
- a concrete fix in this app's own terms: the tokens in `src/app/globals.css` and the components in `src/components/`.

Mark anything known only from code as **not seen**. Keep taste apart from defects.

End by asking which findings to fix. Fix the chosen ones with `mobile-app-design:ios-screens`, then re-render the changed screens and confirm each fix on its screenshot.
