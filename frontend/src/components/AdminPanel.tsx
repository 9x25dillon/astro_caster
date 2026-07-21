// AdminPanel.tsx — live telemetry dashboard for oracle-tier users.
// Accessible via /#admin hash or via the ⊙ Admin link in the header (oracle only).
import React, { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../api/client";
import { useStore } from "../store/useStore";

interface AdminStats {
  charts: { total: number; last_24h: number; last_7d: number };
  ai: {
    total: number;
    last_24h: number;
    by_tier: Record<string, number>;
    by_lens: Record<string, number>;
    by_depth: Record<string, number>;
    by_model: Record<string, number>;
  };
  features: { name: string; count: number }[];
  tier_events: Record<string, number>;
  // Deluxe-report purchases, split by rail (verified tx vs trust-mode mint).
  report_purchases?: { total: number; verified: number; trust: number };
}

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="adm-bar-row">
      <span className="adm-bar-label">{label}</span>
      <div className="adm-bar-track">
        <div className="adm-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="adm-bar-count">{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="adm-section">
      <div className="adm-section-title">{title}</div>
      {children}
    </div>
  );
}

export const AdminPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const entitlement = useStore((s) => s.entitlement);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Token in a header — a ?token= query string would land in access logs.
      const res = await fetch(`${API_BASE}/admin/stats`, {
        headers: { "X-AAE-Token": entitlement ?? "" },
      });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      setStats(await res.json());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [entitlement]);

  useEffect(() => { load(); }, [load]);

  // Escape to close
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const aiMax = stats ? Math.max(...Object.values(stats.ai.by_lens), 1) : 1;
  const featMax = stats ? Math.max(...stats.features.map((f) => f.count), 1) : 1;
  const modelMax = stats ? Math.max(...Object.values(stats.ai.by_model), 1) : 1;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="adm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="adm-header">
          <h2>⊙ Observatory Stats</h2>
          <div className="adm-header-actions">
            <button className="ghost" style={{ width: "auto", fontSize: 11, padding: "2px 8px" }}
                    onClick={load}>↻ Refresh</button>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {loading && <p className="muted" style={{ padding: "20px 24px" }}>Loading…</p>}
        {error && <p className="adm-error">{error}</p>}

        {stats && (
          <div className="adm-body">
            {/* Headline numbers */}
            <div className="adm-kpi-row">
              <div className="adm-kpi">
                <div className="adm-kpi-val">{stats.charts.total}</div>
                <div className="adm-kpi-label">Charts cast</div>
              </div>
              <div className="adm-kpi">
                <div className="adm-kpi-val">{stats.charts.last_24h}</div>
                <div className="adm-kpi-label">Last 24h</div>
              </div>
              <div className="adm-kpi">
                <div className="adm-kpi-val">{stats.charts.last_7d}</div>
                <div className="adm-kpi-label">Last 7d</div>
              </div>
              <div className="adm-kpi">
                <div className="adm-kpi-val">{stats.ai.total}</div>
                <div className="adm-kpi-label">AI queries</div>
              </div>
              <div className="adm-kpi">
                <div className="adm-kpi-val">{stats.ai.last_24h}</div>
                <div className="adm-kpi-label">Queries 24h</div>
              </div>
              <div className="adm-kpi adm-kpi-gilt" title={
                stats.report_purchases
                  ? `${stats.report_purchases.verified} verified · ${stats.report_purchases.trust} trust-mode`
                  : undefined
              }>
                <div className="adm-kpi-val">{stats.report_purchases?.total ?? 0}</div>
                <div className="adm-kpi-label">✶ Deluxe reports</div>
              </div>
            </div>

            <div className="adm-grid">
              <Section title="AI by Tier">
                {Object.entries(stats.ai.by_tier).map(([k, v]) => (
                  <Bar key={k} label={k} value={v}
                       max={Math.max(...Object.values(stats.ai.by_tier), 1)} />
                ))}
              </Section>

              <Section title="AI by Depth">
                {Object.entries(stats.ai.by_depth).map(([k, v]) => (
                  <Bar key={k} label={k} value={v}
                       max={Math.max(...Object.values(stats.ai.by_depth), 1)} />
                ))}
              </Section>

              <Section title="AI by Lens">
                {Object.entries(stats.ai.by_lens).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                  <Bar key={k} label={k} value={v} max={aiMax} />
                ))}
              </Section>

              <Section title="Models Used">
                {Object.entries(stats.ai.by_model).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                  <Bar key={k} label={k.split("/").pop() ?? k} value={v} max={modelMax} />
                ))}
              </Section>

              <Section title="Top Features">
                {stats.features.slice(0, 12).map((f) => (
                  <Bar key={f.name} label={f.name} value={f.count} max={featMax} />
                ))}
              </Section>

              <Section title="Tier Events">
                {Object.entries(stats.tier_events).map(([k, v]) => (
                  <Bar key={k} label={k} value={v}
                       max={Math.max(...Object.values(stats.tier_events), 1)} />
                ))}
              </Section>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
