# Handoff: HydroMET Mburicaó — Dashboard Visual Redesign

## Overview
This package specifies a **visual + accessibility redesign** of the existing HydroMET Mburicaó
hydrometeorological monitoring dashboard (Arroyo Mburicaó basin, Asunción · PY). It is a
**re-skin and hardening pass**, not a new product: the information architecture, data flow,
and feature set are preserved. The goals are: clearer visual hierarchy, higher information
density, a sober scientific/engineering aesthetic suitable for IEEE publication and thesis
defense, full light **and** dark themes, real responsive behavior, and the accessibility +
correctness fixes from the source-code audit.

**Default theme is LIGHT** (better for projectors, paper figures, screenshots). Dark mode is
fully supported as a secondary monitoring view.

---

## About the Design Files
The files in this bundle are **design references created in HTML/React** — prototypes that show
the intended look, layout, and behavior. They are **not** production code to copy verbatim.
The task is to **recreate these designs inside the existing Next.js codebase** using its
established libraries and patterns:

- **Next.js 16 (App Router) · React 19 · Tailwind v4 · Recharts v3 · Leaflet 1.9.4 · date-fns v4 · Supabase JS v2.**
- The prototype renders charts with hand-built SVG and the map with Leaflet; in the real app the
  chart MUST be rebuilt with **Recharts** (`ComposedChart`) and the map kept on **Leaflet**
  (it already exists and works — improve its integration, do not replace it).
- Tailwind v4 is installed but barely used today (audit §6). This redesign is **token-first**:
  define the palette/type as CSS variables + `@theme` (see `tokens.css`) and build with Tailwind
  utilities + a few component classes. Eliminate the scattered inline hex values.

### Fidelity
**High-fidelity.** Colors, typography, spacing, radii, and states below are final. Recreate the
UI to match. Exact token values are in `tokens.css`; per-breakpoint type sizes are tabulated in
§ Typography.

---

## Map to the existing codebase
| Existing file | Action in redesign |
|---|---|
| `app/layout.js` | Replace Google-Fonts `<link>` with **next/font** (`fonts.ts`). Add `lang="es"`, font CSS-vars on `<html>`, semantic `bg-app text-ink` on `<body>`. Render a server shell; keep data fetching in a client child. |
| `app/globals.css` | Import `tokens.css`. **Remove the global `outline:none`** (audit Critical). Add `:focus-visible` ring, theme-aware scrollbars, Leaflet control theming. |
| `app/page.js` | Re-layout with semantic regions (`<header> <main> <section>`). Replace JS `isMobile` resize state with CSS/Tailwind breakpoints (audit §3). Wire the unified date filter + error/empty states. |
| `components/StationCards.jsx` | Becomes the **KPI card row** (§ KPI Cards): 3 cards, threshold mini-bar, status pill. Replace `Math.max(...arr)` spread with a reduce (audit §5). |
| `components/CombinedChart.jsx` | Becomes the **Analysis panel** (§ Chart): Recharts `ComposedChart` hydrograph + hyetograph, threshold reference lines, accessible tabs, theme-aware. Memoize the STATION COMP. data (audit §2). |
| `components/MapStation.jsx` | Becomes the **Basin Map panel** (§ Map): keep Leaflet + GeoJSON watershed; add theme-aware basemap (OSM light / Carto Dark dark), restyled controls, text+color+shape markers, threshold legend. Memoize `getColor`/`getStatus`; pull thresholds from shared constants. |
| `components/DataTable.jsx` | Becomes the **Records table** (§ Table): panel styling, mono tabular numerals, status-aware level cells, sticky header, **pagination** (audit P5), semantic `<table>` + `<caption>` + `scope`. |
| `components/TimeSeriesChart.jsx` | **Delete** — dead component, light-theme leftover (audit §6). |
| `lib/constants.js` *(new)* | Extract magic numbers: `LEVEL_THRESHOLDS = { ATENCION:50, ALERTA:100, CRITICO:200 }`, poll interval `60_000`, sample caps. |
| `next.config.ts` | Add `Cache-Control: public, max-age=86400` headers for `/*.geojson` static basin files (audit P2). |

---

## 1. Layout Structure

The page is a single vertically-stacked grid inside a padded app container. Three bands:

```
┌─────────────────────────────────────────────────────────────┐  <header>
│  HEADER  (wordmark · basin badge · status chips · datetime)   │
├─────────────────────────────────────────────────────────────┤  <section aria-label="Indicadores">
│  KPI ROW  [ card ] [ card ] [ card ]                          │
├───────────────────────────────────┬─────────────────────────┤  <main>
│  ANALYSIS PANEL                    │  BASIN MAP PANEL          │
│  (tabs + hydrograph/hyetograph)    │  (Leaflet + legend +      │
│                                    │   station cards)          │
├───────────────────────────────────┴─────────────────────────┤  <section aria-label="Registros">
│  RECORDS TABLE  (full width, paginated)                       │
└─────────────────────────────────────────────────────────────┘
```

- **App container**: `background: var(--app)`; padding `desktop 24px · tablet 16px · mobile 14px`.
- **Vertical gap** between bands: `desktop 16px · tablet 14px · mobile 12px`.
- **Desktop main**: CSS grid `grid-template-columns: 1fr 380px; gap: 16px; align-items: start;`
  (analysis left, map right).
- **Tablet / mobile main**: single column, panels stacked full-width, same gap.
- **Records table** spans full width under `<main>` in all breakpoints.
- Every panel: `background: var(--panel); border: 1px solid var(--border);
  border-radius: 8px; box-shadow: var(--shadow-panel); overflow: hidden;`.

### Breakpoints (CSS/Tailwind — NOT JS)
| Name | Range | Layout |
|---|---|---|
| `mobile` | `< 768px` (`base`) | 1 column; KPIs stacked 1-up; compact header; legend 2-col |
| `tablet` | `768–1279px` (`md:`) | 1 column main (chart over map); KPIs 3-up; full header |
| `desktop`| `≥ 1280px` (`xl:`) | 2-col main (1fr / 380px); KPIs 3-up |

> Audit §3 fix: remove `isMobile` resize listeners and the SSR hydration-mismatch risk.
> Use Tailwind responsive variants only. If a JS breakpoint is unavoidable for the map,
> read it in `useEffect` (client-only) and never branch SSR markup on it.

---

## 2. Component Hierarchy

```
<RootLayout> (app/layout.js — server)
  <html lang="es" class="{font vars}"> <body class="font-sans bg-app text-ink">
    <ThemeProvider>                      // class strategy: toggles `dark` on <html>
      <Dashboard> (app/page.js — client, data fetching)
        <Header>
          <Wordmark/> <BasinBadge/>
          <StatusChip/> ×4              // ingesta · estaciones · sondeo · sistema
          <Clock/>                       // datetime, mono
        <KpiRow>                         // (StationCards.jsx)
          <KpiCard/> ×3                  // value · unit · ThresholdBar · StatusPill · note
        <main>
          <AnalysisPanel>                // (CombinedChart.jsx)
            <PanelHead> <Select/>×2
            <Tabs role=tablist> <Tab role=tab/>×4
            <ChartMeta/>                 // "551 puntos · … registros"
            <Hydrograph/>                // Recharts ComposedChart
            <ChartLegend/>
          <BasinMapPanel>                // (MapStation.jsx)
            <PanelHead> <UpdatedChip/>
            <LeafletMap/>                // dynamic import, ssr:false
            <ThresholdLegend/>           // 4 status × range
            <StationCard/> ×N
        <RecordsSection>
          <DataTable/>                   // paginated
        <ErrorBanner/> / <EmptyState/>   // conditional
      </Dashboard>
    </ThemeProvider>
```

Shared primitives to build once and reuse: `Panel`, `PanelHead`, `StatusPill`, `StatusDot`,
`Chip`, `Select`, `ThresholdBar`. All consume tokens only.

---

## 3. Theme System

- **Strategy**: class-based (`<html class="dark">`). Default (no class) = light. Use a tiny
  provider (or `next-themes`) that (a) reads `localStorage('hm-theme')`, (b) falls back to
  `prefers-color-scheme`, (c) writes the class on `<html>`. Persist user choice.
- **No flash**: inject a blocking inline script in `<head>` that sets the class before paint.
- **Mechanism**: all color decisions reference CSS custom properties defined on `:root` (light)
  and `.dark` (see `tokens.css`). Components never hardcode hex. Tailwind utilities
  (`bg-panel`, `text-ink-2`, `border-border`, `text-critico`…) map to these via `@theme`.
