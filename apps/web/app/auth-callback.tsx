"use client";

import { handleAuthCallback } from "@netlify/identity";
import { useEffect, useState } from "react";

const AUTH_HASH = /#(?:confirmation_token|recovery_token|invite_token|email_change_token|access_token)=/;

export function AuthCallbackHandler({ children }: { children: React.ReactNode }) {
  const [processing, setProcessing] = useState(
    () => typeof window !== "undefined" && AUTH_HASH.test(window.location.hash)
  );
  const [error, setError] = useState("");

  useEffect(() => {
    if (!AUTH_HASH.test(window.location.hash)) return;
    handleAuthCallback()
      .then((result) => {
        if (!result) {
          setProcessing(false);
          return;
        }
        if (result.type === "invite" && result.token) {
          sessionStorage.setItem("vl_invite_token", result.token);
          window.location.href = "/accept-invite";
          return;
        }
        if (result.type === "recovery") {
          window.location.href = "/reset-password";
          return;
        }
        window.location.href = "/integrations";
      })
      .catch((caught) => {
        setError(caught instanceof Error ? caught.message : String(caught));
        setProcessing(false);
      });
  }, []);

  if (error) return <main className="auth-shell"><section className="auth-card"><div className="notice error">{error}</div></section></main>;
  if (processing) return <main className="auth-shell"><section className="auth-card"><span className="eyebrow">VenueLoom</span><h1>Securing your session…</h1></section></main>;
  return <>{children}</>;
}
