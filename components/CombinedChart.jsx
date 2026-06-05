'use client'

import { useState, useMemo, useRef, useCallback } from 'react'
import {
  Line, Bar, ScatterChart, Scatter, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  Legend, ResponsiveContainer,
} from 'recharts'
import { format, subDays } from 'date-fns'
import { es } from 'date-fns/locale'

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
          <span style={{ fontSize: 11, color: 'var(--ink-2)', fontFamily: MONO }}>Nivel (cm)</span>
        </div>
      )}
    </div>
  )
}

// ─── Constants ────────────────────────────────────────────────────────────────

const RANGE_PRESETS = [
  { key: '7d',     label: 'Últimos 7D'      },
  { key: '14d',    label: 'Últimos 14D'     },
  { key: '30d',    label: 'Últimos 30D'     },
  { key: '60d',    label: 'Últimos 60D'     },
  { key: 'all',    label: 'Todo el período' },
  { key: 'custom', label: 'Personalizado'   },
]

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

export default function CombinedChart({ levelData, rainData, stationLevel, stationRain, stations }) {
  const [activeTab, setActiveTab] = useState('timeseries')
  const [variable, setVariable]   = useState('both')

  // Clean filter state: explicit string enum replaces the old null / undefined tri-state
  // 'all' | '7d' | '14d' | '30d' | '60d' | 'custom'
  const [rangeKey, setRangeKey]     = useState('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo]     = useState('')

  // Ref array for roving tabIndex focus management
  const tabRefs = useRef([])

  // ── Event handlers ──────────────────────────────────────────────────────────

  const handleRangeChange = useCallback((key) => {
    setRangeKey(key)
    if (key !== 'custom') { setCustomFrom(''); setCustomTo('') }
  }, [])

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

  // ── Data filtering ──────────────────────────────────────────────────────────

  function filterData(data) {
    if (rangeKey === 'all') return data
    if (rangeKey === 'custom') {
      if (!customFrom) return data
      const from = new Date(customFrom + 'T00:00:00').toISOString()
      const to   = customTo ? new Date(customTo + 'T23:59:59').toISOString() : new Date().toISOString()
      return data.filter(r => r.timestamp >= from && r.timestamp <= to)
    }
    const days = parseInt(rangeKey)
    const from = subDays(new Date(), days).toISOString()
    return data.filter(r => r.timestamp >= from)
  }

  const filteredLevel = useMemo(() => filterData(levelData), [levelData, rangeKey, customFrom, customTo])
  const filteredRain  = useMemo(() => filterData(rainData),  [rainData,  rangeKey, customFrom, customTo])

  // ── Chart data memos (logic unchanged from previous implementation) ─────────

  const chartData = useMemo(() => {
    const levelMap = {}
    filteredLevel.forEach(r => {
      const key = format(new Date(r.timestamp), 'dd/MM HH:mm', { locale: es })
      levelMap[key] = r.water_level_cm
    })
    const rainMap = {}
    filteredRain.forEach(r => {
      const key = format(new Date(r.timestamp), 'dd/MM HH:mm', { locale: es })
      rainMap[key] = r.precipitation_mm
    })
    const allKeys = Array.from(new Set([...Object.keys(levelMap), ...Object.keys(rainMap)])).sort()
    let keys = allKeys
    if (allKeys.length > 600) {
      const step = Math.ceil(allKeys.length / 600)
      keys = allKeys.filter((_, i) => i % step === 0)
    }
    return keys.map(k => ({ time: k, nivel: levelMap[k] ?? null, lluvia: rainMap[k] ?? null }))
  }, [filteredLevel, filteredRain])

  const dailyData = useMemo(() => {
    if (activeTab !== 'daily') return []
    const byDay = {}
    filteredRain.forEach(r => {
      const day = format(new Date(r.timestamp), 'dd/MM', { locale: es })
      if (!byDay[day]) byDay[day] = { time: day, lluvia: 0, nivel: null }
      if (r.precipitation_mm != null) byDay[day].lluvia += Number(r.precipitation_mm)
    })
    filteredLevel.forEach(r => {
      const day = format(new Date(r.timestamp), 'dd/MM', { locale: es })
      if (!byDay[day]) byDay[day] = { time: day, lluvia: 0, nivel: null }
      if (r.water_level_cm != null)
        byDay[day].nivel = Math.max(byDay[day].nivel || 0, Number(r.water_level_cm))
    })
    return Object.values(byDay).sort((a, b) => a.time.localeCompare(b.time))
  }, [activeTab, filteredLevel, filteredRain])

  const scatterData = useMemo(() => {
    if (activeTab !== 'correlation') return []
    const rainMap = {}
    filteredRain.forEach(r => {
      const key = format(new Date(r.timestamp), 'dd/MM HH:mm', { locale: es })
      rainMap[key] = r.precipitation_mm
    })
    return filteredLevel
      .map(r => {
        const key = format(new Date(r.timestamp), 'dd/MM HH:mm', { locale: es })
        return {
          lluvia: rainMap[key] != null ? Number(rainMap[key]) : null,
          nivel:  r.water_level_cm != null ? Number(r.water_level_cm) : null,
        }
      })
      .filter(d => d.lluvia != null && d.nivel != null)
      .slice(0, 300)
  }, [activeTab, filteredLevel, filteredRain])

  // Dynamic Y-axis domains — both scale to 125% of the visible maximum,
  // floored at 5 so the axis is never zero-height when data is absent.
  const levelDomain = useMemo(() => {
    const vals = chartData.map(d => d.nivel).filter(v => v != null)
    if (!vals.length) return [0, 5]
    const maxVal = vals.reduce((a, b) => Math.max(a, b), 0)
    return [0, Math.max(5, Math.ceil(maxVal * 1.25))]
  }, [chartData])

  const rainDomain = useMemo(() => {
    const vals = chartData.map(d => d.lluvia).filter(v => v != null && v > 0)
    if (!vals.length) return [0, 5]
    const maxVal = vals.reduce((a, b) => Math.max(a, b), 0)
    return [0, Math.max(5, Math.ceil(maxVal * 1.25))]
  }, [chartData])

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
            onChange={e => handleRangeChange(e.target.value)}
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
            onChange={e => setCustomFrom(e.target.value)}
            style={INPUT_STYLE}
          />
          <span style={{ fontSize: 10, color: 'var(--ink-3)', fontFamily: MONO }}>→</span>
          <label htmlFor="chart-date-to" className="sr-only">Fecha hasta</label>
          <input
            id="chart-date-to"
            type="date"
            value={customTo}
            onChange={e => setCustomTo(e.target.value)}
            style={INPUT_STYLE}
          />
        </div>
      )}

      {/* ── Chart metadata line ───────────────────────────────────────────── */}
      <div style={{ padding: '6px 20px 0', fontSize: 10, color: 'var(--ink-3)', fontFamily: MONO }}>
        {chartData.length} puntos · {filteredLevel.length} registros nivel · {filteredRain.length} registros lluvia
      </div>

      {/* ── Chart panels ─────────────────────────────────────────────────── */}
      <div style={{ padding: '8px 12px 12px' }}>

        {/* SERIE TEMPORAL — level line (left) and rainfall bars (right), both baseline at 0 */}
        {activeTab === 'timeseries' && (
          <section
            id="chart-panel-timeseries"
            role="tabpanel"
            aria-labelledby="chart-tab-timeseries"
          >
            <div
              role="img"
              aria-label={`Serie temporal: ${filteredLevel.length} registros de nivel, ${filteredRain.length} de lluvia`}
              className="chart-wrapper"
            >
              <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: -1, height: 1 }}>
                <ComposedChart data={chartData} margin={{ top: 8, right: 48, left: 0, bottom: 0 }}>
                  <CartesianGrid {...GRID_STYLE} vertical={false} />

                  <XAxis
                    dataKey="time"
                    tick={{ fill: 'var(--ink-3)', fontSize: 10, fontFamily: MONO }}
                    tickLine={false}
                    axisLine={{ stroke: 'var(--border-strong)' }}
                    minTickGap={48}
                    angle={-20}
                    textAnchor="end"
                    height={40}
                  />

                  {/* Left Y — water level, domain scales to visible data */}
                  {(variable === 'both' || variable === 'nivel') && (
                    <YAxis
                      yAxisId="nivel"
                      orientation="left"
                      domain={levelDomain}
                      tick={AXIS_STYLE}
                      tickLine={false}
                      axisLine={false}
                      width={44}
                      label={{ value: 'NIVEL · cm', angle: -90, position: 'insideLeft', fill: 'var(--ink-3)', fontSize: 9, dx: -2 }}
                    />
                  )}

                  {/* Right Y — rainfall, same baseline as level (0 at bottom, bars grow up) */}
                  {(variable === 'both' || variable === 'lluvia') && (
                    <YAxis
                      yAxisId="lluvia"
                      orientation="right"
                      domain={rainDomain}
                      tick={{ fill: 'var(--rain)', fontSize: 10, fontFamily: MONO }}
                      tickLine={false}
                      axisLine={false}
                      width={40}
                      label={{ value: 'LLUVIA · mm', angle: 90, position: 'insideRight', fill: 'var(--rain)', fontSize: 9, dx: 6 }}
                    />
                  )}

                  {/* Threshold reference lines — only render when within the visible domain */}
                  {(variable === 'both' || variable === 'nivel') && levelDomain[1] >= 50 && (
                    <ReferenceLine yAxisId="nivel" y={50} stroke="var(--st-atencion)" strokeDasharray="4 3" strokeOpacity={0.55} strokeWidth={1} />
                  )}
                  {(variable === 'both' || variable === 'nivel') && levelDomain[1] >= 100 && (
                    <ReferenceLine yAxisId="nivel" y={100} stroke="var(--st-alerta)" strokeDasharray="4 3" strokeOpacity={0.55} strokeWidth={1} />
                  )}
                  {(variable === 'both' || variable === 'nivel') && levelDomain[1] >= 200 && (
                    <ReferenceLine yAxisId="nivel" y={200} stroke="var(--st-critico)" strokeDasharray="4 3" strokeOpacity={0.55} strokeWidth={1} />
                  )}

                  <Tooltip content={<ChartTooltip />} />

                  {/* Rain bars — reversed axis causes them to grow downward from y=0 (top) */}
                  {(variable === 'both' || variable === 'lluvia') && (
                    <Bar
                      yAxisId="lluvia"
                      dataKey="lluvia"
                      name="Lluvia (mm)"
                      fill="var(--rain)"
                      fillOpacity={0.85}
                      barSize={3}
                      isAnimationActive={false}
                    />
                  )}

                  {/* Level line */}
                  {(variable === 'both' || variable === 'nivel') && (
                    <Line
                      yAxisId="nivel"
                      type="monotone"
                      dataKey="nivel"
                      name="Nivel (cm)"
                      stroke="var(--level)"
                      strokeWidth={1.7}
                      dot={false}
                      activeDot={{ r: 3, fill: 'var(--level)', strokeWidth: 0 }}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <ChartLegend showRain={variable !== 'nivel'} showLevel={variable !== 'lluvia'} />
          </section>
        )}

        {/* BARRAS DIARIAS */}
        {activeTab === 'daily' && (
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
                    label={{ value: 'Nivel cm', angle: 90, position: 'insideRight', fill: 'var(--ink-3)', fontSize: 9, dx: 6 }}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar
                    yAxisId="lluvia" dataKey="lluvia" name="Lluvia Acum. Diaria (mm)"
                    fill="var(--rain)" fillOpacity={0.7} maxBarSize={14} radius={[2, 2, 0, 0]}
                    isAnimationActive={false}
                  />
                  <Line
                    yAxisId="nivel" type="monotone" dataKey="nivel" name="Nivel Max (cm)"
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
        {activeTab === 'correlation' && (
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
                    label={{ value: 'Lluvia (mm)', position: 'insideBottom', fill: 'var(--ink-3)', fontSize: 10, dy: 18 }}
                  />
                  <YAxis
                    dataKey="nivel" name="Nivel"
                    tick={AXIS_STYLE} tickLine={false} axisLine={false} width={44}
                    label={{ value: 'Nivel (cm)', angle: -90, position: 'insideLeft', fill: 'var(--ink-3)', fontSize: 10, dx: -2 }}
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
                          <div style={{ color: 'var(--rain)' }}>Lluvia: {d.lluvia?.toFixed(2)} mm</div>
                          <div style={{ color: 'var(--level)' }}>Nivel: {d.nivel?.toFixed(3)} cm</div>
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
