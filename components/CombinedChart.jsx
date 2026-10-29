'use client'

import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import {
  Line, Bar, Area, ScatterChart, Scatter, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceArea, ReferenceDot,
  Legend, ResponsiveContainer,
} from 'recharts'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { useGrafanaSeries } from '../lib/useGrafanaSeries'
import { UMBRAL_NARANJA, UMBRAL_ROJO, MAX_SIN_DATOS_MS } from '../lib/constants'
import { formatAge } from '../lib/formatAge'

// ─── Constantes editables (pestaña SERIE TEMPORAL) ──────────────────────────

// Rango del eje de nivel, en metros. Si un dato supera NIVEL_MAX_M el eje se
// extiende hasta ese dato para no recortarlo.
const NIVEL_MIN_M = 0
const NIVEL_MAX_M = 4

// Techo fijo del eje de lluvia (derecho), en mm, como el panel de Grafana
// (axis max 50). Barras y línea que lo superen se recortan contra el techo;
// tooltip y leyenda siguen mostrando el valor real.
const LLUVIA_MAX_MM = 50

// Los umbrales de nivel (UMBRAL_NARANJA / UMBRAL_ROJO) y MAX_SIN_DATOS_MS
// están en lib/constants.js, compartidos con tarjetas, mapa y tabla.

// Un hueco mayor a esto entre lecturas corta la línea en vez de unirla.
const GAP_MS = 15 * 60 * 1000

// La agrupación de rangos largos la hace /api/grafana-data en MySQL (buckets
// de 5 min hasta ~7 días, luego de horas; ≤ ~2000 puntos). El cliente dibuja
// esos puntos tal cual, sin reagruparlos.

const MONO    = 'var(--font-mono, "Space Mono", monospace)'
const DISPLAY = 'var(--font-display, "IBM Plex Sans", sans-serif)'

// Module-level style constants: created once, never re-allocated on re-renders.
const SELECT_STYLE = {
  background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--ink-2)',
  borderRadius: 6, padding: '4px 8px', fontSize: 11,
  fontFamily: MONO, cursor: 'pointer', outline: 'none',
}
const INPUT_STYLE = {
  background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--ink)',
  borderRadius: 6, padding: '4px 8px', fontSize: 11,
  fontFamily: MONO, cursor: 'pointer', outline: 'none',
}
const STATE_BOX_STYLE = {
  position: 'absolute', inset: 0, borderRadius: 6,
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  gap: 10, padding: 16, textAlign: 'center', fontFamily: MONO, fontSize: 12,
}
const RETRY_BUTTON_STYLE = {
  background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--ink-2)',
  borderRadius: 6, padding: '4px 10px', fontSize: 11, fontFamily: MONO, cursor: 'pointer',
}
const AXIS_STYLE  = { fill: 'var(--ink-3)', fontSize: 10, fontFamily: MONO }
const GRID_STYLE  = { stroke: 'var(--grid)', strokeDasharray: '3 3' }

// Chart wrapper heights are defined as the .chart-wrapper class in globals.css
// (not as inline styles or Tailwind arbitrary classes) so the browser has an
// explicit pixel height resolved before Recharts' ResizeObserver first fires.

// ─── Tooltip ─────────────────────────────────────────────────────────────────

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--panel)',
      border: '1px solid var(--border)',
      borderRadius: 8, padding: '8px 14px', fontSize: 11,
      fontFamily: MONO, color: 'var(--ink)',
      boxShadow: 'var(--shadow-panel)',
    }}>
      <div style={{ color: 'var(--ink-3)', marginBottom: 6 }}>{label}</div>
      {payload.map(p => p.value != null && (
        <div key={p.name} style={{ color: p.color, marginBottom: 2 }}>
          {p.name}: <strong>{Number(p.value).toFixed(2)}</strong>
        </div>
      ))}
    </div>
  )
}

const sameDay = (a, b) => format(new Date(a), 'yyyy-MM-dd') === format(new Date(b), 'yyyy-MM-dd')
const fmtNum = (v, digits) => (v == null ? '—' : Number(v).toFixed(digits))

const SeriesTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const row = (color, label, value) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
      <span style={{ color: 'var(--ink-2)' }}>{label}</span>
      <strong style={{ marginLeft: 'auto', paddingLeft: 12 }}>{value}</strong>
    </div>
  )
  return (
    <div style={{
      background: 'var(--panel)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '8px 12px', fontSize: 11,
      fontFamily: MONO, color: 'var(--ink)', boxShadow: 'var(--shadow-panel)',
    }}>
      {/* Grouped points: show the group's time span; values are the plotted
          ones (maxima of the group, each with the time it happened). */}
      <div style={{ color: 'var(--ink-3)', marginBottom: 6 }}>
        {d.n > 1
          ? `${format(new Date(d.tStart), 'dd/MM/yyyy HH:mm', { locale: es })}–${format(new Date(d.tEnd), sameDay(d.tStart, d.tEnd) ? 'HH:mm' : 'dd/MM HH:mm', { locale: es })} · ${d.n} lecturas`
          : format(new Date(d.t), 'dd/MM/yyyy HH:mm', { locale: es })}
      </div>
      {d.nivel != null && row('var(--chart-level)', d.n > 1 ? `Nivel máx. (${format(new Date(d.t), 'HH:mm')})` : 'Nivel', `${fmtNum(d.nivel, 2)} m`)}
      {d.lluvia != null && row('var(--chart-rain)', d.n > 1 ? 'Lluvia máx. 5 min' : 'Lluvia 5 min', `${fmtNum(d.lluvia, 1)} mm`)}
      {d.acum1h != null && row('var(--chart-rain-acc)', d.n > 1 ? `Lluvia Acumulada 1h máx. (${format(new Date(d.tAcum), 'HH:mm')})` : 'Lluvia Acumulada 1h', `${fmtNum(d.acum1h, 2)} mm`)}
    </div>
  )
}

function LegendItem({ swatch, label, stat }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {swatch}
      <span style={{ fontSize: 11, color: 'var(--ink-2)', fontFamily: MONO }}>{label}</span>
      {stat && <span style={{ fontSize: 11, color: 'var(--ink)', fontFamily: MONO, fontWeight: 600 }}>{stat}</span>}
    </div>
  )
}

// Instant-rain bars are drawn at a fixed width, centred on their time. On a
// numeric time axis Recharts caps bar width at the smallest pixel gap between
// points (~1.5 px for 600 points), which made them sub-pixel and invisible.
const RAIN_BAR_PX = 4
function RainBarShape({ x, y, width, height, fill }) {
  if (x == null || !height) return null
  const top = height < 0 ? y + height : y
  return <rect x={x + width / 2 - RAIN_BAR_PX / 2} y={top} width={RAIN_BAR_PX} height={Math.abs(height)} fill={fill} rx={1} />
}

const LINE_SWATCH = color => <div style={{ width: 18, height: 2, flexShrink: 0, background: color }} />
const BAR_SWATCH  = color => <div style={{ width: 8, height: 10, flexShrink: 0, background: color, borderRadius: '2px 2px 0 0' }} />

// ─── Custom legend (replaces Recharts <Legend> for time-series / daily tabs)──

function ChartLegend({ showRain = true, showLevel = true }) {
  return (
    <div style={{
      display: 'flex', gap: 16, padding: '6px 4px 0',
      alignItems: 'center', flexWrap: 'wrap',
    }}>
      {showRain && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 12, height: 8, flexShrink: 0, background: 'var(--rain)', borderRadius: 2, opacity: 0.85 }} />
          <span style={{ fontSize: 11, color: 'var(--ink-2)', fontFamily: MONO }}>Lluvia (mm)</span>
        </div>
      )}
      {showLevel && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 20, height: 2, flexShrink: 0, background: 'var(--level)' }} />
          <span style={{ fontSize: 11, color: 'var(--ink-2)', fontFamily: MONO }}>Nivel máx. (m)</span>
        </div>
      )}
    </div>
  )
}

// ─── Constants ────────────────────────────────────────────────────────────────

// /api/grafana-data acepta cualquier rango dentro de la tabla (desde su
// primera lectura); los largos llegan ya agrupados.
const RANGE_PRESETS = [
  { key: '1d',     label: 'Últimas 24 h'    },
  { key: '7d',     label: 'Últimos 7D'      },
  { key: '14d',    label: 'Últimos 14D'     },
  { key: '30d',    label: 'Últimos 30D'     },
  { key: 'all',    label: 'Todo el período' },
  { key: 'custom', label: 'Personalizado'   },
]
const DEFAULT_RANGE = '7d'

// Presets go to the route as relative values ('now-7d'), so the request URL
// is the same on every poll and the 60 s CDN cache can serve it.
function rangeToQuery(rangeKey, customFrom, customTo) {
  if (rangeKey === 'all') return { from: 'inicio', to: 'now' }
  if (rangeKey === 'custom' && customFrom) {
    // An inverted pick ("Desde" after "Hasta") is swapped instead of being
    // sent as-is, which the route rejects with '"from" debe ser anterior a "to"'.
    const [desde, hasta] = customTo && customTo < customFrom ? [customTo, customFrom] : [customFrom, customTo]
    return {
      from: String(new Date(desde + 'T00:00:00').getTime()),
      to:   hasta ? String(new Date(hasta + 'T23:59:59').getTime()) : 'now',
    }
  }
  const key = rangeKey === 'custom' ? DEFAULT_RANGE : rangeKey
  return { from: `now-${key}`, to: 'now' }
}

