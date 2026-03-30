# 🇺🇸 Trumpalyzer — Political Risk Signal Detector

> Real-time stock market signals based on Trump news, powered by Claude AI + TimesFM forecasting.

## Pipeline (4 étapes séquentielles + parallèles)

```
STEP 1 · Claude + web_search
         → 5 derniers événements Trump
         → tickers + direction + amplitude % (PAS de prix absolus)
              │
              ▼
STEP 2 · Yahoo Finance
         → cours live + historique 30J par ticker
              │
         ┌────┴────┐
         ▼         ▼
STEP 3  Claude    STEP 4  TimesFM HF
(avec prix live   (avec historique 30J)
injectés)         → prévision 5J pure
→ stop/cible      → direction technique
  ancrés sur              │
  vrai cours              ▼
         └────────→ CONVERGENCE
                   ✓ CONFIRMÉ / ⚠ DIVERGENT / ◈ NEUTRE
```

## Stack

| Composant | Service |
|---|---|
| News + NLP | Claude API `claude-sonnet-4` + web_search tool |
| Prix live | Yahoo Finance (public) |
| Niveaux trade | Claude API (2e appel avec prix Yahoo injectés) |
| Forecast | HuggingFace Space `onaaction/timesfm-api` |
| Frontend | React 18 + Vite + Recharts |
| Deploy | Vercel |

## Design System

- **Couleurs** : Navy deep · Crimson (#c41e3a) · Gold (#d4a843)
- **Fonts** : Playfair Display (titres) · IBM Plex Mono (données) · Barlow Condensed (UI)
- **Esthétique** : Presidential War Room × Financial Terminal

## Setup

```bash
npm install
npm run dev       # localhost:3000
npm run build     # production build → dist/
```

## Deploy Vercel

```bash
# CLI
vercel

# Ou : GitHub → vercel.com → Import → Deploy automatique
```

## SEO

- Meta title, description, keywords optimisés
- Open Graph + Twitter Card
- JSON-LD structured data (WebApplication)
- `robots.txt` + `sitemap.xml`
- Canonical URL (à mettre à jour dans `index.html`)

## AdSense

1. Obtenir l'approbation Google AdSense
2. Remplacer `ca-pub-XXXXXXXXXXXXXXXX` dans `index.html`
3. Décommenter le script AdSense dans `index.html`
4. Décommenter les balises `<ins>` dans `src/components/AdSlot.jsx`

3 emplacements préconfigurés :
- `LeaderboardAd` — bannière 728×90 en haut de page
- `InArticleAd`   — entre les événements dans Monitor
- `RectangleAd`   — 300×250 sidebar (disponible si layout élargi)

## ⚠️ Disclaimer

Outil informatif uniquement. Pas de conseil financier.