- **Charts & map read the same tokens at runtime**: in JS use
  `getComputedStyle(document.documentElement).getPropertyValue('--level')` (or a `useTheme()`
  hook that returns the resolved palette object) so Recharts strokes and Leaflet layer colors
  switch with the theme. Re-render chart/map on theme change.
- A **theme toggle** lives in the header (icon button, right side, before the clock).

---

## 4. Color Tokens
Full values in `tokens.css`. Summary:

| Token | Light | Dark | Use |
|---|---|---|---|
| `--app` | `#eef1f5` | `#0d141c` | page background |
| `--panel` | `#ffffff` | `#141d27` | panels, cards |
| `--panel-alt` | `#f7f9fb` | `#18222e` | insets, station cards, table zebra |
| `--border` | `#dce2ea` | `#26323f` | hairlines |
| `--border-strong` | `#c6cfdb` | `#36444f` | axis baselines, emphasis |
| `--ink` | `#16202b` | `#e8eef4` | primary text, KPI values |
| `--ink-2` | `#475565` | `#aab8c6` | secondary text, chips |
| `--ink-3` | `#6c7a8b` | `#8090a0` | labels, sub-notes |
| `--ink-4` | `#93a0af` | `#5f6f7e` | ticks, faint meta |
| `--accent` | `#1c54a8` | `#5b9bff` | primary action, active state |
| `--level` | `#1c54a8` | `#5b9bff` | river-level series |
| `--rain` | `#3f8fb0` | `#5cb6d6` | rainfall series |
| `--st-normal` | `#1f8a55` | `#36a86b` | status: NORMAL |
| `--st-atencion` | `#b07d00` | `#d2a02c` | status: ATENCIÓN |
| `--st-alerta` | `#c1631c` | `#df8a3e` | status: ALERTA |
| `--st-critico` | `#b23b3b` | `#d75c5c` | status: CRÍTICO |

**Color discipline (hard rules):**
1. Accent blue = interactive/level only. Cyan = rainfall only.
2. The 4 status hues encode **data only** — never decoration. No permanent red.
3. Never encode meaning by color alone (always pair with text + shape — see Map/Status).
4. No gradients, glows, neon, or glassmorphism. Flat fills + 1px borders + the single soft shadow.

### Status thresholds (single source of truth → `lib/constants.js`)
| Status | Range (cm) | Spanish label | Token |
|---|---|---|---|
| Normal | `0 – 50` | `NORMAL` | `--st-normal` |
| Attention | `50 – 100` | `ATENCIÓN` | `--st-atencion` |
| Warning | `100 – 200` | `ALERTA` | `--st-alerta` |
| Critical | `> 200` | `CRÍTICO` | `--st-critico` |

```js
export const LEVEL_THRESHOLDS = { ATENCION: 50, ALERTA: 100, CRITICO: 200 }; // cm
export const statusForLevel = (cm) =>
  cm >= 200 ? "critico" : cm >= 100 ? "alerta" : cm >= 50 ? "atencion" : "normal";
export const STATUS_LABEL = { normal:"NORMAL", atencion:"ATENCIÓN", alerta:"ALERTA", critico:"CRÍTICO" };
```

---

## 5. Typography System
Families via next/font (`fonts.ts`):
- **Inter** (`--font-sans`) — all UI: nav, buttons, table body, station names, sub-notes.
- **IBM Plex Sans** (`--font-display`) — panel titles / headings (`<h1>/<h2>`), uppercased.
- **IBM Plex Mono** (`--font-mono`) — all numerals, KPI values, axis ticks, status labels,
  chips, dates, table numeric cells. Always `tabular-nums`.

General rules: KPI/heading numerals use `font-variant-numeric: tabular-nums`. Uppercase mono
labels carry `letter-spacing: 0.4–0.6px`. Line-height: data `1.0`, body `1.3–1.4`.
**Minimum on-screen body/label size = 11px** (audit §1 raises the old 9px labels); chart axis
ticks 11px desktop / 9px mobile.

