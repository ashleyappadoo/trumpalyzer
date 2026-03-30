import { SIG, SignalBadge, ConfBar, ConvergenceBadge } from "./ui.jsx";

const fmt = v => v == null ? "—" : v < 1 ? `$${(+v).toFixed(4)}` : `$${(+v).toFixed(2)}`;

export default function TickerCard({ t, price, levels, convergence, onSelect, selected, loading }) {
  const c    = SIG[t.signal] || SIG.WATCH;
  const cur  = price?.current;
  const live = cur != null;

  // Risk/reward from real prices
  const riskPct = live && levels?.stop_loss
    ? ((levels.stop_loss - cur) / cur * 100).toFixed(1) : null;
  const rewardPct = live && levels?.target_24h
    ? ((levels.target_24h - cur) / cur * 100).toFixed(1) : null;

  return (
    <div
      onClick={() => onSelect(t.ticker)}
      style={{
        padding:"14px",
        background: selected ? "var(--navy-600)" : "var(--navy-700)",
        border:`1px solid ${selected ? "var(--crimson)" : c.border}`,
        borderTop:`2px solid ${c.color}`,
        borderRadius:2, cursor:"pointer", transition:"all 0.15s",
        opacity: loading ? 0.6 : 1,
      }}
    >
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between",
        alignItems:"flex-start", marginBottom:8 }}>
        <div>
          <span style={{ fontFamily:"var(--font-mono)", fontWeight:700,
            color:"var(--gold)", fontSize:14 }}>${t.ticker}</span>
          <span style={{ marginLeft:6, fontFamily:"var(--font-ui)",
            fontSize:11, color:"var(--text-muted)" }}>{t.name}</span>
          {live && (
            <div style={{ fontFamily:"var(--font-mono)", fontSize:10,
              color: price.change >= 0 ? "var(--signal-buy)" : "var(--signal-sell)",
              marginTop:2 }}>
              {price.change >= 0 ? "+" : ""}{price.change.toFixed(2)}% today
            </div>
          )}
        </div>
        <SignalBadge sig={t.signal} small />
      </div>

      {/* Live price */}
      <div style={{ fontFamily:"var(--font-display)", fontWeight:700,
        fontSize:20, color:"var(--text-primary)", marginBottom:10 }}>
        {live ? fmt(cur) : (
          loading
            ? <span style={{ fontFamily:"var(--font-mono)", fontSize:11,
                color:"var(--text-muted)" }}>CALCULATING…</span>
            : <span style={{ color:"var(--text-muted)", fontSize:12 }}>LOADING…</span>
        )}
      </div>

      {/* Price levels — only once enriched with real prices */}
      {levels ? (
        <>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr",
            gap:8, marginBottom:8 }}>
            {[
              { k:"ENTRÉE",    v:fmt(levels.entry_price), c:"var(--text-primary)" },
              { k:"STOP-LOSS", v:fmt(levels.stop_loss),   c:"var(--signal-sell)"  },
              { k:"CIBLE 24H", v:fmt(levels.target_24h),  c:"var(--signal-buy)"   },
            ].map(({ k, v, c: col }) => (
              <div key={k}>
                <div style={{ fontFamily:"var(--font-mono)", fontSize:8,
                  letterSpacing:2, color:"var(--text-muted)", marginBottom:2 }}>{k}</div>
                <div style={{ fontFamily:"var(--font-mono)", fontSize:11,
                  fontWeight:700, color:col }}>{v}</div>
              </div>
            ))}
          </div>

          {/* Risk/reward */}
          {riskPct && rewardPct && (
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8,
              padding:"5px 8px", background:"var(--navy-800)", borderRadius:2 }}>
              <span style={{ fontFamily:"var(--font-mono)", fontSize:9,
                color:"var(--signal-sell)" }}>R {riskPct}%</span>
              <span style={{ color:"var(--text-muted)" }}>→</span>
              <span style={{ fontFamily:"var(--font-mono)", fontSize:9,
                color:"var(--signal-buy)" }}>+{rewardPct}%</span>
              <span style={{ fontFamily:"var(--font-mono)", fontSize:9,
                color:"var(--text-muted)", marginLeft:"auto" }}>
                {levels.risk_reward}x R/R
              </span>
            </div>
          )}
        </>
      ) : live ? (
        <div style={{ padding:"8px", background:"var(--navy-800)",
          borderRadius:2, marginBottom:8,
          fontFamily:"var(--font-mono)", fontSize:9, color:"var(--text-muted)",
          letterSpacing:2, textAlign:"center" }}>
          CALCUL DES NIVEAUX EN COURS…
        </div>
      ) : null}

      {/* Convergence badge */}
      {convergence && (
        <div style={{ marginBottom:8 }}>
          <ConvergenceBadge
            convergence={convergence.convergence}
            label={convergence.convergenceLabel}
            color={convergence.convergenceColor}
          />
          <div style={{ fontFamily:"var(--font-mono)", fontSize:8,
            color:"var(--text-muted)", marginTop:3, letterSpacing:1 }}>
            TimesFM: {convergence.forecastDelta >= 0 ? "+" : ""}
            {convergence.forecastDelta}% (5J)
          </div>
        </div>
      )}

      {/* Confidence */}
      <div>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:1 }}>
          <span style={{ fontFamily:"var(--font-mono)", fontSize:8,
            letterSpacing:2, color:"var(--text-muted)" }}>CONFIANCE CLAUDE</span>
          <span style={{ fontFamily:"var(--font-mono)", fontSize:9,
            color:c.color, fontWeight:700 }}>{t.confidence}%</span>
        </div>
        <ConfBar pct={t.confidence} color={c.color} />
      </div>

      {/* Reason */}
      {(levels?.trade_rationale || t.reason) && (
        <div style={{ marginTop:8, fontSize:11, color:"var(--text-secondary)",
          lineHeight:1.4, borderTop:"1px solid var(--border-subtle)", paddingTop:6 }}>
          {levels?.trade_rationale || t.reason}
        </div>
      )}
    </div>
  );
}
