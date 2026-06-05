'use client'

import { useMemo } from 'react'
import { statusForLevel, STATUS_LABEL } from '../lib/constants'

const MONO = 'var(--font-mono, "Space Mono", monospace)'
const SANS = 'var(--font-sans, Inter, system-ui, sans-serif)'

// ─── StatusPill ──────────────────────────────────────────────────────────────
// Spec §6: circle dot for data statuses, 1px-bordered square for SIN DATOS.
// Shape fallback ensures status is never conveyed by color alone (WCAG 1.4.1).

function StatusPill({ rawValue }) {
  if (rawValue == null) {
    return (
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '2px 7px', borderRadius: 4,
        border: '1px dashed var(--border)',
        fontFamily: MONO, fontSize: 10.5, fontWeight: 600,
        color: 'var(--ink-4)', letterSpacing: '0.5px',
        whiteSpace: 'nowrap',
      }}>
        {/* Square dot — shape fallback for SIN DATOS */}
        <span style={{
          width: 6, height: 6, display: 'inline-block', flexShrink: 0,
          border: '1px solid var(--ink-4)',
        }} />
        SIN DATOS
      </div>
    )
  }

  const status = statusForLevel(rawValue)
  const label  = STATUS_LABEL[status]

  const colors = {
    normal:   { text: 'var(--st-normal)',   soft: 'var(--st-normal-soft)'   },
    atencion: { text: 'var(--st-atencion)', soft: 'var(--st-atencion-soft)' },
    alerta:   { text: 'var(--st-alerta)',   soft: 'var(--st-alerta-soft)'   },
    critico:  { text: 'var(--st-critico)',  soft: 'var(--st-critico-soft)'  },
  }[status]

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 7px', borderRadius: 4,
      border: `1px solid ${colors.text}`,
      background: colors.soft,
      fontFamily: MONO, fontSize: 10.5, fontWeight: 600,
      color: colors.text, letterSpacing: '0.5px',
      whiteSpace: 'nowrap',
    }}>
      {/* Circle dot — standard shape for level statuses */}
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: colors.text,
        display: 'inline-block', flexShrink: 0,
      }} />
      {label}
    </div>
  )
}

// ─── ThresholdBar ────────────────────────────────────────────────────────────
// Spec §6: 6px segmented track, 0–250 cm range.
// Segments: NORMAL 50 cm (20%) · ATENCIÓN 50 cm (20%) · ALERTA 100 cm (40%) · CRÍTICO 50 cm (20%)
// Marker triangle points down at value/250 position.
// Scale captions at proportionally-correct positions.

const BAR_MAX  = 250
const BAR_TICKS = [
  { label: '0',      pct: 0                        },
  { label: '50',     pct: (50  / BAR_MAX) * 100    },  // 20 %
  { label: '100',    pct: (100 / BAR_MAX) * 100    },  // 40 %
  { label: '200',    pct: (200 / BAR_MAX) * 100    },  // 80 %
  { label: '250 cm', pct: 100                      },
]