### Per-breakpoint scale (px)
| Element | Font | Weight | Desktop | Tablet | Mobile |
|---|---|---|---|---|---|
| Wordmark | Plex Sans | 700 | 18 | 17 | 16 |
| Panel title (`h2`, uppercase) | Plex Sans | 600 | 13.5 | 13 | 12.5 |
| KPI label (uppercase mono) | Mono | 500 | 11 | 10.5 | 10 |
| **KPI value** | Mono | 600 | **40** | 34 | 30 |
| KPI unit | Mono | 500 | 16 | 15 | 13 |
| KPI sub-note | Inter | 400 | 12.5 | 12 | 11.5 |
| Tab label (uppercase mono) | Mono | 500/600 | 12 | 11.5 | 11 |
| Chart meta | Mono | 500 | 11 | 11 | 10.5 |
| Axis tick | Mono | 400 | 11 | 11 | 9 |
| Status pill | Mono | 600 | 10.5 | 10.5 | 10.5 |
| Chip | Mono | 500 | 12 | 11.5 | 11 |
| Clock | Mono | 500 | 12 | 11 | 10.5 |
| Station name | Inter | 600 | 14.5 | 14 | 13 |
| Station value | Mono | 600 | 17 | 16 | 15 |
| Legend label / range | Mono | 600 / 400 | 12 / 11 | 11.5 | 11 |
| Table header | Mono | 600 | 11 | 11 | 10.5 |
| Table cell (numeric) | Mono | 500 | 13 | 13 | 12.5 |
| Table cell (text) | Inter | 400 | 13 | 13 | 12.5 |

---

## 6. KPI Card Specifications  *(StationCards.jsx)*
Three cards in a `repeat(3, 1fr)` grid (1 column on mobile). Each card:

- Container: `Panel` style; padding `desktop 18 · tablet 16 · mobile 14`px; `flex column`.
- **Top row** (`flex; justify-between; align-center; margin-bottom:10px`):
  - **Label** — uppercase mono, `--ink-3`, letter-spacing 0.6.
  - **StatusPill** (level cards only) — see below; reflects `statusForLevel(value)`.
- **Value row** (`flex; align-items:baseline; gap:6px`):
  - **Value** — mono 600, `--ink`, `tabular-nums`, `letter-spacing:-0.5`, sizes per scale.
  - **Unit** — mono 500, `--ink-3` (`cm` / `mm`).
- **ThresholdBar** (level cards) — a 6px-tall segmented track mapping 0→250 cm:
  segments NORMAL/ATENCIÓN/ALERTA/CRÍTICO at widths `50/50/100/50` of 250, each filled with its
  status color at `opacity .32`, 1.5px gaps. A 4px-wide **marker triangle** (`--ink`) sits above
  the bar at `value/250` of the width. Scale captions below in `--ink-4` mono 9.5px:
  `0 · 50 · 100 · 200 · 250 cm`. (Rainfall card: replace the bar with a single cyan progress
  fill at ~62% on `--track`.)
- **Sub-note** — Inter, `--ink-3`, e.g. `Pico el 08/03/2026`, `Promedio horario`,
  `Día más lluvioso: 16/03/2026`.

The three KPIs: **Nivel máximo histórico** (cm, status pill), **Nivel promedio del período**
(cm, status pill), **Lluvia máx. por hora** (mm, no threshold). Audit §1: give the row a sane
`max-width` so values don't balloon on ultrawide — the `1fr` grid inside the padded container
handles this; do not let a card exceed ~520px.

> **StatusPill**: inline-flex; `padding 2px 7px`; `radius 4px`; `border 1px solid <status>`;
> `background var(--st-*-soft)`; text = status color, mono 600 10.5px, letter-spacing 0.5.
> Leading 6px dot — **circle** for level statuses, **1px-bordered square** for `SIN DATOS`
> (shape fallback). Labels: `NORMAL / ATENCIÓN / ALERTA / CRÍTICO / SIN DATOS`.

---

## 7. Header Specifications  *(semantic `<header>`)*
Single flex row, `justify-between; align-center; flex-wrap; gap 14px`; Panel style;
padding `desktop 15×22 · tablet 13×18 · mobile 12×14`px.

**Left cluster** (`flex; gap 12px`):
- **Wordmark**: `HydroMET` (Plex Sans 700, `--ink`) + `MBR` (mono 500, `--accent`, ls .5).
- **Basin badge** (`md:` and up): `CUENCA ARROYO MBURICAÓ · PY`, mono 11px `--ink-2`,
  `padding 5×9`, `border 1px solid --border`, `bg --panel-alt`, radius 5. On mobile collapse to
  `· MBURICAÓ` (mono 10px `--ink-3`).

