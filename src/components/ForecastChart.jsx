import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";
import { SignalBadge, ConvergenceBadge, CustomTooltip } from "./ui.jsx";

export default function ForecastChart({
  forecast, chartData, lastPrice,
  selectedTicker, tickerMeta, levels,
}) {
  const targetPrice = forecast?.values?.at(-1) ?? null;
  const fcPct = lastPrice && targetPrice
    ? ((targetPrice - lastPrice) / lastPrice * 100) : null;

  return (
    <div style={{
      border:"1px solid var(--border)",
      borderRadius:3, padding:"20px",
      background:"var(--navy-700)",
      animation:"fadeUp 0.3s ease",
    }}>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between",
        alignItems:"flex-start", marginBottom:16 }}>
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
            <span style={{ fontFamily:"var(--font-display)", fontWeight:900,
              color:"var(--gold)", fontSize:22 }}>${selectedTicker}</span>
            {tickerMeta && <SignalBadge sig={tickerMeta.signal} />}
            {forecast?.convergence && (
              <ConvergenceBadge
                convergence={forecast.convergence}
                label={forecast.convergenceLabel}
                color={forecast.convergenceColor}
              />
            )}
          </div>
          <div style={{ fontFamily:"var(--font-mono)", fontSize:9,
            color:"var(--text-muted)", letterSpacing:2 }}>
            TIMESFM (onaaction/timesfm-api)
            {forecast?.simulated && " · FALLBACK SIMULÉ"}
            {" · "}{new Date().toLocaleTimeString()}
          </div>
        </div>

        {lastPrice != null && targetPrice != null && (
          <div style={{ textAlign:"right" }}>
            <div style={{ fontFamily:"var(--font-display)", fontWeight:700,
              fontSize:24, color:"var(--text-primary)" }}>
              ${lastPrice < 1 ? lastPrice.toFixed(4) : lastPrice.toFixed(2)}
            </div>
            <div style={{ fontFamily:"var(--font-mono)", fontSize:12, fontWeight:700,
              color: fcPct >= 0 ? "var(--signal-buy)" : "var(--signal-sell)" }}>
              {fcPct >= 0 ? "▲ +" : "▼ "}{fcPct?.toFixed(2)}% prévision 5J
            </div>
          </div>
        )}
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={chartData} margin={{ top:8, right:8, left:0, bottom:0 }}>
          <defs>
            <linearGradient id="gHist" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#d4a843" stopOpacity={0.2}/>
              <stop offset="95%" stopColor="#d4a843" stopOpacity={0}/>
            </linearGradient>
            <linearGradient id="gPred" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#00c97a" stopOpacity={0.2}/>
              <stop offset="95%" stopColor="#00c97a" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--navy-600)"/>
          <XAxis dataKey="label"
            tick={{ fontSize:9, fontFamily:"IBM Plex Mono", fill:"var(--text-muted)" }}
            tickLine={false} axisLine={{ stroke:"var(--border)" }}/>
          <YAxis domain={["auto","auto"]}
            tick={{ fontSize:9, fontFamily:"IBM Plex Mono", fill:"var(--text-muted)" }}
            tickLine={false} axisLine={false} width={62}
            tickFormatter={v => `$${v.toFixed(0)}`}/>
          <Tooltip content={<CustomTooltip/>}/>
          <ReferenceLine x="TODAY"
            stroke="var(--crimson)" strokeOpacity={0.3} strokeDasharray="4 4"/>
          <Area type="monotone" dataKey="hist"
            stroke="var(--gold)" strokeWidth={2}
            fill="url(#gHist)" dot={false} connectNulls/>
          <Area type="monotone" dataKey="pred"
            stroke="var(--signal-buy)" strokeWidth={2}
            strokeDasharray="5 3" fill="url(#gPred)"
            dot={{ r:3, fill:"var(--signal-buy)", strokeWidth:0 }} connectNulls/>
        </AreaChart>
      </ResponsiveContainer>

      {/* 5-day breakdown */}
      {forecast?.values?.length > 0 && lastPrice && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)",
          gap:6, marginTop:14 }}>
          {forecast.values.map((v, i) => {
            const pct = ((v - lastPrice) / lastPrice * 100);
            const up  = v >= lastPrice;
            return (
              <div key={i} style={{
                padding:"9px 10px",
                background:"var(--navy-800)",
                border:`1px solid ${up?"rgba(0,201,122,0.15)":"rgba(255,59,92,0.15)"}`,
                borderTop:`2px solid ${up?"var(--signal-buy)":"var(--signal-sell)"}`,
                borderRadius:2, textAlign:"center",
              }}>
                <div style={{ fontFamily:"var(--font-mono)", fontSize:9,
                  color:"var(--text-muted)", marginBottom:3 }}>+{i+1}J</div>
                <div style={{ fontFamily:"var(--font-display)", fontWeight:700,
                  color:"var(--text-primary)", fontSize:13 }}>
                  ${v < 1 ? v.toFixed(4) : v.toFixed(2)}
                </div>
                <div style={{ fontFamily:"var(--font-mono)", fontSize:9,
                  color:up?"var(--signal-buy)":"var(--signal-sell)", fontWeight:700 }}>
                  {up?"+":""}{pct.toFixed(2)}%
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Trade levels (from real prices) */}
      {levels && (
        <div style={{ marginTop:14, padding:"12px 14px",
          border:"1px solid var(--border)", borderRadius:2,
          background:"var(--navy-800)",
          display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
          {[
            { k:"ENTRÉE",    v:`$${levels.entry_price}`, c:"var(--text-primary)" },
            { k:"STOP-LOSS", v:`$${levels.stop_loss}`,   c:"var(--signal-sell)"  },
            { k:"CIBLE 24H", v:`$${levels.target_24h}`,  c:"var(--signal-buy)"   },
            { k:"R/R RATIO", v:`${levels.risk_reward}x`, c:"var(--gold)"         },
          ].map(({ k, v, c }) => (
            <div key={k}>
              <div style={{ fontFamily:"var(--font-mono)", fontSize:8,
                letterSpacing:2, color:"var(--text-muted)", marginBottom:3 }}>{k}</div>
              <div style={{ fontFamily:"var(--font-display)", fontWeight:700,
                fontSize:15, color:c }}>{v}</div>
            </div>
          ))}
        </div>
      )}

      {/* Legend */}
      <div style={{ display:"flex", gap:20, marginTop:12,
        paddingTop:10, borderTop:"1px solid var(--border-subtle)" }}>
        {[
          { color:"var(--gold)",       dash:false, label:"Historique (20J)"                                       },
          { color:"var(--signal-buy)", dash:true,  label:`TimesFM ${forecast?.simulated?"(simulé)":"(HF Space)"}` },
        ].map(l => (
          <div key={l.label} style={{ display:"flex", alignItems:"center", gap:7 }}>
            <svg width="24" height="10">
              <line x1="0" y1="5" x2="24" y2="5"
                stroke={l.color} strokeWidth="2"
                strokeDasharray={l.dash?"4 3":"none"}/>
            </svg>
            <span style={{ fontFamily:"var(--font-mono)", fontSize:9,
              color:"var(--text-muted)" }}>{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
