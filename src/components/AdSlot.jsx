// ─────────────────────────────────────────────────────────────────────────────
//  AdSlot — Google AdSense placeholder
//  Replace XXXXXXXXXXXXXXXX with your publisher ID in index.html and here
//  Uncomment the ins tag when AdSense is approved
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect } from "react";

export default function AdSlot({ slot, format = "auto", style = {} }) {
  useEffect(() => {
    try {
      if (window.adsbygoogle) (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {}
  }, []);

  const defaultStyle = {
    display: "block",
    background: "var(--navy-700)",
    border: "1px solid var(--border)",
    borderRadius: 2,
    overflow: "hidden",
    ...style,
  };

  return (
    <div style={defaultStyle} aria-label="Advertisement">
      {/* ── Uncomment below when AdSense is active ── */}
      {/*
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client="ca-pub-XXXXXXXXXXXXXXXX"
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive="true"
      />
      */}

      {/* ── Placeholder shown until AdSense is live ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "12px", minHeight: style.minHeight || 90,
        fontFamily: "var(--font-mono)", fontSize: 9,
        color: "var(--text-muted)", letterSpacing: 2,
      }}>
        AD SLOT · {slot} · {format.toUpperCase()}
      </div>
    </div>
  );
}

// Preset ad slots for easy use
export function LeaderboardAd() {
  return (
    <AdSlot slot="LEADERBOARD_TOP" format="horizontal"
      style={{ minHeight: 90, width: "100%" }} />
  );
}

export function RectangleAd() {
  return (
    <AdSlot slot="RECTANGLE_SIDEBAR" format="rectangle"
      style={{ minHeight: 250, width: 300 }} />
  );
}

export function InArticleAd() {
  return (
    <AdSlot slot="IN_ARTICLE" format="fluid"
      style={{ minHeight: 100, width: "100%", margin: "16px 0" }} />
  );
}
