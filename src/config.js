// ─────────────────────────────────────────────────────────────────────────────
//  TRUMPALYZER — Configuration
//  All external APIs are proxied via Vercel serverless functions:
//  /api/claude   → Anthropic Claude
//  /api/news     → GDELT / NewsAPI
//  /api/timesfm  → HuggingFace TimesFM Space
// ─────────────────────────────────────────────────────────────────────────────

// Yahoo Finance (public, called client-side, no CORS issues)
export const YAHOO_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";

// App settings
export const MAX_EVENTS       = 5;
export const FORECAST_HORIZON = 5;   // days ahead for TimesFM
export const FORECAST_HISTORY = 30;  // days of closes sent to TimesFM
