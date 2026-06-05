'use client'

import { useState, useMemo } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { statusForLevel, STATUS_LABEL } from '../lib/constants'

const MONO    = 'var(--font-mono, "Space Mono", monospace)'
const DISPLAY = 'var(--font-display, "IBM Plex Sans", sans-serif)'
const SANS    = 'var(--font-sans, Inter, system-ui, sans-serif)'
const PAGE_SIZE = 25

// ─── Inline StatusPill (mirrors StationCards version, self-contained here) ──

function TableStatusPill({ value }) {
  if (value == null) {
    return (
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '1px 6px', borderRadius: 4,
        border: '1px dashed var(--border)',
        fontFamily: MONO, fontSize: 10.5, fontWeight: 600,
        color: 'var(--ink-4)', letterSpacing: '0.4px', whiteSpace: 'nowrap',
      }}>
        <span style={{
          width: 5, height: 5, flexShrink: 0,
          border: '1px solid var(--ink-4)', display: 'inline-block',
        }} />
        SIN DATOS
      </div>
    )
  }
  const status = statusForLevel(value)
  const label  = STATUS_LABEL[status]
  const colors = {
    normal:   { text: 'var(--st-normal)',   soft: 'var(--st-normal-soft)'   },
    atencion: { text: 'var(--st-atencion)', soft: 'var(--st-atencion-soft)' },
    alerta:   { text: 'var(--st-alerta)',   soft: 'var(--st-alerta-soft)'   },
    critico:  { text: 'var(--st-critico)',  soft: 'var(--st-critico-soft)'  },
  }[status]
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '1px 6px', borderRadius: 4,
      border: `1px solid ${colors.text}`,
      background: colors.soft,
      fontFamily: MONO, fontSize: 10.5, fontWeight: 600,
      color: colors.text, letterSpacing: '0.4px', whiteSpace: 'nowrap',
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
        background: colors.text, display: 'inline-block',
      }} />
      {label}
    </div>
  )
}

// Returns the status-aware text color for a level value
function levelColor(value) {
  if (value == null) return 'var(--ink-4)'
  const status = statusForLevel(value)
  return {
    normal:   'var(--st-normal)',
    atencion: 'var(--st-atencion)',
    alerta:   'var(--st-alerta)',
    critico:  'var(--st-critico)',
  }[status]
}

// ─── DataTable ────────────────────────────────────────────────────────────────