**Right cluster** (`flex; gap 16px; flex-wrap`):
- **StatusChip** ×4 (`flex; gap 6px`; mono 11.5px `--ink-2`; 7px leading dot):
  1. `INGESTA ACTIVA` — dot `--st-normal`.
  2. `2 / 2 ESTACIONES` — dot `--st-normal`. *(hide on mobile)*
  3. **`SONDEO · 60 s`** — dot `--ink-4`. **(Audit Critical: rename from "SUPABASE REALTIME"** —
     the app polls on a 60s `setInterval`, it does not use realtime subscriptions. Either rename
     as shown or, if you implement a real Supabase channel, label it `REALTIME` truthfully.) *(hide on mobile)*
  4. **`SISTEMA OPERATIVO`** — dot `--st-normal`, **steady (no pulse)**. *(Audit §1: the old
     red permanent pulse was misleading.)* Only switch this chip to `--st-critico` + a single
     subtle pulse when an actual basin-wide critical alert is active. *(hide on mobile)*
- **ThemeToggle** — 28px icon button, `--ink-3`, hover `--panel-alt`.
- **Clock** — mono 12px `--ink-2`, `04 jun 2026 · 13:41:49`, left-separated by a 1px divider.
  On mobile show `04 jun · 13:41` only.

Header degrades by hiding chips 2–4 and the badge below `md:` (CSS only, no JS).

---

## 8. Chart Specifications  *(CombinedChart.jsx — Recharts `ComposedChart`)*
A **hydrograph + hyetograph**: rainfall bars descend from the **top** axis; river level is a line
below. This is the standard hydrological rainfall-runoff plot — keep it.

**Panel head**: title `ANÁLISIS DE SERIES TEMPORALES` (h2). Right: two `Select` controls —
series (`Nivel + Lluvia`) and period (`Todo el período`). On mobile hide the period select.

**Tabs** (`role="tablist"`): `SERIE TEMPORAL · BARRAS DIARIAS · CORRELACIÓN · COMP. ESTACIONES`.
Each `<button role="tab">` with `aria-selected`, roving `tabIndex` (active 0, others -1), and a
2px inset bottom border in `--accent` when active; active text `--accent`, inactive `--ink-3`.
**Audit §3**: tab bar `overflow-x: auto` so 4 tabs scroll on narrow screens.

**Chart meta line**: mono `--ink-3` — `551 puntos · 5.718 registros nivel · 4.842 registros lluvia`.

**Recharts config (SERIE TEMPORAL):**
```jsx
<ResponsiveContainer width="100%" height={chartH}> {/* H: desktop 372 · tablet 280 · mobile 230 */}
  <ComposedChart data={data} margin={{ top: 16, right: 40, bottom: 8, left: 8 }}>
    <CartesianGrid stroke="var(--grid)" vertical={false} />
    {/* LEFT: level (cm) — 0 at bottom */}
    <YAxis yAxisId="level" domain={[0, 230]} ticks={[0,50,100,150,200]}
           tick={{ fill:"var(--ink-3)", fontFamily:"var(--font-mono)", fontSize:11 }}
           width={40} axisLine={false} tickLine={false}
           label={{ value:"NIVEL · cm", angle:-90, position:"insideLeft", fill:"var(--ink-3)", fontSize:10 }} />
    {/* RIGHT: rainfall (mm) — REVERSED so 0 is at top → bars hang downward (hyetograph).
        Domain max stretched (~110) so bars only occupy the top ~third. */}
    <YAxis yAxisId="rain" orientation="right" reversed domain={[0, 110]} ticks={[0,20,40]}
           tick={{ fill:"var(--rain)", fontFamily:"var(--font-mono)", fontSize:11 }}
           width={36} axisLine={false} tickLine={false}
           label={{ value:"LLUVIA · mm", angle:90, position:"insideRight", fill:"var(--rain)", fontSize:10 }} />
    <XAxis dataKey="t" tickFormatter={fmtDate /* date-fns 'dd MMM' es */}
           tick={{ fill:"var(--ink-3)", fontFamily:"var(--font-mono)", fontSize:11 }}
           axisLine={{ stroke:"var(--border-strong)" }} tickLine={false} minTickGap={48} />
    {/* threshold reference lines on the LEVEL axis */}
    <ReferenceLine yAxisId="level" y={50}  stroke="var(--st-atencion)" strokeDasharray="3 3" strokeOpacity={0.55}
                   label={{ value:"50 cm",  fill:"var(--st-atencion)", fontSize:10, position:"right" }} />
    <ReferenceLine yAxisId="level" y={100} stroke="var(--st-alerta)"   strokeDasharray="3 3" strokeOpacity={0.55}
                   label={{ value:"100 cm", fill:"var(--st-alerta)",   fontSize:10, position:"right" }} />
    <ReferenceLine yAxisId="level" y={200} stroke="var(--st-critico)"  strokeDasharray="3 3" strokeOpacity={0.55}
                   label={{ value:"200 cm", fill:"var(--st-critico)",  fontSize:10, position:"right" }} />
    <Bar  yAxisId="rain"  dataKey="rain"  fill="var(--rain)" fillOpacity={0.85} barSize={3} isAnimationActive={false} />
    <Line yAxisId="level" dataKey="level" stroke="var(--level)" strokeWidth={1.7} dot={false} type="monotone" isAnimationActive={false} />
    <Tooltip content={<DarkAwareTooltip/>} />
  </ComposedChart>
</ResponsiveContainer>
```
- **Tooltip MUST be theme-aware** (audit §1: the dead `TimeSeriesChart` had a white tooltip).
  `background: var(--panel); border: 1px solid var(--border); color: var(--ink);` mono numerals.
