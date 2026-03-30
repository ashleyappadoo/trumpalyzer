// ─────────────────────────────────────────────────────────────────────────────
//  TRUMPALYZER — Shared UI Components
// ─────────────────────────────────────────────────────────────────────────────

export const SIG = {
  BUY:    { color: "var(--signal-buy)",   bg: "rgba(0,201,122,0.07)",  border: "rgba(0,201,122,0.22)",  icon: "▲", label: "BUY"    },
  SELL:   { color: "var(--signal-sell)",  bg: "rgba(255,59,92,0.07)",  border: "rgba(255,59,92,0.22)",  icon: "▼", label: "SELL"   },
  WATCH:  { color: "var(--signal-watch)", bg: "rgba(245,166,35,0.07)", border: "rgba(245,166,35,0.22)", icon: "◈", label: "WATCH"  },
  IGNORE: { color: "#3a4466",             bg: "rgba(58,68,102,0.07)",  border: "rgba(58,68,102,0.2)",   icon: "○", label: "IGNORE" },
};

export function Spinner({ label }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center",
      justifyContent:"center", padding:"64px 20px", gap:16 }}>
      <div style={{
        width:36, height:36,
        border:"2px solid var(--navy-500)",
        borderTop:"2px solid var(--crimson)",
        borderRadius:"50%",
        animation:"spin 0.8s linear infinite",
      }} />
      <span style={{
        fontFamily:"var(--font-mono)", fontSize:10,
        color:"rgba(196,30,58,0.5)", letterSpacing:3,
      }}>{label}</span>
    </div>
  );
}

export function SignalBadge({ sig, small }) {
  const c = SIG[sig] || SIG.WATCH;
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", gap:4,
      padding: small ? "1px 8px" : "3px 12px",
      background: c.bg, border:`1px solid ${c.border}`,
      borderRadius:2, color:c.color,
      fontFamily:"var(--font-mono)",
      fontSize: small ? 9 : 10, fontWeight:700, letterSpacing:2,
    }}>
      {c.icon} {sig}
    </span>
  );
}

export function ConvergenceBadge({ convergence, label, color }) {
  return (
    <div style={{
      display:"inline-flex", alignItems:"center", gap:6,
      padding:"4px 12px",
      background:`rgba(${convergence==="confirmed"?"0,201,122":convergence==="divergent"?"255,59,92":"245,166,35"},0.08)`,
      border:`1px solid ${color}40`,
      borderRadius:2, color,
      fontFamily:"var(--font-mono)", fontSize:10, fontWeight:700, letterSpacing:1,
    }}>
      {label}
    </div>
  );
}

export function ConfBar({ pct, color }) {
  return (
    <div style={{ height:3, background:"var(--navy-600)", borderRadius:2, overflow:"hidden", marginTop:3 }}>
      <div style={{ width:`${pct}%`, height:"100%", background:color,
        borderRadius:2, transition:"width 0.7s ease" }} />
    </div>
  );
}

export function StatBox({ label, value, color, sub }) {
  return (
    <div style={{
      padding:"14px 16px",
      background:"var(--navy-700)",
      border:"1px solid var(--border)",
      borderTop:`2px solid ${color}`,
      borderRadius:2,
    }}>
      <div style={{ fontFamily:"var(--font-mono)", fontSize:8, letterSpacing:3,
        color:"var(--text-muted)", marginBottom:6 }}>{label}</div>
      <div style={{ color, fontSize:22, fontWeight:800,
        fontFamily:"var(--font-display)" }}>{value}</div>
      {sub && <div style={{ fontFamily:"var(--font-mono)", fontSize:9,
        color:"var(--text-muted)", marginTop:3 }}>{sub}</div>}
    </div>
  );
}

export const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div style={{
      background:"var(--navy-700)", border:"1px solid var(--border)",
      padding:"8px 12px", fontFamily:"var(--font-mono)", fontSize:11,
      borderRadius:2,
    }}>
      <div style={{ color:"var(--text-muted)", marginBottom:3 }}>{label}</div>
      <div style={{ color: p.name==="hist"?"var(--gold)":"var(--signal-buy)", fontWeight:700 }}>
        ${(+p.value).toFixed(2)}{p.name==="pred"?" · forecast":""}
      </div>
    </div>
  );
};
