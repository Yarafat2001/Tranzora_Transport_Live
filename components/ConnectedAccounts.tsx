"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Icon } from "./WorkspaceIcons";

type Provider = { provider: "google" | "microsoft"; enabled: boolean };
type Connection = { provider: string; createdAt: string };

export default function ConnectedAccounts() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let current = true;
    Promise.all([api<Provider[]>("auth/providers"), api<Connection[]>("auth/connections")]).then(([providers, connections]) => {
      if (!current) return;
      setProviders(providers); setConnections(connections);
      const connected = new URLSearchParams(window.location.search).get("connected");
      if (connections.some(item => item.provider === connected)) setNotice("Sign-in account connected successfully.");
    }).catch(error => { if (current) setError(error.message); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, []);
  async function change(provider: Provider, linked: boolean) {
    setBusy(provider.provider); setError(""); setNotice("");
    try {
      if (linked) {
        await api(`auth/connections/${provider.provider}`, { method: "DELETE" });
        setConnections(previous => previous.filter(item => item.provider !== provider.provider));
        setNotice("Provider disconnected. Other sessions have been signed out.");
      } else {
        const result = await api<{ url: string }>(`auth/connections/${provider.provider}`, { method: "POST", body: "{}" });
        window.location.assign(result.url);
      }
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to update connected accounts."); }
    finally { setBusy(""); }
  }
  return <section className="panel settings-form connected-accounts">
    <h3>Connected sign-in accounts</h3>
    <p>Connect your own Google or Microsoft account to sign in to this workspace. For security, sign in again if your current session is more than 10 minutes old.</p>
    {loading && <p role="status">Loading connected accounts…</p>}
    {providers.map(provider => {
      const linked = connections.some(connection => connection.provider === provider.provider);
      const name = provider.provider === "google" ? "Google" : "Microsoft";
      return <div className="connected-provider" key={provider.provider}>
        <span className="connected-provider-icon"><Icon name={provider.provider} size={24} /></span>
        <span><b>{name}</b><small>{linked ? "Connected to your account" : provider.enabled ? "Ready to connect" : "Administrator setup required"}</small></span>
        <button className="secondary" disabled={!!busy || !linked && !provider.enabled} aria-busy={busy === provider.provider} onClick={() => change(provider, linked)}>{busy === provider.provider ? "Please wait…" : linked ? `Disconnect ${name}` : `Connect ${name}`}</button>
      </div>;
    })}
    {error && <p role="alert">{error}</p>}
    {notice && <p className="account-notice" role="status">{notice}</p>}
  </section>;
}