- Keep the existing **sub-sampling cap** (500–600 points) — pass already-sampled data in.
- **Legend** under chart (mono, `--ink-2`): cyan swatch `Lluvia (mm)`, blue line `Nivel (cm)`,
  dashed `Umbral de alerta`.
- Chart heights are **fluid via `ResponsiveContainer`**; the per-breakpoint H above is a target,
  prefer `min-height` + flex-grow if the panel can stretch (audit §3 — no hardcoded 240px).
- **Accessibility**: wrap in `role="img"` with an `aria-label` summary; provide a visually-hidden
  data summary or link to the table as the text alternative.
- **Audit §2**: build the STATION COMP. tab series in `useMemo`, not inline in JSX.

---

## 9. Map Specifications  *(MapStation.jsx — Leaflet, keep it)*
This is the strongest existing piece — **improve integration, do not replace with a diagram.**

- **Dynamic import** stays: `next/dynamic(() => import('./LeafletMap'), { ssr:false })` (avoids
  SSR Leaflet crash). Keep the `isMounted` guard + `map.remove()` cleanup.
- **Basemap = theme-aware tile layer**:
  - Light: `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` — attribution `© OpenStreetMap contributors`.
  - Dark: `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png` (`subdomains:'abcd'`) —
    attribution `© OpenStreetMap © CARTO`.
  - Swap the layer on theme change (remove old, add new) or keep both and toggle opacity.
- **Watershed** = the real **georeferenced GeoJSON** basin boundary (keep current delineation +
  subcuencas). Style: `weight:2.5; color: var(--accent); fillColor: var(--accent);
  fillOpacity: light .12 / dark .18; lineJoin:round`. Render the subcuenca divide as a dashed
  polyline (`dashArray:'5 5'`, opacity .7). Trace the main channel in `--rain`-ish (`#2f7da0` /
  `#5cb6d6`), weight 2.5.
- **Station markers** at **real coordinates** via `L.divIcon` (not color-only — audit §4):
  28px circle, status fill, 2px white ring (light) / bright ring (dark), letter label `A`/`B`
  in mono 700. `SIN DATOS` station: dashed ring + panel fill + status-colored text (shape
  fallback). Bind a tooltip: `<b>A</b> · Estación Nivel + Lluvia — NORMAL`.
- **Controls**: keep zoom (`+/−`) and add `L.control.scale({ metric:true, imperial:false })`.
  Keep OSM/CARTO attribution. Restyle all three per theme (see `globals.css` snippet) so they
  match the panel instead of Leaflet's default white boxes.
- **Sizing**: container is fluid width, height `desktop 300 · tablet 354 · mobile 230`px
  (audit §3 — was hardcoded 400). Call `map.invalidateSize()` after mount + on container resize,
  and `fitBounds(watershed.getBounds(), { padding:[16,16] })`.
