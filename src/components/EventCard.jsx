import { SIG, SignalBadge } from "./ui.jsx";
import TickerCard from "./TickerCard.jsx";

export default function EventCard({
  ev, prices, levels, convergences,
  onSelectTicker, selectedTicker,
  isActive, onClick,
}) {
  const ago = ev.hours_ago < 1
    ? `${Math.round(ev.hours_ago * 60)}MIN`
    : ev.hours_ago < 24
      ? `${ev.hours_ago}H`
      : `${Math.round(ev.hours_ago / 24)}D`;

  return (
    <div
      onClick={onClick}
      style={{
        border:`1px solid ${isActive ? "var(--crimson)" : "var(--border)"}`,
        borderLeft:`3px solid ${isActive ? "var(--crimson)" : "var(--navy-400)"}`,
        borderRadius:3,
        background: isActive ? "var(--navy-700)" : "var(--navy-800)",
        cursor:"pointer", overflow:"hidden", transition:"all 0.15s",
        animation:"fadeUp 0.3s ease both",
      }}
    >
      {/* ── Event header ── */}
      <div style={{ padding:"13px 16px", display:"flex",
        justifyContent:"space-between", alignItems:"flex-start" }}>

        <div style={{ flex:1, minWidth:0, marginRight:14 }}>
          {/* Meta */}
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5 }}>
            <span style={{
              padding:"1px 7px",
              background:"var(--crimson-glow)",
              border:"1px solid var(--crimson-dark)",
              borderRadius:2,
              fontFamily:"var(--font-mono)", fontSize:9, fontWeight:700,
              color:"var(--crimson)", letterSpacing:2,
            }}>
              {ago} AGO
            </span>
            <span style={{ fontFamily:"var(--font-mono)", fontSize:9,
              color:"var(--text-muted)" }}>{ev.source}</span>
            {ev.key_themes?.slice(0,2).map(th => (
              <span key={th} style={{ padding:"1px 6px",
                background:"var(--navy-600)", border:"1px solid var(--border)",
                borderRadius:2, fontFamily:"var(--font-mono)", fontSize:8,
                color:"var(--text-muted)", letterSpacing:1 }}>
                {th}
              </span>
            ))}
          </div>

          {/* Headline */}
          <div style={{ fontFamily:"var(--font-display)", fontWeight:700,
            fontSize:15, color:"var(--text-primary)", lineHeight:1.35 }}>
            {ev.headline}
          </div>

          {isActive && ev.summary && (
            <div style={{ marginTop:6, fontSize:12,
              color:"var(--text-secondary)", lineHeight:1.55,
              fontFamily:"var(--font-ui)" }}>
              {ev.summary}
            </div>
          )}
        </div>

        {/* Badges */}
        <div style={{ flexShrink:0, display:"flex", flexDirection:"column",
          alignItems:"flex-end", gap:5 }}>
          <SignalBadge sig={ev.overall_signal} />
          <span style={{
            padding:"2px 8px", borderRadius:2,
            fontFamily:"var(--font-mono)", fontSize:9,
            background:"var(--navy-600)", border:"1px solid var(--border)",
            color: ev.sentiment==="bullish" ? "var(--signal-buy)"
                 : ev.sentiment==="bearish" ? "var(--signal-sell)"
                 : "var(--signal-watch)",
          }}>
            {ev.sentiment?.toUpperCase()}
          </span>
        </div>
      </div>

      {/* ── Expanded: ticker cards ── */}
      {isActive && ev.tickers?.length > 0 && (
        <div style={{ padding:"0 16px 16px" }}
          onClick={e => e.stopPropagation()}>
          <div style={{ fontFamily:"var(--font-mono)", fontSize:8,
            letterSpacing:3, color:"var(--text-muted)", marginBottom:10 }}>
            INSTRUMENTS IMPACTÉS — PRIX ANCRÉS SUR COURS YAHOO LIVE · CLIQUER POUR FORECAST
          </div>
          <div style={{
            display:"grid",
            gridTemplateColumns:"repeat(auto-fill, minmax(190px, 1fr))",
            gap:10,
          }}>
            {ev.tickers.map(t => (
              <TickerCard
                key={t.ticker}
                t={t}
                price={prices[t.ticker]}
                levels={levels?.[t.ticker]}
                convergence={convergences?.[t.ticker]}
                onSelect={onSelectTicker}
                selected={selectedTicker === t.ticker}
                loading={!levels?.[t.ticker] && !!prices[t.ticker]}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Collapsed: ticker pills ── */}
      {!isActive && ev.tickers?.length > 0 && (
        <div style={{ padding:"0 16px 10px", display:"flex",
          gap:6, flexWrap:"wrap" }}>
          {ev.tickers.map(t => {
            const c = SIG[t.signal] || SIG.WATCH;
            const conv = convergences?.[t.ticker];
            return (
              <span key={t.ticker} style={{
                padding:"2px 9px",
                background:c.bg, border:`1px solid ${c.border}`,
                borderRadius:2, fontFamily:"var(--font-mono)",
                fontSize:9, color:c.color, fontWeight:700,
                display:"flex", alignItems:"center", gap:4,
              }}>
                {c.icon} ${t.ticker}
                {conv && (
                  <span style={{ fontSize:8,
                    color: conv.convergence==="confirmed"?"var(--signal-buy)"
                         : conv.convergence==="divergent"?"var(--signal-sell)"
                         : "var(--signal-watch)" }}>
                    {conv.convergence==="confirmed"?"●":conv.convergence==="divergent"?"⚠":"◈"}
                  </span>
                )}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
