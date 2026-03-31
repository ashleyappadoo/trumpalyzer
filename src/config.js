// ─────────────────────────────────────────────────────────────────────────────
//  TRUMPALYZER — Configuration
//
//  All external APIs are proxied via Vercel serverless functions:
//  /api/claude   → Anthropic Claude (key in Vercel env)
//  /api/news     → GDELT / NewsAPI (NEWSAPI_KEY optional in Vercel env)
//  /api/yahoo    → Yahoo Finance (CORS fix)
//  /api/timesfm  → HuggingFace TimesFM Space (CORS fix + 25s timeout)
// ─────────────────────────────────────────────────────────────────────────────

export const MAX_EVENTS       = 5;
export const FORECAST_HORIZON = 5;   // days ahead
export const FORECAST_HISTORY = 30;  // days of history sent to TimesFM