- **Interactions**: `scrollWheelZoom:false` (so page scroll isn't trapped), zoom buttons + drag on.
- **Performance**: GeoJSON fetched once and cached (audit §8 / next.config headers); memoize
  `getColor`/`getStatus` or move them to `lib/constants.js`.

**Below the map**, in the same panel:
- **ThresholdLegend** — 2-col grid (both desktop & mobile), 4 entries: a 10px status square +
  `LABEL` (mono 600) over its `range` (mono `--ink-3`). Mirrors §4 thresholds.
- **StationCard** ×N (see below).

> The legend appears **both** beside the map (here) and is reinforced by the KPI status pills —
> per requirement "always display the threshold legend next to the map and station panels."

### Station card  (inside map panel)
`flex; align-center; gap 12px; padding 13×16; bg --panel-alt; border 1px solid --border;
radius 7`. A 3px status accent rail on the left edge. 30px circular badge (letter, status-colored,
2px ring). Center: station name (Inter 600) + StatusPill. Right: `NIVEL` and `LLUVIA` micro-labels
(mono 9px `--ink-4`) over mono 600 values + unit. `SIN DATOS` card uses a **dashed** border and
mutes the rainfall/level values to `--ink-4`.

---

## 10. Table Specifications  *(DataTable.jsx — Records)*
Full-width panel, `<section aria-label="Registros recientes">`.

- **Head row**: title `REGISTROS RECIENTES` (h2) + right-side count/note
  `Mostrando 25 de 5.718` (mono `--ink-3`). (Audit §2: explain the cap; don't silently slice 100.)
- **Semantic `<table>`** with `<caption class="sr-only">Registros hidrométricos recientes</caption>`,
  `<thead>` with `scope="col"`, `<tbody>`. Columns:
  | Col | Align | Font | Notes |
  |---|---|---|---|
  | `FECHA / HORA` | left | mono | `dd/MM/yyyy HH:mm` (date-fns es) |
  | `ESTACIÓN` | left | Inter | A / B |
  | `NIVEL (cm)` | right | mono tabular | text color = status of value; trailing small `cm` in `--ink-3` |
  | `LLUVIA (mm)` | right | mono tabular | `--ink` / `--ink-4` if null |
  | `ESTADO` | left | — | StatusPill |
- **Header**: `bg --panel-alt`, mono 600 uppercase 11px `--ink-3`, `position:sticky; top:0`,
  1px bottom border. Body rows: 1px `--border` bottom hairline, row padding `10×14`, zebra optional
  via `--panel-alt` on `:nth-child(even)`. Numeric cells `tabular-nums`.
- **Pagination** (audit P5): footer bar, 25 rows/page, prev/next `Select`-style buttons +
  `Página 1 / 23`. Buttons get focus rings and `aria-label`s; disabled state at bounds.
- **Empty/error**: if no rows → centered `EmptyState` (`Sin registros para el período`); on fetch
  error → `ErrorBanner` (see §12). Never show stale data silently (audit §5).
- Responsive: on mobile the table scrolls horizontally inside the panel
  (`overflow-x:auto`, `min-width:640px` on the `<table>`), keeping the sticky header.

---

## 11. Desktop Layout (`≥ 1280px`)
- App padding 24px, band gap 16px.
- KPI row: `grid-template-columns: repeat(3, 1fr); gap:16px`.
- Main: `grid-template-columns: 1fr 380px; gap:16px; align-items:start`.
  Analysis panel left (chart H≈372). Map panel right (map 300 + legend + station cards).
  Tune chart H so the two columns end at roughly the same height.
- Records table: full width below main.
- Header shows all chips + badge + full clock.

## 12. Tablet Layout (`768–1279px`)
- App padding 16px, band gap 14px.
- KPI row stays `repeat(3, 1fr)` (smaller type per scale).
- Main becomes **one column**: Analysis panel (chart H≈280) **over** Basin Map panel
  (map H≈354 so the basin isn't squashed at full width). Then Records table.
- Header keeps all chips (wraps to two rows if needed).

## 13. Mobile Layout (`< 768px`)
- App padding 14px, band gap 12px.
- **KPIs stack 1-up** (full-width cards) — keeps the big value legible on a phone/projector.
- Single column: Analysis panel (chart H≈230, period select hidden, tab bar scrolls) →
  Basin Map panel (map H≈230, legend 2-col) → Records table (horizontal scroll).
- **Compact header**: wordmark + `INGESTA ACTIVA` chip + theme toggle + short clock; other chips
  and the basin badge hidden.
- Touch targets ≥ 44px (tabs, selects, pagination, zoom buttons, theme toggle).

---

## 14. Accessibility Requirements (audit P0 — do first)
1. **Remove the global `outline:none`** in `globals.css`. Add:
   ```css
   :where(a, button, [role="tab"], input, select, [tabindex]):focus-visible {
     outline: 2px solid var(--focus-ring); outline-offset: 2px; border-radius: 4px;
   }
   ```
2. **Semantic structure**: `<header> <main> <section aria-label> <nav>` instead of bare `<div>`s.
   One `<h1>` (visually-hidden page title "Panel HydroMET — Cuenca Mburicaó"); panels use `<h2>`.
3. **Tabs**: `role="tablist"` / `role="tab"` + `aria-selected`, roving `tabIndex`, arrow-key nav,
   and `aria-controls` → panel `role="tabpanel"`.
4. **Form controls**: every date input / select has an associated `<label>` (visible or
   `sr-only`). The two chart `Select`s get `aria-label`.
5. **Charts**: `role="img"` + descriptive `aria-label`; offer the data table as the text
   alternative. Theme-aware tooltip (no white-on-dark).
6. **Map**: container `role="application"` + `aria-label`; markers reachable (`keyboard:true`)
   with text tooltips; status conveyed by **color + text + shape** (never color alone). The
   threshold legend provides the text key.
7. **Contrast**: all text ≥ WCAG AA on its background (tokens chosen to pass). Min label size 11px.
8. **Status semantics**: consistent terminology `NORMAL / ATENCIÓN / ALERTA / CRÍTICO` everywhere
   (pills, legend, table, markers).
9. **Motion**: respect `prefers-reduced-motion`; no infinite decorative pulses.
10. **Live region**: wrap the auto-refreshing KPI/clock area in `aria-live="polite"` so screen
    readers hear updates without hijacking focus.

## 15. Responsive Requirements
- **CSS/Tailwind breakpoints only** — delete `isMobile` JS resize state and the SSR hydration
  mismatch (audit §3). Markup is identical SSR↔CSR.
- Fluid chart via `ResponsiveContainer`; fluid map via `invalidateSize()` on resize.
- No fixed pixel heights that break on short/tall screens — use the per-breakpoint targets as
  `min-height` and let panels grow.
- Tab bar and table scroll horizontally rather than overflow.
- Verify at 360 / 768 / 1024 / 1280 / 1920 widths and at projector aspect ratios.

---

## 16. Behavior, State & Data (preserve functionality; fix architecture)
- **Polling**: keep the 60s `setInterval` refresh; label it honestly (`SONDEO · 60 s`). Wrap
  fetch in try/catch and surface an **ErrorBanner** (`No se pudieron actualizar los datos —
  reintentando…`, `--st-critico` accent, role="alert") instead of failing silently (audit §5).
- **Unify the date filter** (audit High): remove the dead `dateFrom/dateTo` in `page.js`; the
  Analysis panel's period control should drive a **refetch** (callback or URL search params),
  not just filter already-loaded data. Single source of truth for the active range. Replace the
  fragile `null = all / undefined = custom` three-value state with an explicit enum
  (`'all' | 'custom'` + explicit `{from,to}`).
- **N+1 fix** (audit High): fetch the station list **once** on mount; batch latest-records with a
  single `.in('station_id', ids)` query rather than a per-station loop.
- **Loading state**: skeleton shimmer on KPI values and chart area (respect reduced-motion → static).
- Remove all `console.log` (audit §6); drop unused `amqplib` dep; delete `app/tailwind.config.js`.

---

## Files in this bundle
| File | What it is |
|---|---|
| `README.md` | This spec (self-sufficient). |
| `tokens.css` | Tailwind v4 `@theme` + light/dark CSS variables — paste into `globals.css`. |
| `fonts.ts` | next/font setup (Inter / IBM Plex Sans / IBM Plex Mono). |
| `globals_additions.css` | Focus ring, scrollbars, Leaflet control theming to merge into `globals.css`. |
| `HydroMET Rediseño.html` | The approved interactive design reference (open in a browser). |
| `hm-core.js` | Reference tokens + sample data + chart geometry from the prototype. |
| `hm-chart.jsx` `hm-map.jsx` `hm-dashboard.jsx` | Prototype component source (reference for layout/markup intent). |
| `screenshots/` | Rendered reference frames (desktop light/dark, mobile, map). |

> The HTML/JS prototype is a **reference**, not the implementation. Build the real thing in
> Next.js with Recharts + Leaflet + Tailwind tokens as specified above.