export default function DataTable({ records, stations }) {
  const [page, setPage] = useState(0)

  const stationMap = useMemo(
    () => Object.fromEntries(stations.map(s => [s.id, s])),
    [stations]
  )

  const totalPages  = Math.max(1, Math.ceil(records.length / PAGE_SIZE))
  const pageRecords = useMemo(
    () => records.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [records, page]
  )

  const shownTo = Math.min((page + 1) * PAGE_SIZE, records.length)

  const thStyle = {
    padding: '9px 14px',
    fontFamily: MONO, fontSize: 10.5, fontWeight: 600,
    color: 'var(--ink-3)', letterSpacing: '0.05em',
    background: 'var(--panel-alt)',
    position: 'sticky', top: 0,
    borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap',
    userSelect: 'none',
  }

  return (
    <div className="panel" style={{ overflow: 'hidden' }}>

      {/* Panel head */}
      <div style={{
        padding: '12px 20px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 8,
      }}>
        <h2 style={{
          margin: 0,
          fontSize: 11, fontWeight: 600,
          fontFamily: DISPLAY, textTransform: 'uppercase',
          color: 'var(--ink-2)', letterSpacing: '0.06em',
        }}>
          Registros recientes
        </h2>
        <div style={{ fontSize: 11, color: 'var(--ink-4)', fontFamily: MONO, whiteSpace: 'nowrap' }}>
          {records.length > 0
            ? `Mostrando ${shownTo} de ${records.length}`
            : 'Sin registros'}
        </div>
      </div>

      {/* Table scroll container — mobile scrolls horizontally */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{
          width: '100%', borderCollapse: 'collapse',
          minWidth: 640,
        }}>
          <caption className="sr-only">Registros hidrométricos recientes</caption>
          <thead>
            <tr>
              <th scope="col" style={{ ...thStyle, textAlign: 'left'  }}>FECHA / HORA</th>
              <th scope="col" style={{ ...thStyle, textAlign: 'left'  }}>ESTACIÓN</th>
              <th scope="col" style={{ ...thStyle, textAlign: 'right' }}>NIVEL (cm)</th>
              <th scope="col" style={{ ...thStyle, textAlign: 'right' }}>LLUVIA (mm)</th>
              <th scope="col" style={{ ...thStyle, textAlign: 'left'  }}>ESTADO</th>
            </tr>
          </thead>
          <tbody>
            {pageRecords.length === 0 && (
              <tr>
                <td colSpan={5} style={{
                  padding: '32px 20px', textAlign: 'center',
                  color: 'var(--ink-4)', fontFamily: MONO, fontSize: 12,
                }}>
                  Sin registros para el período
                </td>
              </tr>
            )}
            {pageRecords.map((r, i) => {
              const stn      = stationMap[r.station_id]
              const levelVal = r.water_level_cm  != null ? Number(r.water_level_cm)  : null
              const rainVal  = r.precipitation_mm != null ? Number(r.precipitation_mm) : null
              const isRain   = stn?.sensor_type?.includes('lluvia')

              return (
                <tr
                  key={`${r.station_id}-${r.timestamp}-${i}`}
                  style={{
                    borderBottom: '1px solid var(--border)',
                    background: i % 2 === 0 ? 'transparent' : 'var(--panel-alt)',
                  }}
                >
                  {/* FECHA / HORA */}
                  <td style={{
                    padding: '9px 14px',
                    color: 'var(--ink-3)', fontFamily: MONO, fontSize: 12.5,
                    fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                  }}>
                    {format(new Date(r.timestamp), 'dd/MM/yyyy HH:mm', { locale: es })}
                  </td>

                  {/* ESTACIÓN */}
                  <td style={{ padding: '9px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <div style={{
                        width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                        background: isRain ? 'var(--rain)' : 'var(--level)',
                      }} />
                      <span style={{
                        color: 'var(--ink)', fontFamily: SANS, fontSize: 13, fontWeight: 500,
                        whiteSpace: 'nowrap',
                      }}>
                        {stn?.station_name ?? r.station_id}
                      </span>
                    </div>
                  </td>

                  {/* NIVEL cm */}
                  <td style={{
                    padding: '9px 14px', textAlign: 'right',
                    fontFamily: MONO, fontSize: 13,
                    fontVariantNumeric: 'tabular-nums',
                    color: levelColor(levelVal),
                  }}>
                    {levelVal != null
                      ? <>{levelVal.toFixed(2)}<span style={{ fontSize: 10, color: 'var(--ink-4)', marginLeft: 2 }}>cm</span></>
                      : <span style={{ color: 'var(--ink-4)' }}>—</span>
                    }
                  </td>

                  {/* LLUVIA mm */}
                  <td style={{
                    padding: '9px 14px', textAlign: 'right',
                    fontFamily: MONO, fontSize: 13,
                    fontVariantNumeric: 'tabular-nums',
                    color: rainVal != null ? 'var(--rain)' : 'var(--ink-4)',
                  }}>
                    {rainVal != null
                      ? <>{rainVal.toFixed(2)}<span style={{ fontSize: 10, color: 'var(--ink-4)', marginLeft: 2 }}>mm</span></>
                      : <span>—</span>
                    }
                  </td>

                  {/* ESTADO */}
                  <td style={{ padding: '9px 14px' }}>
                    <TableStatusPill value={levelVal} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination footer */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '9px 16px',
          borderTop: '1px solid var(--border)',
          gap: 12,
        }}>
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            aria-label="Página anterior"
            style={{
              padding: '5px 12px', borderRadius: 5,
              cursor: page === 0 ? 'default' : 'pointer',
              background: 'var(--panel-alt)',
              border: '1px solid var(--border)',
              color: page === 0 ? 'var(--ink-4)' : 'var(--ink-2)',
              fontFamily: MONO, fontSize: 11,
              opacity: page === 0 ? 0.45 : 1,
              minWidth: 44, minHeight: 32,
            }}
          >
            ← Anterior
          </button>

          <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--ink-3)' }}>
            Página {page + 1} / {totalPages}
          </span>

          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page === totalPages - 1}
            aria-label="Página siguiente"
            style={{
              padding: '5px 12px', borderRadius: 5,
              cursor: page === totalPages - 1 ? 'default' : 'pointer',
              background: 'var(--panel-alt)',
              border: '1px solid var(--border)',
              color: page === totalPages - 1 ? 'var(--ink-4)' : 'var(--ink-2)',
              fontFamily: MONO, fontSize: 11,
              opacity: page === totalPages - 1 ? 0.45 : 1,
              minWidth: 44, minHeight: 32,
            }}
          >
            Siguiente →
          </button>
        </div>
      )}
    </div>
  )
}