// Points from the route (already grouped server-side) → plotted points. The
// only change is a null point wherever readings are missing for longer than
// GAP_MS (or two buckets), so the line breaks instead of bridging the gap.
function withGaps(puntos, bucketMs) {
  const out = []
  let prevEnd = null
  for (const p of puntos) {
    const start = p.tStart ?? p.t
    if (prevEnd != null && start - prevEnd > Math.max(GAP_MS, 2 * bucketMs)) {
      out.push({ t: prevEnd + 1, n: 0, nivel: null, lluvia: null, acum1h: null })
    }
    out.push(p)
    prevEnd = p.tEnd ?? p.t
  }
  return out
}

// ─── Fuente Supabase (desactivada) ───────────────────────────────────────────
// Convierte los registros horarios de get_records_sampled (props levelData /
// rainData de page.js) al mismo formato { t, nivel, lluvia, acum1h } que
// devuelve /api/grafana-data. Para volver a graficar datos propios, usar
// seriesFromSupabase(levelData, rainData) como `puntos` en lugar de
// useGrafanaSeries.

// Pese al nombre, la columna water_level_cm de Supabase guarda METROS.
const NIVEL_A_METROS = 1
// La estación de lluvia reporta cada 5 min y el RPC devuelve el promedio por
// hora, así que lo acumulado en esa hora ≈ promedio × 12.
const REGISTROS_POR_HORA = 12

export function seriesFromSupabase(levelData, rainData) {
  const byT = {}
  const at = ts => (byT[ts] ??= { t: new Date(ts).getTime(), nivel: null, lluvia: null, acum1h: null })
  levelData.forEach(r => {
    if (r.water_level_cm != null) at(r.timestamp).nivel = Number(r.water_level_cm) * NIVEL_A_METROS
  })
  rainData.forEach(r => {
    const p = at(r.timestamp)
    const max = r.precipitation_max_mm ?? r.precipitation_mm
    if (max != null) p.lluvia = Math.max(0, Number(max))
    if (r.precipitation_mm != null) p.acum1h = Math.max(0, Number(r.precipitation_mm) * REGISTROS_POR_HORA)
  })
  return Object.values(byT).sort((a, b) => a.t - b.t)
}

const TABS = [
  { key: 'timeseries',  label: 'SERIE TEMPORAL'   },
  { key: 'daily',       label: 'BARRAS DIARIAS'   },
  { key: 'correlation', label: 'CORRELACIÓN'      },
  { key: 'comparison',  label: 'COMP. ESTACIONES' },
]

const COMPARISON_COLORS = [
  'var(--level)', 'var(--rain)', 'var(--st-atencion)', 'var(--st-alerta)', 'var(--st-normal)',
]

// ─── Component ────────────────────────────────────────────────────────────────

