'use client'

import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { subDays } from 'date-fns'
import { supabase } from '../lib/supabase'
import { POLL_INTERVAL_MS, LEVEL_THRESHOLDS } from '../lib/constants'
import { useTheme } from '../components/ThemeProvider'
import StationCards from '../components/StationCards'
import dynamic from 'next/dynamic'

const MapStation    = dynamic(() => import('../components/MapStation'),    { ssr: false })
const CombinedChart = dynamic(() => import('../components/CombinedChart'), { ssr: false })
const DataTable     = dynamic(() => import('../components/DataTable'),     { ssr: false })

const DATE_FROM = '2024-04-16'
const DATE_TO   = '2030-12-31'

function StatusDot({ color, pulse }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: 7, height: 7, borderRadius: '50%',
        background: color, flexShrink: 0,
        animation: pulse ? 'pulse 2s ease-in-out infinite' : 'none',
      }}
    />
  )
}

function StatusChip({ color, label, pulse }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      fontFamily: 'var(--font-mono, "Space Mono", monospace)',
      fontSize: 11.5, color: 'var(--ink-2, #aab8c6)',
      letterSpacing: '0.03em', whiteSpace: 'nowrap',
    }}>
      <StatusDot color={color} pulse={pulse} />
      {label}
    </div>
  )
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1"  x2="12" y2="3"  />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22"  y1="4.22"  x2="5.64"  y2="5.64"  />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1"  y1="12" x2="3"  y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22"  y1="19.78" x2="5.64"  y2="18.36" />
      <line x1="18.36" y1="5.64"  x2="19.78" y2="4.22"  />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

