"use client";
import { useState, useTransition } from "react";
import { testCredentials, type CredentialTest } from "@/app/(app)/settings/security-actions";

/**
 * Tries what is typed in its form without saving it. It reads the form
 * instead of submitting it, so the typed values stay put for "Save" after a
 * test (React resets a form once its action finishes).
 */
/** The "Save without testing" box, Test, "Test and save", and the test's result under them. */
export function CredentialTestActions() {
  const [result, setResult] = useState<CredentialTest | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row between" style={{ flexWrap: "wrap", gap: 8 }}>
        <label className="row small ink2" style={{ gap: 6 }}><input type="checkbox" name="skip_test" /> Save without testing</label>
        <div className="row" style={{ gap: 8, marginLeft: "auto" }}>
          <button className="btn" type="button" disabled={pending}
            onClick={(e) => {
              const form = e.currentTarget.form;
              if (!form) return;
              const fd = new FormData(form);
              setResult(null);
              start(async () => setResult(await testCredentials(fd)));
            }}>
            {pending ? "Testing…" : "Test"}
          </button>
          <button className="btn primary" type="submit">Test and save</button>
        </div>
      </div>
      {result && (
        <p className={result.ok ? "small" : "field-error"} style={result.ok ? { color: "var(--good)" } : undefined} role={result.ok ? "status" : "alert"}>
          {result.message}
        </p>
      )}
    </div>
  );
}
