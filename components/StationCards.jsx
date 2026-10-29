'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { statusForLevel, STATUS_LABEL, UMBRAL_NARANJA, UMBRAL_ROJO, MAX_SIN_DATOS_MS } from '../lib/constants'
import { formatAge } from '../lib/formatAge'

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
// Spec §6: 6px segmented track, in meters, same 0–4 m span as the chart's
// level axis. Segments follow the shared thresholds (lib/constants.js):
// NORMAL 0–UMBRAL_NARANJA · ALERTA UMBRAL_NARANJA–UMBRAL_ROJO · CRÍTICO above.
// Marker triangle points down at value/BAR_MAX position.

const BAR_MAX  = UMBRAL_ROJO + 1
const BAR_TICKS = [
  { label: '0',                    pct: 0                                },
  { label: String(UMBRAL_NARANJA), pct: (UMBRAL_NARANJA / BAR_MAX) * 100 },
  { label: String(UMBRAL_ROJO),    pct: (UMBRAL_ROJO    / BAR_MAX) * 100 },
  { label: `${BAR_MAX} m`,         pct: 100                              },
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

        {/* Three segments — flex units are proportional to their width in meters */}
        <div style={{ display: 'flex', gap: '1.5px', height: 6 }}>
          <div style={{ flex: UMBRAL_NARANJA,               background: 'var(--st-normal)',  opacity: 0.32, borderRadius: 2 }} />
          <div style={{ flex: UMBRAL_ROJO - UMBRAL_NARANJA, background: 'var(--st-alerta)',  opacity: 0.32, borderRadius: 2 }} />
          <div style={{ flex: BAR_MAX - UMBRAL_ROJO,        background: 'var(--st-critico)', opacity: 0.32, borderRadius: 2 }} />
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

function KpiCard({ label, value, unit, sub, stale, type, rawValue }) {
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

      {/* Sub-note — alert color + explicit text when the reading is stale */}
      {sub && (
        <div style={{
          fontSize: 12.5, color: stale ? 'var(--st-alerta)' : 'var(--ink-3)',
          fontFamily: SANS, marginTop: 6, fontWeight: stale ? 600 : 400,
        }}>
          {sub}
        </div>
      )}
    </div>
  )
}

// ─── StationCards ─────────────────────────────────────────────────────────────
// Latest reading of the Colegio SIL station, from the same source as the chart
// (/api/grafana-data?solo=ultimo, polled by page.js).
//   lectura  { t, nivel, lluvia, acum1h } of the latest reading, or null
//   error    message when the request failed; onRetry re-requests

export default function StationCards({ lectura, error, retrying, onRetry }) {
  // Ticks every 30 s so "hace X" keeps aging between polls.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  if (!lectura) {
    return (
      <div role="alert" style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        background: 'var(--st-critico-soft)', border: '1px solid var(--st-critico)',
        borderRadius: 8, padding: '12px 16px',
        fontFamily: MONO, fontSize: 12, color: 'var(--st-critico)',
      }}>
        {error ? `No se pudo obtener la última lectura de Grafana (${error}).` : 'Sin lecturas disponibles.'}
        {error && (
          <button onClick={onRetry} disabled={retrying} style={{
            background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--ink-2)',
            borderRadius: 6, padding: '4px 10px', fontSize: 11, fontFamily: MONO, cursor: 'pointer',
          }}>
            {retrying ? 'Reintentando…' : 'Reintentar'}
          </button>
        )}
      </div>
    )
  }

  const age   = Math.max(0, now - lectura.t)
  const stale = age > MAX_SIN_DATOS_MS
  const sub   = stale
    ? `Sin lecturas nuevas · último dato hace ${formatAge(age)}`
    : `Lectura de las ${format(new Date(lectura.t), 'HH:mm')} · hace ${formatAge(age)}`

  return (
    <div className="kpi-grid">
      <KpiCard
        label="Nivel actual"
        value={lectura.nivel != null ? lectura.nivel.toFixed(2) : '—'}
        unit="m"
        sub={sub}
        stale={stale}
        type="level"
        rawValue={lectura.nivel}
      />
      <KpiCard
        label="Lluvia última lectura"
        value={lectura.lluvia != null ? lectura.lluvia.toFixed(1) : '—'}
        unit="mm · 5 min"
        sub={sub}
        stale={stale}
        type="rain"
        rawValue={lectura.lluvia}
      />
      <KpiCard
        label="Lluvia Acumulada 1h"
        value={lectura.acum1h != null ? lectura.acum1h.toFixed(2) : '—'}
        unit="mm"
        sub={sub}
        stale={stale}
        type="rain"
        rawValue={lectura.acum1h}
      />
    </div>
  )
}