function ThresholdBar({ value }) {
  const markerPct = Math.min(100, (value / BAR_MAX) * 100)

  return (
    <div style={{ marginTop: 10 }}>
      {/* Marker + segments — paddingTop reserves space for the triangle */}
      <div style={{ position: 'relative', paddingTop: 9 }}>

        {/* Downward-pointing triangle centred at markerPct */}
        <div style={{
          position: 'absolute', top: 0,
          left: `${markerPct}%`, transform: 'translateX(-50%)',
          width: 0, height: 0,
          borderLeft: '4px solid transparent',
          borderRight: '4px solid transparent',
          borderTop: '5px solid var(--ink)',
        }} />

        {/* Four segments — flex units are proportional to cm widths */}
        <div style={{ display: 'flex', gap: '1.5px', height: 6 }}>
          <div style={{ flex: 50,  background: 'var(--st-normal)',   opacity: 0.32, borderRadius: 2 }} />
          <div style={{ flex: 50,  background: 'var(--st-atencion)', opacity: 0.32, borderRadius: 2 }} />
          <div style={{ flex: 100, background: 'var(--st-alerta)',   opacity: 0.32, borderRadius: 2 }} />
          <div style={{ flex: 50,  background: 'var(--st-critico)',  opacity: 0.32, borderRadius: 2 }} />
        </div>
      </div>

      {/* Scale captions at proportionally-correct positions */}
      <div style={{ position: 'relative', height: 14, marginTop: 3 }}>
        {BAR_TICKS.map(({ label, pct }) => (
          <span key={label} style={{
            position: 'absolute',
            left:      pct === 100 ? 'auto' : `${pct}%`,
            right:     pct === 100 ? 0      : 'auto',
            transform: pct === 0 || pct === 100 ? 'none' : 'translateX(-50%)',
            fontSize: 9.5, color: 'var(--ink-4)',
            fontFamily: MONO, whiteSpace: 'nowrap',
          }}>
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── RainBar ─────────────────────────────────────────────────────────────────
// Spec §6: single cyan progress fill on --track background.
// Reference ceiling: 60 mm/h covers extreme precipitation in the basin.
// Values above 60 mm/h show a full bar.

const RAIN_DISPLAY_MAX = 60

function RainBar({ value }) {
  const pct = Math.min(100, (value / RAIN_DISPLAY_MAX) * 100)

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{
        height: 6, borderRadius: 3,
        background: 'var(--track)',
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: 'var(--rain)',
          borderRadius: 3,
          transition: 'width 0.4s ease',
        }} />
      </div>
    </div>
  )
}

// ─── KpiCard ──────────────────────────────────────────────────────────────────
// type: 'level' | 'rain'
// rawValue: unformatted number used for StatusPill + bar calculations.
// value: pre-formatted string displayed as the headline figure.

function KpiCard({ label, value, unit, sub, type, rawValue }) {
  return (
    <div style={{
      background: 'var(--panel)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '16px 18px',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: 'var(--shadow-panel)',
    }}>

      {/* Top row: label + optional status pill */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 8, marginBottom: 10, minHeight: 22,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 500,
          color: 'var(--ink-3)', fontFamily: MONO,
          letterSpacing: '0.6px', textTransform: 'uppercase',
        }}>
          {label}
        </div>
        {type === 'level' && <StatusPill rawValue={rawValue} />}
      </div>

      {/* Value row — clamp() gives fluid font size across breakpoints */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{
          fontSize: 'clamp(30px, 3.5vw, 40px)',
          fontWeight: 600,
          color: 'var(--ink)',
          fontFamily: MONO,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.5px',
          lineHeight: 1,
        }}>
          {value}
        </span>
        <span style={{
          fontSize: 'clamp(13px, 1.5vw, 16px)',
          fontWeight: 500,
          color: 'var(--ink-3)',
          fontFamily: MONO,
        }}>
          {unit}
        </span>
      </div>

      {/* Threshold bar (level) or progress bar (rain) */}
      {type === 'level' && rawValue != null && <ThresholdBar value={rawValue} />}
      {type === 'rain'  && rawValue != null && <RainBar value={rawValue} />}

      {/* Sub-note */}
      {sub && (
        <div style={{
          fontSize: 12.5, color: 'var(--ink-3)',
          fontFamily: SANS, marginTop: 6,
        }}>
          {sub}
        </div>
      )}
    </div>
  )
}

// ─── StationCards ─────────────────────────────────────────────────────────────

export default function StationCards({ stations, latestData, records }) {
  const kpis = useMemo(() => {
    if (!records || !records.length) return null

    const levelVals = records.map(r => r.water_level_cm).filter(v => v != null).map(Number)
    const rainVals  = records.map(r => r.precipitation_mm).filter(v => v != null).map(Number)

    // reduce() instead of Math.max(...arr) — safe on large arrays (no call-stack risk)
    const maxLevel = levelVals.length ? levelVals.reduce((a, b) => Math.max(a, b), -Infinity) : null
    const avgLevel = levelVals.length ? levelVals.reduce((a, b) => a + b, 0) / levelVals.length  : null
    const maxRain  = rainVals.length  ? rainVals.reduce((a, b) => Math.max(a, b), -Infinity)   : null

    const byDay = {}
    records.forEach(r => {
      if (r.precipitation_mm == null) return
      const day = r.timestamp.slice(0, 10)
      byDay[day] = (byDay[day] || 0) + Number(r.precipitation_mm)
    })
    const rainiestDay = Object.entries(byDay).sort((a, b) => b[1] - a[1])[0]

    const levelByDay = {}
    records.forEach(r => {
      if (r.water_level_cm == null) return
      const day = r.timestamp.slice(0, 10)
      levelByDay[day] = Math.max(levelByDay[day] || 0, Number(r.water_level_cm))
    })
    const peakLevelDay = Object.entries(levelByDay).sort((a, b) => b[1] - a[1])[0]

    return { maxLevel, avgLevel, maxRain, rainiestDay, peakLevelDay }
  }, [records])

  function formatDate(iso) {
    if (!iso) return '—'
    const [y, m, d] = iso.split('-')
    return `${d}/${m}/${y}`
  }

  if (!kpis) return null

  return (
    <div className="kpi-grid">

      {kpis.maxLevel != null && (
        <KpiCard
          label="Nivel máximo histórico"
          value={kpis.maxLevel.toFixed(2)}
          unit="cm"
          sub={kpis.peakLevelDay ? 'Pico el ' + formatDate(kpis.peakLevelDay[0]) : ''}
          type="level"
          rawValue={kpis.maxLevel}
        />
      )}

      {kpis.avgLevel != null && (
        <KpiCard
          label="Nivel promedio del período"
          value={kpis.avgLevel.toFixed(2)}
          unit="cm"
          sub="Promedio horario"
          type="level"
          rawValue={kpis.avgLevel}
        />
      )}

      {kpis.maxRain != null && (
        <KpiCard
          label="Lluvia máx. por hora"
          value={kpis.maxRain.toFixed(1)}
          unit="mm"
          sub={kpis.rainiestDay ? 'Día más lluvioso: ' + formatDate(kpis.rainiestDay[0]) : ''}
          type="rain"
          rawValue={kpis.maxRain}
        />
      )}

    </div>
  )
}
