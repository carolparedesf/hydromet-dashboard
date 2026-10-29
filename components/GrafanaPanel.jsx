'use client'

import { useEffect, useState } from 'react'

// ─── Panel de Grafana (imagen HTTPS externa) ─────────────────────────────────
// Reemplaza al gráfico Nivel + Lluvia alimentado desde Supabase (CombinedChart).
// La imagen PNG se genera fuera del dashboard y se publica por HTTPS en
// PANEL_URL. (La ruta /api/grafana-panel, que la pedía al render de Grafana,
// queda en el código sin usar.)

// URL de la imagen del panel. Reemplazá <NOMBRE> por el nombre del archivo.
const PANEL_URL = 'https://lmeserver.tail8113d2.ts.net/panels/<NOMBRE>.png'

// Cada cuánto se vuelve a pedir la imagen (5 minutos).
const REFRESH_MS = 5 * 60 * 1000

const DEFAULT_WIDTH  = 1600
const DEFAULT_HEIGHT = 800

const MONO    = 'var(--font-mono, "Space Mono", monospace)'
const DISPLAY = 'var(--font-display, "IBM Plex Sans", sans-serif)'

// ?t=<Date.now()> keeps the browser (and any cache in between) from serving
// the previous PNG after the file is regenerated.
function buildPanelUrl() {
  const url = new URL(PANEL_URL)
  url.searchParams.set('t', Date.now())
  return url.toString()
}

// width / height only set the aspect ratio of the panel box; the PNG itself
// decides its resolution.
export default function GrafanaPanel({ width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT }) {
  const [src, setSrc]           = useState(null)
  const [status, setStatus]     = useState('loading') // 'loading' | 'loaded' | 'error'
  const [stale, setStale]       = useState(false)     // last refresh failed, showing older image
  const [loadedAt, setLoadedAt] = useState(null)
  const [attempt, setAttempt]   = useState(0)

  useEffect(() => {
    let cancelled = false

    // Preload off-screen and only swap in on success, so a failed periodic
    // refresh keeps the last good image instead of a broken-image icon.
    function load() {
      const url = buildPanelUrl()
      const img = new Image()
      img.onload = () => {
        if (cancelled) return
        setSrc(url)
        setStatus('loaded')
        setStale(false)
        setLoadedAt(new Date())
      }
      img.onerror = () => {
        if (cancelled) return
        setStale(true)
        setStatus(s => (s === 'loaded' ? 'loaded' : 'error'))
      }
      img.src = url
    }

    load()
    const id = setInterval(load, REFRESH_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [attempt])

  function retry() {
    setStatus('loading')
    setAttempt(a => a + 1)
  }

  return (
    <div style={{
      background: 'var(--panel)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      overflow: 'hidden',
      boxShadow: 'var(--shadow-panel)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', borderBottom: '1px solid var(--border)',
      }}>
        <h2 style={{
          margin: 0, fontSize: 11, fontWeight: 600, fontFamily: DISPLAY,
          color: 'var(--ink-2)', letterSpacing: '0.06em', textTransform: 'uppercase',
        }}>
          Nivel + Lluvia — Arroyo Mburicaó
        </h2>
        <span
          title={stale ? 'La última actualización falló; se muestra la imagen anterior.' : undefined}
          style={{
            fontSize: 10, fontFamily: MONO, letterSpacing: '0.03em',
            color: stale ? 'var(--st-critico, #b23b3b)' : 'var(--ink-3)',
          }}
        >
          {stale && status === 'loaded' ? 'SIN ACTUALIZAR · ' : ''}
          {loadedAt
            ? 'GRAFANA · ' + loadedAt.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })
            : 'GRAFANA'}
        </span>
      </div>

      <div style={{ padding: 16 }}>
        <div style={{ position: 'relative', width: '100%', aspectRatio: `${width} / ${height}` }}>
          {status === 'loading' && (
            <div className="skel" style={{
              position: 'absolute', inset: 0, borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: MONO, fontSize: 11, color: 'var(--ink-3)',
            }}>
              Cargando panel de Grafana…
            </div>
          )}

          {status === 'error' && (
            <div role="alert" style={{
              position: 'absolute', inset: 0, borderRadius: 6,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 10, padding: 16, textAlign: 'center',
              background: 'var(--st-critico-soft, rgba(178,59,59,0.10))',
              border: '1px solid var(--st-critico, #b23b3b)',
              fontFamily: MONO, fontSize: 12, color: 'var(--st-critico, #b23b3b)',
            }}>
              <div>No se pudo cargar el panel de Grafana.</div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)', maxWidth: 420 }}>
                El servidor de la imagen no respondió o no es accesible desde
                esta red.
              </div>
              <button onClick={retry} style={{
                background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--ink-2)',
                borderRadius: 6, padding: '4px 10px', fontSize: 11, fontFamily: MONO, cursor: 'pointer',
              }}>
                Reintentar
              </button>
            </div>
          )}

          {/* Plain <img>: external PNG already at its final size, so next/image
              optimization adds nothing here. */}
          {src && status === 'loaded' && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              width={width}
              height={height}
              alt="Panel de Grafana: nivel del arroyo y lluvia en la cuenca Mburicaó"
              style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain', borderRadius: 6 }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