function ThemeToggle() {
  const { theme, toggle } = useTheme()
  return (
    <button
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      style={{
        width: 28, height: 28, borderRadius: 6, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'transparent',
        color: 'var(--ink-3, #8090a0)',
        border: '1px solid transparent',
        transition: 'background 0.15s, color 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--panel-alt, rgba(255,255,255,0.08))' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}

function ClockDisplay() {
  const [time, setTime] = useState('')
  useEffect(() => {
    function update() {
      const now = new Date()
      setTime({
        full:  now.toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric' }) + ' · ' + now.toLocaleTimeString('es-PY'),
        short: now.toLocaleDateString('es-PY', { day: '2-digit', month: 'short' }) + ' · ' + now.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' }),
      })
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div style={{ fontFamily: 'var(--font-mono, "Space Mono", monospace)', fontSize: 12, color: 'var(--ink-2, #aab8c6)', whiteSpace: 'nowrap' }}>
      <span className="hidden md:inline">{time.full}</span>
      <span className="md:hidden">{time.short}</span>
    </div>
  )
}

function ErrorBanner({ message }) {
  return (
    <div
      role="alert"
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'var(--st-critico-soft, rgba(178,59,59,0.10))',
        border: '1px solid var(--st-critico, #b23b3b)',
        borderRadius: 8, padding: '10px 16px',
        fontFamily: 'var(--font-mono, "Space Mono", monospace)',
        fontSize: 12, color: 'var(--st-critico, #b23b3b)',
      }}
    >
      <StatusDot color="var(--st-critico, #b23b3b)" />
      {message}
    </div>
  )
}

export default function Home() {
  const [stations, setStations]     = useState([])
  const [records, setRecords]       = useState([])
  const [latestData, setLatest]     = useState({})
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [mapVisible, setMapVisible] = useState(false)
  const mapBodyRef = useRef(null)

  // Range selection lives here (not in CombinedChart) so that changing it
  // re-queries get_records_sampled with a narrower p_from/p_to — a fixed
  // 2024-2030 window sampled down to ~5-6k points has almost no resolution
  // left inside a 7-day slice, so client-side-only filtering starved short
  // ranges down to a handful of points.
  const [rangeKey, setRangeKey]     = useState('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo]     = useState('')

  const handleRangeChange = useCallback((key) => {
    setRangeKey(key)
    if (key !== 'custom') { setCustomFrom(''); setCustomTo('') }
  }, [])

  useEffect(() => {
    const el = mapBodyRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setMapVisible(true); obs.disconnect() } },
      { rootMargin: '200px' }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    async function loadStations() {
      try {
        const { data, error: err } = await supabase
          .from('stations')
          .select('id, station_code, station_name, sensor_type, latitude, longitude')
          .order('station_code')
        if (err || !data) throw err ?? new Error('no data')
        setStations(data)
      } catch {
        setError('No se pudieron cargar las estaciones.')
        setLoading(false)
      }
    }
    loadStations()
  }, [])

  // Derives the query window the RPC should sample over from the selected
  // preset, so narrow ranges get fetched (and thus sampled) at their own
  // resolution instead of being sliced out of one whole-history sample.
  const { fromISO, toISO } = useMemo(() => {
    const fullFrom = new Date(DATE_FROM + 'T00:00:00.000Z').toISOString()
    const fullTo   = new Date(DATE_TO   + 'T23:59:59.999Z').toISOString()
    if (rangeKey === 'all') return { fromISO: fullFrom, toISO: fullTo }
    if (rangeKey === 'custom') {
      if (!customFrom) return { fromISO: fullFrom, toISO: fullTo }
      return {
        fromISO: new Date(customFrom + 'T00:00:00').toISOString(),
        toISO:   customTo ? new Date(customTo + 'T23:59:59').toISOString() : new Date().toISOString(),
      }
    }
    const days = parseInt(rangeKey)
    return { fromISO: subDays(new Date(), days).toISOString(), toISO: new Date().toISOString() }
  }, [rangeKey, customFrom, customTo])

  useEffect(() => {
    if (!stations.length) return

    async function loadRecords() {
      try {
        setError(null)

        const rpcResults = await Promise.all(
          stations.map(stn =>
            supabase
              .rpc('get_records_sampled', {
                p_station_id: stn.id,
                p_from: fromISO,
                p_to: toISO
              })
          )
        )

        const allRecords = []
        rpcResults.forEach(({ data: sampled }, i) => {
          if (!sampled) return
          const stn = stations[i]
          sampled.forEach(row => allRecords.push({
            station_id:       stn.id,
            timestamp:        row.bucket,
            precipitation_mm: row.avg_precipitation,
            water_level_cm:   row.avg_level,
          }))
        })
        setRecords(allRecords)

        const latestResults = await Promise.all(
          stations.map(stn =>
            supabase
              .from('hydromet_records')
              .select('station_id, timestamp, water_level_cm, precipitation_mm')
              .eq('station_id', stn.id)
              .order('timestamp', { ascending: false })
              .limit(1)
              .maybeSingle()
          )
        )

        const latest = {}
        stations.forEach((stn, i) => {
          if (latestResults[i].data) latest[stn.id] = latestResults[i].data
        })
        setLatest(latest)
        setLastUpdate(new Date())
      } catch {
        setError('No se pudieron actualizar los datos — reintentando en 60 s')
      } finally {
        setLoading(false)
      }
    }

    loadRecords()
    const interval = setInterval(loadRecords, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [stations, fromISO, toISO])

  const recordsByStation = useMemo(() => {
    const map = {}
    for (const r of records) {
      if (!map[r.station_id]) map[r.station_id] = []
      map[r.station_id].push(r)
    }
    return map
  }, [records])

  const stationNivel  = useMemo(
    () => stations.find(s => s.sensor_type === 'nivel' || s.sensor_type === 'nivel+lluvia'),
    [stations]
  )
  const stationLluvia = useMemo(
    () => stations.find(s => s.sensor_type === 'lluvia'),
    [stations]
  )
  const levelData = useMemo(
    () => stationNivel  ? (recordsByStation[stationNivel.id]  || []) : [],
    [stationNivel, recordsByStation]
  )
  const rainData = useMemo(
    () => stationLluvia ? (recordsByStation[stationLluvia.id] || []) : [],
    [stationLluvia, recordsByStation]
  )
  const isCritical = useMemo(
    () => Object.values(latestData).some(d => (d?.water_level_cm ?? 0) >= LEVEL_THRESHOLDS.CRITICO),
    [latestData]
  )
  const reversedRecords = useMemo(() => [...records].reverse(), [records])

  return (
    <div className="min-h-screen">
      <h1 className="sr-only">Panel HydroMET — Cuenca Mburicaó</h1>

      <header style={{
        background: 'var(--panel)',
        borderBottom: '1px solid var(--border)',
        boxShadow: 'var(--shadow-panel)',
      }}>
        <div className="flex items-center flex-wrap gap-[14px] px-[14px] md:px-[18px] xl:px-[22px] py-3 md:py-[13px] xl:py-[15px]">

          <div className="flex items-center gap-3">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{
                fontFamily: 'var(--font-display, "Space Mono", monospace)',
                fontWeight: 700, fontSize: 18,
                color: 'var(--ink, #c8ddf5)', letterSpacing: '-0.3px',
              }}>
                HydroMET
              </span>
              <span style={{
                fontFamily: 'var(--font-mono, "Space Mono", monospace)',
                fontWeight: 500, fontSize: 13,
                color: 'var(--accent, #3b9df8)', letterSpacing: '0.5px',
              }}>
                MBR
              </span>
            </div>

            <div className="hidden md:block" style={{
              background: 'var(--panel-alt, rgba(61,157,248,0.08))',
              border: '1px solid var(--border, rgba(61,157,248,0.25))',
              borderRadius: 5, padding: '5px 9px',
              fontFamily: 'var(--font-mono, "Space Mono", monospace)',
              fontSize: 11, color: 'var(--ink-2, #7a9dc5)',
              letterSpacing: '0.04em', whiteSpace: 'nowrap',
            }}>
              CUENCA ARROYO MBURICAÓ · PY
            </div>

            <span className="md:hidden" style={{
              fontFamily: 'var(--font-mono, "Space Mono", monospace)',
              fontSize: 10, color: 'var(--ink-3, #6c7a8b)', letterSpacing: '0.04em',
            }}>
              · MBURICAÓ
            </span>
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-4 flex-wrap">
            <StatusChip color="var(--st-normal)" label="INGESTA ACTIVA" />
            <div className="hidden md:flex items-center gap-4">
              <StatusChip
                color="var(--st-normal, #22c97a)"
                label={`${stations.length} / ${stations.length} ESTACIONES`}
              />
              <StatusChip color="var(--ink-4, #5f6f7e)" label="SONDEO · 60 s" />
              <StatusChip
                color={isCritical ? 'var(--st-critico, #ef4444)' : 'var(--st-normal, #22c97a)'}
                label="SISTEMA OPERATIVO"
                pulse={isCritical}
              />
            </div>
            <ThemeToggle />
            <div className="flex items-center gap-3">
              <div aria-hidden="true" style={{ width: 1, height: 16, background: 'var(--border, #1d3050)', flexShrink: 0 }} />
              <ClockDisplay />
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-3 md:gap-[14px] xl:gap-4 px-[14px] md:px-[16px] xl:px-[24px] py-3 md:py-[14px] xl:py-5">

        {error && <ErrorBanner message={error} />}

        <section aria-label="Indicadores" aria-live="polite" aria-atomic="false">
          {loading
            ? (
              <div className="kpi-grid">
                <div className="skel" style={{ height: 116, borderRadius: 8 }} />
                <div className="skel" style={{ height: 116, borderRadius: 8 }} />
                <div className="skel" style={{ height: 116, borderRadius: 8 }} />
              </div>
            )
            : <StationCards stations={stations} latestData={latestData} records={records} />
          }
        </section>

        <main className="main-grid">
          {loading
            ? <div className="skel" style={{ minHeight: 460, borderRadius: 8 }} />
            : (
              <CombinedChart
                levelData={levelData}
                rainData={rainData}
                stationLevel={stationNivel?.station_name || ''}
                stationRain={stationLluvia?.station_name || ''}
                stations={stations}
                rangeKey={rangeKey}
                customFrom={customFrom}
                customTo={customTo}
                onRangeChange={handleRangeChange}
                onCustomFromChange={setCustomFrom}
                onCustomToChange={setCustomTo}
              />
            )
          }

          <div style={{
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            overflow: 'hidden',
            position: 'relative',
            zIndex: 1,
            boxShadow: 'var(--shadow-panel)',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px', borderBottom: '1px solid var(--border)',
            }}>
              <h2 style={{
                margin: 0, fontSize: 11, fontWeight: 600,
                fontFamily: 'var(--font-display, "IBM Plex Sans", sans-serif)',
                color: 'var(--ink-2)', letterSpacing: '0.06em', textTransform: 'uppercase',
              }}>
                Mapa de cuenca — Mburicaó
              </h2>
              <div style={{
                fontSize: 10, padding: '2px 8px', borderRadius: 4,
                background: 'var(--st-normal-soft)', border: '1px solid var(--st-normal)',
                color: 'var(--st-normal)', fontFamily: 'var(--font-mono, "Space Mono", monospace)',
                letterSpacing: '0.03em',
              }}>
                {lastUpdate
                  ? 'ACTUALIZADO ' + lastUpdate.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })
                  : 'LIVE'}
              </div>
            </div>
            <div ref={mapBodyRef} style={{ padding: 16 }}>
              {mapVisible && stations.length > 0
                ? <MapStation stations={stations} latestData={latestData} />
                : <div className="skel" style={{ height: 230, borderRadius: 6 }} />
              }
            </div>
          </div>
        </main>

        <section aria-label="Registros recientes">
          {loading
            ? <div className="skel" style={{ minHeight: 280, borderRadius: 8 }} />
            : <DataTable records={reversedRecords} stations={stations} />
          }
        </section>

      </div>
    </div>
  )
}