// levelData / rainData / stations (Supabase) only feed the COMP. ESTACIONES
// tab; every other tab plots the Grafana series.
export default function CombinedChart({ levelData, rainData, stations }) {
  const [activeTab, setActiveTab] = useState('timeseries')
  const [variable, setVariable]   = useState('both')
  const showNivel  = variable !== 'lluvia'
  const showLluvia = variable !== 'nivel'

  const [rangeKey, setRangeKey]     = useState(DEFAULT_RANGE)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo]     = useState('')
  const onRangeChange = useCallback(key => {
    setRangeKey(key)
    if (key !== 'custom') { setCustomFrom(''); setCustomTo('') }
  }, [])

  const query = rangeToQuery(rangeKey, customFrom, customTo)
  const { data, error, loading, retrying, retry } = useGrafanaSeries(query.from, query.to)
  const puntos = useMemo(() => data?.puntos ?? [], [data])

  // Ticks every 30 s so "último dato hace X" keeps aging between polls.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])
  const lastAge = data?.ultimo != null ? Math.max(0, now - data.ultimo) : null
  const isStale = lastAge != null && lastAge > MAX_SIN_DATOS_MS

  // Ref array for roving tabIndex focus management
  const tabRefs = useRef([])

  // ── Event handlers ──────────────────────────────────────────────────────────

  // ARIA tabs pattern: left/right arrow keys cycle focus and activate tabs
  const handleTabKey = useCallback((e, idx) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      const next = (idx + 1) % TABS.length
      setActiveTab(TABS[next].key)
      tabRefs.current[next]?.focus()
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      const prev = (idx - 1 + TABS.length) % TABS.length
      setActiveTab(TABS[prev].key)
      tabRefs.current[prev]?.focus()
    }
  }, [])

  // COMP. ESTACIONES still compares the Supabase stations.
  const filteredLevel = levelData
  const filteredRain  = rainData

  // ── Chart data memos ────────────────────────────────────────────────────────

  const lecturas = useMemo(() => puntos.reduce((sum, p) => sum + (p.n ?? 1), 0), [puntos])

  const fromMs = data?.from ?? null
  const toMs   = data?.to   ?? null

  const chartData = useMemo(
    () => withGaps(puntos, (data?.bucketSeg ?? 300) * 1000),
    [puntos, data?.bucketSeg]
  )

  // Maxima of the plotted points, so the legend and the max-level marker show
  // exactly what is drawn (grouping keeps every series' maximum, so these are
  // also the real maxima of the range).
  const maxima = useMemo(() => {
    let level = null, rain = null, acum = null
    for (const p of chartData) {
      if (p.nivel != null && (level == null || p.nivel > level.value)) level = { value: p.nivel, t: p.t }
      if (p.lluvia != null && (rain == null || p.lluvia > rain)) rain = p.lluvia
      if (p.acum1h != null && (acum == null || p.acum1h > acum)) acum = p.acum1h
    }
    return { level, rain, acum }
  }, [chartData])

  // Keep the max label inside the plot: near either edge it goes beside the
  // dot (toward the center) instead of centered above it.
  const maxLabelPosition = useMemo(() => {
    if (!maxima.level || fromMs == null || toMs <= fromMs) return 'top'
    const frac = (maxima.level.t - fromMs) / (toMs - fromMs)
    return frac > 0.8 ? 'left' : frac < 0.2 ? 'right' : 'top'
  }, [maxima, fromMs, toMs])

  // HH:MM ticks as in the reference; the date is added when the range spans
  // more than a day and a half, otherwise the same hour on different days is
  // ambiguous.
  const tickFormat = useMemo(() => {
    const span = fromMs == null ? 0 : toMs - fromMs
    const pattern = span > 36 * 3600 * 1000 ? 'dd/MM HH:mm' : 'HH:mm'
    return t => format(new Date(t), pattern, { locale: es })
  }, [fromMs, toMs])

  const dailyData = useMemo(() => {
    if (activeTab !== 'daily') return []
    // Key de agrupacion 'yyyy-MM-dd' (con año): ordena cronologicamente con .sort()
    // y evita que el mismo dia/mes de años distintos se sumen en la misma barra.
    // 'time' guarda la etiqueta a mostrar, separada del key de agrupacion/orden.
    const byDay = {}
    puntos.forEach(p => {
      const d = new Date(p.t)
      const key = format(d, 'yyyy-MM-dd')
      if (!byDay[key]) byDay[key] = { time: format(d, 'dd/MM/yy', { locale: es }), lluvia: 0, nivel: null }
      // lluviaSuma = total of the bucket's readings (lluvia is only its max)
      if (p.lluviaSuma != null) byDay[key].lluvia += p.lluviaSuma
      else if (p.lluvia != null) byDay[key].lluvia += p.lluvia
      if (p.nivel != null) byDay[key].nivel = Math.max(byDay[key].nivel ?? -Infinity, p.nivel)
    })
    return Object.keys(byDay).sort().map(key => byDay[key])
  }, [activeTab, puntos])

  const scatterData = useMemo(() => {
    if (activeTab !== 'correlation') return []
    // Same station and timestamp for both variables, so each reading is a pair.
    // 1 h accumulation vs level: a single 5-min reading barely relates to level.
    const pairs = puntos.filter(p => p.acum1h != null && p.nivel != null)
    const step = Math.max(1, Math.ceil(pairs.length / 300))
    return pairs.filter((_, i) => i % step === 0).map(p => ({ lluvia: p.acum1h, nivel: p.nivel }))
  }, [activeTab, puntos])

  // Level axis: fixed NIVEL_MIN_M–NIVEL_MAX_M so the alert bands stay put,
  // extended upward only when a value would otherwise be clipped.
  const levelDomain = useMemo(() => {
    const peak = maxima.level?.value ?? 0
    const top = peak > NIVEL_MAX_M ? Math.ceil(peak * 1.1 * 2) / 2 : NIVEL_MAX_M
    return [NIVEL_MIN_M, top]
  }, [maxima])

  // Fixed rain axis (see LLUVIA_MAX_MM); allowDataOverflow on the axis keeps
  // the domain from growing and clips taller marks at the plot edge.
  const rainDomain = [0, LLUVIA_MAX_MM]
  // Five even steps up to the ceiling (0, 10 … 50), so the top tick is the cap.
  const RAIN_TICKS = [0, 1, 2, 3, 4, 5].map(i => (LLUVIA_MAX_MM * i) / 5)

  // Station comparison — only computed when that tab is active
  const comparisonData = useMemo(() => {
    if (activeTab !== 'comparison') return []
    return [
    {
      name: 'Máximos',
      ...Object.fromEntries(
        (stations || []).map(s => [
          'STN ' + s.station_code,
          s.sensor_type === 'nivel'
            ? filteredLevel.map(r => r.water_level_cm).filter(v => v != null).map(Number).reduce((a, b) => Math.max(a, b), 0)
            : filteredRain.map(r => r.precipitation_mm).filter(v => v != null).map(Number).reduce((a, b) => Math.max(a, b), 0),
        ])
      ),
    },
    {
      name: 'Promedios',
      ...Object.fromEntries(
        (stations || []).map(s => {
          const vals = s.sensor_type === 'nivel'
            ? filteredLevel.map(r => r.water_level_cm).filter(v => v != null).map(Number)
            : filteredRain.map(r => r.precipitation_mm).filter(v => v != null).map(Number)
          return ['STN ' + s.station_code, vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0]
        })
      ),
    },
  ]
  }, [activeTab, stations, filteredLevel, filteredRain])

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', minWidth: 0, boxShadow: 'var(--shadow-panel)' }}>

      {/* ── Panel header: title + variable select + period select (md+) ─── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px', borderBottom: '1px solid var(--border)',
        gap: 8, flexWrap: 'wrap',
      }}>
        <h2 style={{
          fontSize: 11, fontWeight: 600, margin: 0,
          color: 'var(--ink-2)', fontFamily: DISPLAY, letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}>
          Análisis de series temporales
        </h2>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label htmlFor="chart-var-select" className="sr-only">Variable</label>
          <select
            id="chart-var-select"
            value={variable}
            onChange={e => setVariable(e.target.value)}
            style={SELECT_STYLE}
          >
            <option value="both">Nivel + Lluvia</option>
            <option value="nivel">Solo Nivel</option>
            <option value="lluvia">Solo Lluvia</option>
          </select>

          {/* Period select — always in header, wraps on narrow screens */}
          <label htmlFor="chart-period-select" className="sr-only">Período</label>
          <select
            id="chart-period-select"
            value={rangeKey}
            onChange={e => onRangeChange(e.target.value)}
            style={SELECT_STYLE}
          >
            {RANGE_PRESETS.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </div>
      </div>

      {/* ── Tab bar: role=tablist, overflow scrolls on narrow screens ─────── */}
      <div
        role="tablist"
        aria-label="Tipo de análisis"
        style={{
          display: 'flex',
          overflowX: 'auto',
          borderBottom: '1px solid var(--border)',
          padding: '0 16px',
        }}
      >
        {TABS.map((tab, i) => {
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              ref={el => { tabRefs.current[i] = el }}
              role="tab"
              id={`chart-tab-${tab.key}`}
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActiveTab(tab.key)}
              onKeyDown={e => handleTabKey(e, i)}
              style={{
                padding: '10px 14px', fontSize: 11, cursor: 'pointer',
                fontFamily: MONO, letterSpacing: '0.04em', whiteSpace: 'nowrap',
                background: 'transparent',
                color: isActive ? 'var(--accent)' : 'var(--ink-3)',
                border: 'none',
                borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: '-1px',
                fontWeight: isActive ? 600 : 500,
                transition: 'color 0.15s',
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>


{/* ── Custom date range inputs (shown when 'custom' is selected) ───── */}
      {rangeKey === 'custom' && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          padding: '8px 16px', borderBottom: '1px solid var(--border)',
        }}>
          <label htmlFor="chart-date-from" className="sr-only">Fecha desde</label>
          <input
            id="chart-date-from"
            type="date"
            value={customFrom}
            max={customTo || undefined}
            onChange={e => setCustomFrom(e.target.value)}
            style={INPUT_STYLE}
          />
          <span style={{ fontSize: 10, color: 'var(--ink-3)', fontFamily: MONO }}>→</span>
          <label htmlFor="chart-date-to" className="sr-only">Fecha hasta</label>
          <input
            id="chart-date-to"
            type="date"
            value={customTo}
            min={customFrom || undefined}
            onChange={e => setCustomTo(e.target.value)}
            style={INPUT_STYLE}
          />
        </div>
      )}

      {/* ── Source + freshness line ───────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 8, flexWrap: 'wrap', padding: '8px 20px 0', fontSize: 10, fontFamily: MONO,
      }}>
        <span style={{ color: 'var(--ink-3)' }}>
          {activeTab === 'comparison'
            ? `Supabase · ${filteredLevel.length} registros nivel · ${filteredRain.length} registros lluvia`
            : `Grafana · Colegio SIL · ${lecturas} lecturas${data?.bucketSeg > 300 ? ` · agrupadas cada ${data.bucketSeg / 3600} h (${puntos.length} puntos)` : ''}`}
        </span>
        {lastAge != null && (
          <span
            title={`Última lectura: ${format(new Date(data.ultimo), 'dd/MM/yyyy HH:mm', { locale: es })}`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '2px 8px', borderRadius: 4,
              color:      isStale ? 'var(--st-alerta)'      : 'var(--ink-2)',
              background: isStale ? 'var(--st-alerta-soft)' : 'transparent',
              border: `1px solid ${isStale ? 'var(--st-alerta)' : 'var(--border)'}`,
            }}
          >
            <span aria-hidden="true" style={{
              width: 6, height: 6, borderRadius: '50%',
              background: isStale ? 'var(--st-alerta)' : 'var(--st-normal)',
            }} />
            Último dato hace {formatAge(lastAge)}{isStale && ' · sin lecturas nuevas'}
          </span>
        )}
      </div>

      {/* Poll failed but an earlier response is still on screen */}
      {error && data && activeTab !== 'comparison' && (
        <div role="alert" style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          margin: '8px 20px 0', padding: '6px 10px', borderRadius: 6,
          background: 'var(--st-critico-soft)', border: '1px solid var(--st-critico)',
          fontSize: 11, fontFamily: MONO, color: 'var(--st-critico)',
        }}>
          No se pudo actualizar desde Grafana ({error}); se muestran los últimos datos recibidos.
          <button onClick={retry} disabled={retrying} style={RETRY_BUTTON_STYLE}>
            {retrying ? 'Reintentando…' : 'Reintentar'}
          </button>
        </div>
      )}

      {/* ── Chart panels ─────────────────────────────────────────────────── */}
      <div style={{ padding: '8px 12px 12px' }}>

        {/* Loading / error / empty states for the Grafana-fed tabs */}
        {activeTab !== 'comparison' && (loading || !data || !puntos.length) && (
          <div className="chart-wrapper" style={{ position: 'relative' }}>
            {loading && !error && (
              <div className="skel" style={{
                ...STATE_BOX_STYLE, color: 'var(--ink-3)',
              }}>
                Cargando datos de Grafana…
              </div>
            )}
            {error && !data && (
              <div role="alert" style={{
                ...STATE_BOX_STYLE,
                background: 'var(--st-critico-soft)', border: '1px solid var(--st-critico)',
                color: 'var(--st-critico)',
              }}>
                <div>No se pudieron obtener los datos de Grafana.</div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)', maxWidth: 440 }}>{error}</div>
                <button onClick={retry} disabled={retrying} style={RETRY_BUTTON_STYLE}>
                  {retrying ? 'Reintentando…' : 'Reintentar'}
                </button>
              </div>
            )}
            {data && !puntos.length && (
              <div style={{
                ...STATE_BOX_STYLE, border: '1px dashed var(--border)', color: 'var(--ink-2)',
              }}>
                <div>Sin datos en el rango seleccionado.</div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                  {format(new Date(data.from), 'dd/MM HH:mm', { locale: es })} → {format(new Date(data.to), 'dd/MM HH:mm', { locale: es })}
                  {data.ultimo != null && ` · última lectura: ${format(new Date(data.ultimo), 'dd/MM/yyyy HH:mm', { locale: es })}`}
                </div>
              </div>
            )}
          </div>
        )}

        {/* SERIE TEMPORAL — level line (left) and rainfall bars (right), both baseline at 0 */}
        {activeTab === 'timeseries' && puntos.length > 0 && (
          <section
            id="chart-panel-timeseries"
            role="tabpanel"
            aria-labelledby="chart-tab-timeseries"
          >
            <div
              role="img"
              aria-label={`Serie temporal de nivel y lluvia, Colegio SIL: ${lecturas} lecturas`}
              className="chart-wrapper"
            >
              <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: -1, height: 1 }}>
                <ComposedChart data={chartData} margin={{ top: 22, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid {...GRID_STYLE} vertical={false} />

                  {/* Real time scale over the requested range, so data gaps and
                      the empty tail before "now" are visible as such */}
                  <XAxis
                    dataKey="t"
                    type="number"
                    scale="time"
                    domain={[fromMs, toMs]}
                    allowDataOverflow
                    tickFormatter={tickFormat}
                    tick={AXIS_STYLE}
                    tickLine={false}
                    axisLine={{ stroke: 'var(--border-strong)' }}
                    minTickGap={48}
                  />

                  {/* Left Y — water level in meters, fixed range (see NIVEL_*_M) */}
                  {showNivel && (
                    <YAxis
                      yAxisId="nivel"
                      orientation="left"
                      domain={levelDomain}
                      allowDataOverflow
                      tick={AXIS_STYLE}
                      tickFormatter={v => v.toFixed(1)}
                      tickLine={false}
                      axisLine={false}
                      width={44}
                      label={{ value: 'NIVEL · m', angle: -90, position: 'insideLeft', fill: 'var(--ink-3)', fontSize: 9, dx: -2 }}
                    />
                  )}

                  {/* Right Y — rainfall (instant bars + 1 h accumulated line) */}
                  {showLluvia && (
                    <YAxis
                      yAxisId="lluvia"
                      orientation="right"
                      domain={rainDomain}
                      allowDataOverflow
                      ticks={RAIN_TICKS}
                      tick={AXIS_STYLE}
                      tickLine={false}
                      axisLine={false}
                      width={40}
                      label={{ value: 'LLUVIA · mm', angle: 90, position: 'insideRight', fill: 'var(--ink-3)', fontSize: 9, dx: 6 }}
                    />
                  )}

                  {/* Alert bands: orange between the thresholds, red above */}
                  {showNivel && UMBRAL_NARANJA < levelDomain[1] && (
                    <ReferenceArea
                      yAxisId="nivel" y1={UMBRAL_NARANJA} y2={Math.min(UMBRAL_ROJO, levelDomain[1])}
                      fill="var(--st-alerta)" fillOpacity={0.12} stroke="none" ifOverflow="hidden"
                      label={{ value: 'Alerta', position: 'insideTopLeft', fill: 'var(--ink-2)', fontSize: 10, fontFamily: MONO }}
                    />
                  )}
                  {showNivel && UMBRAL_ROJO < levelDomain[1] && (
                    <ReferenceArea
                      yAxisId="nivel" y1={UMBRAL_ROJO} y2={levelDomain[1]}
                      fill="var(--st-critico)" fillOpacity={0.14} stroke="none" ifOverflow="hidden"
                      label={{ value: 'Crítico', position: 'insideTopLeft', fill: 'var(--ink-2)', fontSize: 10, fontFamily: MONO }}
                    />
                  )}
                  {showNivel && UMBRAL_NARANJA < levelDomain[1] && (
                    <ReferenceLine yAxisId="nivel" y={UMBRAL_NARANJA} stroke="var(--st-alerta)" strokeDasharray="4 3" strokeOpacity={0.7} />
                  )}
                  {showNivel && UMBRAL_ROJO < levelDomain[1] && (
                    <ReferenceLine yAxisId="nivel" y={UMBRAL_ROJO} stroke="var(--st-critico)" strokeDasharray="4 3" strokeOpacity={0.7} />
                  )}

                  <Tooltip content={<SeriesTooltip />} cursor={{ stroke: 'var(--border-strong)', strokeWidth: 1 }} />

                  {showLluvia && (
                    <Line
                      yAxisId="lluvia"
                      type="monotone"
                      dataKey="acum1h"
                      name="Lluvia Acumulada 1h (mm)"
                      stroke="var(--chart-rain-acc)"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: 'var(--chart-rain-acc)', stroke: 'var(--panel)', strokeWidth: 2 }}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  )}

                  {/* Instant-rain bars after the 1 h line so they draw on top of it */}
                  {showLluvia && (
                    <Bar
                      yAxisId="lluvia"
                      dataKey="lluvia"
                      name="Lluvia instantánea"
                      fill="var(--chart-rain)"
                      shape={RainBarShape}
                      isAnimationActive={false}
                    />
                  )}

                  {/* Level: green line over a faint area */}
                  {showNivel && (
                    <Area
                      yAxisId="nivel"
                      type="monotone"
                      dataKey="nivel"
                      name="Nivel"
                      stroke="var(--chart-level)"
                      strokeWidth={2}
                      fill="var(--chart-level)"
                      fillOpacity={0.12}
                      baseValue={NIVEL_MIN_M}
                      dot={false}
                      activeDot={{ r: 4, fill: 'var(--chart-level)', stroke: 'var(--panel)', strokeWidth: 2 }}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  )}

                  {/* Max level marker: highest reading in the range, with value and time */}
                  {showNivel && maxima.level && (
                    <ReferenceDot
                      yAxisId="nivel"
                      x={maxima.level.t}
                      y={maxima.level.value}
                      r={5}
                      fill="var(--chart-level)"
                      stroke="var(--panel)"
                      strokeWidth={2}
                      ifOverflow="extendDomain"
                      label={{
                        value: `Máx ${maxima.level.value.toFixed(2)} m · ${tickFormat(maxima.level.t)}`,
                        position: maxLabelPosition, offset: 8,
                        fill: 'var(--ink)', fontSize: 10, fontFamily: MONO, fontWeight: 600,
                      }}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div style={{ display: 'flex', gap: 18, padding: '8px 4px 0', alignItems: 'center', flexWrap: 'wrap' }}>
              {showNivel && (
                <LegendItem
                  swatch={LINE_SWATCH('var(--chart-level)')}
                  label="Nivel (m)"
                  stat={`Nivel Max: ${fmtNum(maxima.level?.value, 2)}`}
                />
              )}
              {showLluvia && (
                <LegendItem
                  swatch={BAR_SWATCH('var(--chart-rain)')}
                  label="Lluvia instantánea (mm / 5 min)"
                  stat={`Lluvia Max: ${fmtNum(maxima.rain, 1)}`}
                />
              )}
              {showLluvia && (
                <LegendItem
                  swatch={LINE_SWATCH('var(--chart-rain-acc)')}
                  label="Lluvia Acumulada 1h (mm)"
                  stat={`Max: ${fmtNum(maxima.acum, 2)}`}
                />
              )}
            </div>
          </section>
        )}

        {/* BARRAS DIARIAS */}
        {activeTab === 'daily' && puntos.length > 0 && (
          <section
            id="chart-panel-daily"
            role="tabpanel"
            aria-labelledby="chart-tab-daily"
          >
            <div
              role="img"
              aria-label="Barras diarias de lluvia acumulada y nivel máximo"
              className="chart-wrapper"
            >
              <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: -1, height: 1 }}>
                <ComposedChart data={dailyData} margin={{ top: 8, right: 52, left: 0, bottom: 0 }}>
                  <CartesianGrid {...GRID_STYLE} vertical={false} />
                  <XAxis
                    dataKey="time"
                    tick={{ fill: 'var(--ink-3)', fontSize: 10, fontFamily: MONO }}
                    tickLine={false}
                    axisLine={{ stroke: 'var(--border-strong)' }}
                    minTickGap={32}
                    angle={-20}
                    textAnchor="end"
                    height={40}
                  />
                  <YAxis
                    yAxisId="lluvia"
                    orientation="left"
                    tick={AXIS_STYLE} tickLine={false} axisLine={false} width={44}
                    label={{ value: 'mm/día', angle: -90, position: 'insideLeft', fill: 'var(--ink-3)', fontSize: 9, dx: -2 }}
                  />
                  <YAxis
                    yAxisId="nivel"
                    orientation="right"
                    tick={AXIS_STYLE} tickLine={false} axisLine={false} width={40}
                    label={{ value: 'Nivel máx · m', angle: 90, position: 'insideRight', fill: 'var(--ink-3)', fontSize: 9, dx: 6 }}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar
                    yAxisId="lluvia" dataKey="lluvia" name="Lluvia Acum. Diaria (mm)"
                    fill="var(--rain)" fillOpacity={0.7} maxBarSize={14} radius={[2, 2, 0, 0]}
                    isAnimationActive={false}
                  />
                  <Line
                    yAxisId="nivel" type="monotone" dataKey="nivel" name="Nivel Max (m)"
                    stroke="var(--level)" strokeWidth={2}
                    dot={{ r: 3, fill: 'var(--level)', strokeWidth: 0 }}
                    connectNulls isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <ChartLegend showLevel />
          </section>
        )}

        {/* CORRELACIÓN */}
        {activeTab === 'correlation' && puntos.length > 0 && (
          <section
            id="chart-panel-correlation"
            role="tabpanel"
            aria-labelledby="chart-tab-correlation"
          >
            <div
              role="img"
              aria-label={`Dispersión de ${scatterData.length} pares lluvia-nivel`}
              className="chart-wrapper"
            >
              <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: -1, height: 1 }}>
                <ScatterChart margin={{ top: 8, right: 20, left: 0, bottom: 24 }}>
                  <CartesianGrid {...GRID_STYLE} />
                  <XAxis
                    dataKey="lluvia" name="Lluvia"
                    tick={AXIS_STYLE} tickLine={false} axisLine={false}
                    label={{ value: 'Lluvia Acumulada 1h (mm)', position: 'insideBottom', fill: 'var(--ink-3)', fontSize: 10, dy: 18 }}
                  />
                  <YAxis
                    dataKey="nivel" name="Nivel"
                    tick={AXIS_STYLE} tickLine={false} axisLine={false} width={44}
                    label={{ value: 'Nivel (m)', angle: -90, position: 'insideLeft', fill: 'var(--ink-3)', fontSize: 10, dx: -2 }}
                  />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3', stroke: 'var(--border)' }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const d = payload[0].payload
                      return (
                        <div style={{
                          background: 'var(--panel)', border: '1px solid var(--border)',
                          borderRadius: 8, padding: '8px 12px', fontSize: 11,
                          fontFamily: MONO, color: 'var(--ink)',
                          boxShadow: 'var(--shadow-panel)',
                        }}>
                          <div style={{ color: 'var(--rain)' }}>Lluvia Acumulada 1h: {d.lluvia?.toFixed(2)} mm</div>
                          <div style={{ color: 'var(--level)' }}>Nivel: {d.nivel?.toFixed(2)} m</div>
                        </div>
                      )
                    }}
                  />
                  <Scatter data={scatterData} fill="var(--rain)" fillOpacity={0.5} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        {/* COMP. ESTACIONES */}
        {activeTab === 'comparison' && (
          <section
            id="chart-panel-comparison"
            role="tabpanel"
            aria-labelledby="chart-tab-comparison"
          >
            <div
              role="img"
              aria-label="Comparación de máximos y promedios por estación"
              className="chart-wrapper"
            >
              <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: -1, height: 1 }}>
                <ComposedChart data={comparisonData} margin={{ top: 8, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid {...GRID_STYLE} vertical={false} />
                  <XAxis dataKey="name" tick={AXIS_STYLE} tickLine={false} axisLine={false} />
                  <YAxis tick={AXIS_STYLE} tickLine={false} axisLine={false} width={44} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 10, color: 'var(--ink-2)', paddingTop: 8, fontFamily: MONO }} />
                  {(stations || []).map((s, i) => (
                    <Bar
                      key={s.station_code}
                      dataKey={'STN ' + s.station_code}
                      fill={COMPARISON_COLORS[i % COMPARISON_COLORS.length]}
                      fillOpacity={0.8}
                      maxBarSize={40}
                      radius={[3, 3, 0, 0]}
                      isAnimationActive={false}
                    />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

      </div>
    </div>
  )
}
