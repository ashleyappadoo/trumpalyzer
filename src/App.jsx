import { useState, useEffect, useCallback } from "react";
import {
  fetchTrumpEvents, fetchYahoo,
  enrichTickerWithPrices, fetchTimesFMWithConvergence,
  fetchBacktest, checkTimesFMHealth,
} from "./api.js";
import { SIG, Spinner, SignalBadge, StatBox } from "./components/ui.jsx";
import { LeaderboardAd, InArticleAd } from "./components/AdSlot.jsx";
import EventCard from "./components/EventCard.jsx";
import ForecastChart from "./components/ForecastChart.jsx";

// ─────────────────────────────────────────────────────────────────────────────

const TABS = [
  { id:"monitor",  emoji:"📡", label:"MONITOR"  },
  { id:"forecast", emoji:"📈", label:"FORECAST" },
  { id:"backtest", emoji:"🔬", label:"BACKTEST" },
];

// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  const [tab,            setTab           ] = useState("monitor");
  const [events,         setEvents        ] = useState([]);
  const [activeEvent,    setActiveEvent   ] = useState(0);
  const [sigLoading,     setSigLoading    ] = useState(false);
  const [prices,         setPrices        ] = useState({});      // { TICKER: {closes,current,change} }
  const [levels,         setLevels        ] = useState({});      // { TICKER: {entry,stop,target,rr} }
  const [convergences,   setConvergences  ] = useState({});      // { TICKER: convergence obj }
  const [forecasts,      setForecasts     ] = useState({});      // { TICKER: forecast obj }
  const [selectedTicker, setSelectedTicker] = useState(null);
  const [backtest,       setBacktest      ] = useState(null);
  const [btLoading,      setBtLoading     ] = useState(false);
  const [lastUpdate,     setLastUpdate    ] = useState(null);
  const [timesfmOk,      setTimesfmOk    ] = useState(null);
  const [tickerQueue,    setTickerQueue   ] = useState([]);      // tickers awaiting enrichment

  // ── Health check ───────────────────────────────────────────────────────────
  useEffect(() => { checkTimesFMHealth().then(setTimesfmOk); }, []);

  // ── STEP 1: Load events ────────────────────────────────────────────────────
  const loadSignals = useCallback(async () => {
    setSigLoading(true);
    setPrices({}); setLevels({}); setConvergences({});
    setForecasts({}); setSelectedTicker(null); setTickerQueue([]);
    try {
      const data = await fetchTrumpEvents();
      setEvents(data);
      setActiveEvent(0);
      setLastUpdate(new Date());
      // Queue all unique tickers for enrichment
      const all = [...new Set(data.flatMap(ev => ev.tickers?.map(t=>t.ticker)||[]))];
      setTickerQueue(all);
    } catch(e) { console.error("Events error:", e); }
    finally { setSigLoading(false); }
  }, []);

  useEffect(() => { loadSignals(); }, []);

  // ── STEP 2: Fetch Yahoo prices for all queued tickers ──────────────────────
  useEffect(() => {
    if (!tickerQueue.length) return;
    tickerQueue.forEach(async tick => {
      if (prices[tick]) return;
      const p = await fetchYahoo(tick);
      if (p) setPrices(prev => ({ ...prev, [tick]: p }));
    });
  }, [tickerQueue]);

  // ── STEPS 3+4: When a price arrives, enrich that ticker in parallel ────────
  useEffect(() => {
    const newTickers = Object.keys(prices).filter(tick =>
      !levels[tick] && !convergences[tick]
    );
    if (!newTickers.length) return;

    newTickers.forEach(async tick => {
      // Find ticker metadata from events
      const tickMeta = events.flatMap(e => e.tickers||[]).find(t=>t.ticker===tick);
      const evForTick = events.find(e => e.tickers?.some(t=>t.ticker===tick));
      if (!tickMeta || !prices[tick]) return;

      const cur = prices[tick].current;

      // Run Step 3 + Step 4 in parallel
      const [enriched, fc] = await Promise.all([
        // STEP 3: Claude calculates stop/target FROM real Yahoo price
        enrichTickerWithPrices(
          tick,
          tickMeta.signal,
          tickMeta.direction,
          tickMeta.amplitude_pct,
          tickMeta.confidence,
          tickMeta.reason,
          cur,
          evForTick?.headline || ""
        ),
        // STEP 4: TimesFM forecast → convergence
        fetchTimesFMWithConvergence(prices[tick].closes, tickMeta.signal),
      ]);

      setLevels(prev => ({ ...prev, [tick]: enriched }));
      setConvergences(prev => ({ ...prev, [tick]: fc }));
      setForecasts(prev => ({ ...prev, [tick]: { ticker:tick, ...fc } }));
    });
  }, [prices, events]);

  // ── Select ticker for forecast view ───────────────────────────────────────
  const handleSelectTicker = useCallback(tick => {
    setSelectedTicker(tick);
    setTab("forecast");
  }, []);

  // ── Backtest ───────────────────────────────────────────────────────────────
  const loadBacktest = useCallback(async () => {
    setBtLoading(true);
    try { setBacktest(await fetchBacktest()); }
    catch(e) { console.error(e); }
    finally { setBtLoading(false); }
  }, []);

  useEffect(() => {
    if (tab==="backtest" && !backtest && !btLoading) loadBacktest();
  }, [tab]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const allTickers = events
    .flatMap(e => e.tickers?.map(t=>t.ticker)||[])
    .filter((v,i,a) => a.indexOf(v)===i);

  const sigCount = { BUY:0, SELL:0, WATCH:0 };
  events.forEach(e => {
    e.tickers?.forEach(t => { if(sigCount[t.signal]!=null) sigCount[t.signal]++; });
  });

  const confirmCount = Object.values(convergences)
    .filter(c => c.convergence==="confirmed").length;
  const divergeCount = Object.values(convergences)
    .filter(c => c.convergence==="divergent").length;

  // Chart data for selected ticker
  const chartData = (() => {
    if (!selectedTicker || !prices[selectedTicker]) return [];
    const hist = prices[selectedTicker].closes.slice(-20).map((v,i) => ({
      i, hist:+v.toFixed(2), label:i===19?"TODAY":`D-${19-i}`,
    }));
    const fc = forecasts[selectedTicker];
    if (!fc?.values) return hist;
    return [...hist, ...fc.values.map((v,i) => ({ i:20+i, pred:v, label:`+${i+1}J` }))];
  })();

  const lastPrice   = selectedTicker && prices[selectedTicker]?.current;
  const tickerMeta  = allTickers.includes(selectedTicker)
    ? events.flatMap(e=>e.tickers||[]).find(t=>t.ticker===selectedTicker) : null;

  const btStats = backtest ? (() => {
    const w = backtest.filter(b=>b.outcome==="win");
    const l = backtest.filter(b=>b.outcome==="loss");
    return {
      wr:  Math.round(w.length/backtest.length*100),
      wc:  w.length, tot:backtest.length,
      aw:  w.length?(w.reduce((s,b)=>s+b.actual_24h_pct,0)/w.length).toFixed(1):"—",
      al:  l.length?(l.reduce((s,b)=>s+b.actual_24h_pct,0)/l.length).toFixed(1):"—",
    };
  })() : null;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:"100vh", background:"var(--navy-800)",
      color:"var(--text-primary)", fontFamily:"var(--font-ui)" }}>

      {/* Scanlines */}
      <div style={{ position:"fixed", inset:0, pointerEvents:"none", zIndex:1,
        backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.035) 3px,rgba(0,0,0,0.035) 4px)" }}/>

      {/* ── LEADERBOARD AD (top) ─────────────────────────────────────────── */}
      <div style={{ padding:"8px 20px 0", position:"relative", zIndex:5 }}>
        <LeaderboardAd />
      </div>

      {/* ── HEADER ──────────────────────────────────────────────────────── */}
      <header style={{
        background:"var(--navy-900)",
        borderBottom:"2px solid var(--crimson-dark)",
        position:"relative", zIndex:10,
        overflow:"hidden",
      }}>
        {/* Red stripe */}
        <div style={{ position:"absolute", top:0, left:0, right:0, height:3,
          background:`linear-gradient(90deg, var(--crimson) 0%, var(--crimson-dark) 50%, var(--crimson) 100%)`,
          animation:"glow-pulse 3s ease-in-out infinite" }}/>

        <div style={{ display:"flex", alignItems:"center",
          justifyContent:"space-between", padding:"14px 20px",
          flexWrap:"wrap", gap:10 }}>

          {/* Logo */}
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ position:"relative" }}>
              <div style={{ width:10, height:10, borderRadius:"50%",
                background: sigLoading?"var(--signal-watch)":"var(--signal-buy)",
                boxShadow:`0 0 10px ${sigLoading?"var(--signal-watch)":"var(--signal-buy)"}`,
                animation:"pulse 2s ease-in-out infinite" }}/>
            </div>
            <div>
              <div style={{ fontFamily:"var(--font-display)", fontWeight:900,
                fontSize:20, letterSpacing:2,
                background:"linear-gradient(135deg, #fff 0%, var(--gold) 60%, var(--crimson) 100%)",
                WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
                backgroundClip:"text" }}>
                TRUMPALYZER
              </div>
              <div style={{ fontFamily:"var(--font-mono)", fontSize:8,
                color:"var(--text-muted)", letterSpacing:3, marginTop:-2 }}>
                POLITICAL RISK SIGNAL DETECTOR
              </div>
            </div>
          </div>

          {/* Signal summary */}
          {!sigLoading && events.length > 0 && (
            <div style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap" }}>
              {[["BUY","var(--signal-buy)","0,201,122"],
                ["SELL","var(--signal-sell)","255,59,92"],
                ["WATCH","var(--signal-watch)","245,166,35"]].map(([s,col,rgb])=>
                sigCount[s]>0&&(
                  <div key={s} style={{ padding:"3px 10px", borderRadius:2,
                    fontFamily:"var(--font-mono)", fontSize:10, fontWeight:700,
                    background:`rgba(${rgb},0.08)`, border:`1px solid rgba(${rgb},0.25)`,
                    color:col }}>
                    {s} ×{sigCount[s]}
                  </div>
                )
              )}
              {confirmCount > 0 && (
                <div style={{ padding:"3px 10px", borderRadius:2,
                  fontFamily:"var(--font-mono)", fontSize:10,
                  background:"rgba(0,201,122,0.06)", border:"1px solid rgba(0,201,122,0.2)",
                  color:"var(--signal-buy)" }}>
                  ✓ {confirmCount} CONFIRMÉS
                </div>
              )}
              {divergeCount > 0 && (
                <div style={{ padding:"3px 10px", borderRadius:2,
                  fontFamily:"var(--font-mono)", fontSize:10,
                  background:"rgba(255,59,92,0.06)", border:"1px solid rgba(255,59,92,0.2)",
                  color:"var(--signal-sell)" }}>
                  ⚠ {divergeCount} DIVERGENTS
                </div>
              )}
              {timesfmOk !== null && (
                <div style={{ display:"flex", alignItems:"center", gap:5,
                  padding:"3px 10px", borderRadius:2,
                  background:"var(--navy-700)", border:"1px solid var(--border)" }}>
                  <div style={{ width:5, height:5, borderRadius:"50%",
                    background:timesfmOk?"var(--signal-buy)":"var(--signal-sell)",
                    boxShadow:`0 0 4px ${timesfmOk?"var(--signal-buy)":"var(--signal-sell)"}` }}/>
                  <span style={{ fontFamily:"var(--font-mono)", fontSize:9,
                    color:timesfmOk?"var(--signal-buy)":"var(--signal-sell)" }}>
                    HF {timesfmOk?"ONLINE":"OFFLINE"}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            {lastUpdate && (
              <span style={{ fontFamily:"var(--font-mono)", fontSize:9,
                color:"var(--text-muted)" }}>
                {lastUpdate.toLocaleTimeString()}
              </span>
            )}
            <button onClick={loadSignals} disabled={sigLoading} style={{
              padding:"6px 14px",
              background: sigLoading?"transparent":"var(--crimson)",
              border:`1px solid ${sigLoading?"var(--text-muted)":"var(--crimson)"}`,
              color: sigLoading?"var(--text-muted)":"#fff",
              borderRadius:2, fontFamily:"var(--font-mono)",
              fontSize:10, letterSpacing:2, fontWeight:700,
            }}>
              {sigLoading?"SCANNING…":"⟳ REFRESH"}
            </button>
          </div>
        </div>

        {/* Ticker tape */}
        {!sigLoading && events.length > 0 && (
          <div style={{ borderTop:"1px solid var(--navy-500)", overflow:"hidden",
            background:"var(--navy-900)", height:28, position:"relative" }}>
            <div style={{
              display:"inline-flex", gap:0,
              animation:"tickertape 40s linear infinite",
              whiteSpace:"nowrap", position:"absolute",
            }}>
              {[...allTickers, ...allTickers, ...allTickers].map((tick, i) => {
                const p = prices[tick];
                const c = events.flatMap(e=>e.tickers||[]).find(t=>t.ticker===tick);
                const sc = SIG[c?.signal]||SIG.WATCH;
                return (
                  <span key={i} style={{ display:"inline-flex", alignItems:"center",
                    gap:6, padding:"0 18px", height:28,
                    borderRight:"1px solid var(--navy-500)",
                    fontFamily:"var(--font-mono)", fontSize:10 }}>
                    <span style={{ color:"var(--gold)", fontWeight:700 }}>${tick}</span>
                    {p && (
                      <span style={{ color:p.change>=0?"var(--signal-buy)":"var(--signal-sell)" }}>
                        {p.change>=0?"+":""}{p.change.toFixed(2)}%
                      </span>
                    )}
                    <span style={{ color:sc.color, fontSize:8 }}>{sc.icon}{c?.signal}</span>
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </header>

      {/* ── TAB BAR ─────────────────────────────────────────────────────── */}
      <div style={{ display:"flex", background:"var(--navy-900)",
        borderBottom:"1px solid var(--border)", padding:"0 20px",
        position:"relative", zIndex:10 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding:"10px 16px",
            background:"transparent", border:"none",
            borderBottom: tab===t.id
              ? "2px solid var(--crimson)"
              : "2px solid transparent",
            color: tab===t.id ? "var(--text-primary)" : "var(--text-muted)",
            fontFamily:"var(--font-ui)", fontWeight:700,
            fontSize:12, letterSpacing:2,
          }}>
            {t.emoji} {t.label}
          </button>
        ))}
      </div>

      {/* ── CONTENT ─────────────────────────────────────────────────────── */}
      <div style={{ padding:"20px", position:"relative", zIndex:5, maxWidth:1280, margin:"0 auto" }}>

        {/* MONITOR */}
        {tab==="monitor" && (
          sigLoading ? <Spinner label="SCANNING TRUMP SIGNALS — ÉTAPE 1/4…" /> :
          events.length>0 ? (
            <div>
              <div style={{ display:"flex", justifyContent:"space-between",
                alignItems:"center", marginBottom:12 }}>
                <div style={{ fontFamily:"var(--font-mono)", fontSize:9,
                  letterSpacing:3, color:"var(--text-muted)" }}>
                  {events.length} ÉVÉNEMENTS · DU PLUS RÉCENT · CLIQUER POUR DÉVELOPPER
                </div>
                <div style={{ fontFamily:"var(--font-mono)", fontSize:9,
                  color:"var(--text-muted)" }}>
                  Pipeline: Claude News → Yahoo Live → Claude Levels → TimesFM
                </div>
              </div>

              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {events.map((ev, i) => (
                  <div key={i}>
                    <EventCard
                      ev={ev}
                      prices={prices}
                      levels={levels}
                      convergences={convergences}
                      onSelectTicker={handleSelectTicker}
                      selectedTicker={selectedTicker}
                      isActive={activeEvent===i}
                      onClick={() => setActiveEvent(activeEvent===i?-1:i)}
                    />
                    {/* In-article ad after 2nd event */}
                    {i===1 && <InArticleAd />}
                  </div>
                ))}
              </div>

              {/* Pipeline status */}
              <div style={{ marginTop:14, padding:"10px 14px",
                background:"var(--navy-700)", border:"1px solid var(--border)",
                borderRadius:2, display:"grid",
                gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
                {[
                  { step:"1 · CLAUDE NEWS",   done:events.length>0,        note:`${events.length} événements`           },
                  { step:"2 · YAHOO PRICES",  done:Object.keys(prices).length>0, note:`${Object.keys(prices).length}/${allTickers.length} tickers` },
                  { step:"3 · CLAUDE LEVELS", done:Object.keys(levels).length>0, note:`${Object.keys(levels).length} enrichis`  },
                  { step:"4 · TIMESFM",       done:Object.keys(forecasts).length>0, note:`${Object.keys(convergences).filter(k=>convergences[k]?.convergence==="confirmed").length} confirmés` },
                ].map(({ step, done, note }) => (
                  <div key={step} style={{ textAlign:"center" }}>
                    <div style={{ fontFamily:"var(--font-mono)", fontSize:8,
                      letterSpacing:2, color:"var(--text-muted)", marginBottom:3 }}>{step}</div>
                    <div style={{ fontFamily:"var(--font-mono)", fontSize:10, fontWeight:700,
                      color:done?"var(--signal-buy)":"var(--text-muted)" }}>
                      {done?"✓":sigLoading?"…":"–"} {note}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ textAlign:"center", padding:50,
              fontFamily:"var(--font-mono)", fontSize:11, color:"var(--text-muted)" }}>
              Appuie sur REFRESH pour scanner les signaux Trump
            </div>
          )
        )}

        {/* FORECAST */}
        {tab==="forecast" && (
          <div>
            {allTickers.length>0 && (
              <div style={{ display:"flex", gap:6, marginBottom:16, flexWrap:"wrap" }}>
                {allTickers.slice(0,14).map(tick => {
                  const td = events.flatMap(e=>e.tickers||[]).find(t=>t.ticker===tick);
                  const c  = SIG[td?.signal]||SIG.WATCH;
                  const cv = convergences[tick];
                  return (
                    <button key={tick} onClick={()=>handleSelectTicker(tick)} style={{
                      padding:"4px 12px",
                      background:selectedTicker===tick?c.bg:"transparent",
                      border:`1px solid ${selectedTicker===tick?c.border:"var(--border)"}`,
                      color:selectedTicker===tick?c.color:"var(--text-muted)",
                      borderRadius:2, fontFamily:"var(--font-mono)",
                      fontSize:10, fontWeight:700,
                      display:"flex", alignItems:"center", gap:5,
                    }}>
                      {c.icon} ${tick}
                      {cv && <span style={{ fontSize:8,
                        color:cv.convergence==="confirmed"?"var(--signal-buy)":
                              cv.convergence==="divergent"?"var(--signal-sell)":"var(--signal-watch)" }}>
                        {cv.convergence==="confirmed"?"●":"⚠"}
                      </span>}
                    </button>
                  );
                })}
              </div>
            )}

            {selectedTicker && prices[selectedTicker] && forecasts[selectedTicker] ? (
              <ForecastChart
                forecast={forecasts[selectedTicker]}
                chartData={chartData}
                lastPrice={lastPrice}
                selectedTicker={selectedTicker}
                tickerMeta={tickerMeta}
                levels={levels[selectedTicker]}
              />
            ) : selectedTicker ? (
              <Spinner label={`PIPELINE EN COURS POUR ${selectedTicker}…`} />
            ) : (
              <div style={{ textAlign:"center", padding:50,
                fontFamily:"var(--font-mono)", fontSize:11, color:"var(--text-muted)" }}>
                Sélectionne un ticker dans le Monitor
              </div>
            )}
          </div>
        )}

        {/* BACKTEST */}
        {tab==="backtest" && (
          btLoading ? <Spinner label="BACKTESTING 30 JOURS DE SIGNAUX TRUMP…" /> :
          backtest ? (
            <div>
              {btStats && (
                <div style={{ display:"grid",
                  gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:16 }}>
                  <StatBox label="WIN RATE"          value={`${btStats.wr}%`}          color={btStats.wr>=55?"var(--signal-buy)":"var(--signal-sell)"} />
                  <StatBox label="SIGNAUX GAGNANTS"  value={`${btStats.wc}/${btStats.tot}`} color="var(--text-primary)" />
                  <StatBox label="GAIN MOY. 24H"     value={`+${btStats.aw}%`}          color="var(--signal-buy)" />
                  <StatBox label="PERTE MOY. 24H"    value={`${btStats.al}%`}           color="var(--signal-sell)" />
                </div>
              )}

              <div style={{ border:"1px solid var(--border)", borderRadius:3, overflow:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", minWidth:700 }}>
                  <thead>
                    <tr style={{ background:"var(--navy-900)" }}>
                      {["DATE","ÉVÉNEMENT","SIG","TICKER","PRÉDIT","VAR 24H","ENTRÉE","SORTIE","RÉSULTAT"].map(h=>(
                        <th key={h} style={{ padding:"8px 10px", textAlign:"left",
                          color:"var(--text-muted)", fontSize:8, letterSpacing:2,
                          fontFamily:"var(--font-mono)", fontWeight:400,
                          borderBottom:"1px solid var(--border)", whiteSpace:"nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {backtest.map((row,i)=>{
                      const up=row.actual_24h_pct>=0, win=row.outcome==="win";
                      return (
                        <tr key={i} style={{
                          background:i%2===0?"var(--navy-700)":"var(--navy-800)",
                          borderBottom:"1px solid var(--border-subtle)" }}>
                          <td style={{ padding:"7px 10px", fontFamily:"var(--font-mono)",
                            fontSize:9, color:"var(--text-muted)", whiteSpace:"nowrap" }}>{row.date}</td>
                          <td style={{ padding:"7px 10px", fontSize:11,
                            color:"var(--text-secondary)", maxWidth:160 }}>{row.event}</td>
                          <td style={{ padding:"7px 10px" }}><SignalBadge sig={row.signal} small/></td>
                          <td style={{ padding:"7px 10px", fontFamily:"var(--font-mono)",
                            fontWeight:700, color:"var(--gold)", fontSize:11 }}>${row.ticker}</td>
                          <td style={{ padding:"7px 10px", fontFamily:"var(--font-mono)",
                            fontSize:9, color:row.predicted==="up"?"var(--signal-buy)":"var(--signal-sell)" }}>
                            {row.predicted==="up"?"▲ LONG":"▼ SHORT"}
                          </td>
                          <td style={{ padding:"7px 10px", fontFamily:"var(--font-mono)",
                            fontWeight:700, fontSize:11,
                            color:up?"var(--signal-buy)":"var(--signal-sell)" }}>
                            {up?"+":""}{row.actual_24h_pct}%
                          </td>
                          <td style={{ padding:"7px 10px", fontFamily:"var(--font-mono)",
                            fontSize:9, color:"var(--text-muted)" }}>${row.entry_price}</td>
                          <td style={{ padding:"7px 10px", fontFamily:"var(--font-mono)",
                            fontSize:9, color:"var(--text-muted)" }}>${row.exit_price}</td>
                          <td style={{ padding:"7px 10px" }}>
                            <span style={{ padding:"2px 8px", borderRadius:2,
                              fontFamily:"var(--font-mono)", fontSize:9, fontWeight:700,
                              background:win?"rgba(0,201,122,0.08)":"rgba(255,59,92,0.08)",
                              color:win?"var(--signal-buy)":"var(--signal-sell)" }}>
                              {win?"✓ WIN":"✗ LOSS"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p style={{ marginTop:8, fontFamily:"var(--font-mono)", fontSize:9,
                color:"var(--text-muted)" }}>
                * Estimations informatives uniquement. Pas de conseil financier.
              </p>
            </div>
          ) : null
        )}
      </div>

      {/* ── FOOTER ──────────────────────────────────────────────────────── */}
      <footer style={{ padding:"16px 20px", background:"var(--navy-900)",
        borderTop:"1px solid var(--border)", marginTop:40 }}>
        <div style={{ maxWidth:1280, margin:"0 auto",
          display:"flex", justifyContent:"space-between",
          alignItems:"center", flexWrap:"wrap", gap:8 }}>
          <div>
            <span style={{ fontFamily:"var(--font-display)", fontWeight:900,
              color:"var(--gold)", fontSize:14, letterSpacing:1 }}>TRUMPALYZER</span>
            <span style={{ fontFamily:"var(--font-mono)", fontSize:9,
              color:"var(--text-muted)", marginLeft:10 }}>
              Claude API · Yahoo Finance · HF TimesFM (onaaction/timesfm-api)
            </span>
          </div>
          <div style={{ fontFamily:"var(--font-mono)", fontSize:9,
            color:"var(--text-muted)", letterSpacing:1 }}>
            ⚠ NOT FINANCIAL ADVICE · FOR INFORMATIONAL PURPOSES ONLY
          </div>
        </div>
      </footer>
    </div>
  );
}
