'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import StationCards from '../components/StationCards'
import CombinedChart from '../components/CombinedChart'
import DataTable from '../components/DataTable'
import dynamic from 'next/dynamic'

// Carga dinámica del mapa para evitar errores de SSR (Server Side Rendering)
const MapStation = dynamic(() => import('../components/MapStation'), { 
  ssr: false,
  loading: () => <div style={{ height: '300px', background: '#0b1523' }} />
})

// Componente de mini-estado en el header
function HStatItem({ color, label, pulse }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#7a9dc5', fontFamily: 'Space Mono, monospace' }}>
      <div style={{
        width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0,
        animation: pulse ? 'pulse 2s ease-in-out infinite' : 'none'
      }} />
      <span className="md-show">{label}</span>
    </div>
  )
}

// Componente de Reloj optimizado para evitar Hydration Mismatch
function ClockDisplay() {
  const [time, setTime] = useState(null)

  useEffect(() => {
    const update = () => {
      const now = new Date()
      setTime(
        now.toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric' }) +
        ' · ' + now.toLocaleTimeString('es-PY')
      )
    }
    update()
    const i = setInterval(update, 1000)
    return () => clearInterval(i)
  }, [])

  if (!time) return <div style={{ minWidth: '180px' }} />

  return (
    <div style={{ fontFamily: 'Space Mono, monospace', fontSize: 11, color: '#c8ddf5', whiteSpace: 'nowrap' }}>
      {time}
    </div>
  )
}

export default function Home() {
  const [stations, setStations]     = useState([])
  const [records, setRecords]       = useState([])
  const [latestData, setLatest]     = useState({})
  const [loading, setLoading]       = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [dateFrom, setDateFrom]     = useState('2025-10-01')
  const [dateTo, setDateTo]         = useState('2026-04-30')
  const [isMobile, setIsMobile]     = useState(false)

  // Manejo de responsividad
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Validación de sesión y carga inicial
  useEffect(() => {
    const auth = localStorage.getItem('hydromet_auth')
    if (!auth) {
      window.location.href = '/login'
    } else {
      setAuthorized(true)
      fetchData(dateFrom, dateTo)
    }
  }, [])

  async function fetchData(from, to) {
    try {
      // 1. Obtener estaciones
      const { data: stns, error: stnError } = await supabase
        .from('stations')
        .select('*')
        .order('station_code')

      if (stnError || !stns) throw stnError
      setStations(stns)

      const fromISO = new Date(from + 'T00:00:00').toISOString()
      const toISO   = new Date(to + 'T23:59:59').toISOString()

      // 2. Obtener registros (usando Promise.all para mayor velocidad)
      const recordsPromises = stns.map(stn => 
        supabase.rpc('get_records_sampled', { p_station_id: stn.id })
      )
      
      const results = await Promise.all(recordsPromises)
      const allRecords = []

      results.forEach((res, index) => {
        if (res.data) {
          res.data
            .filter(row => row.bucket >= fromISO && row.bucket <= toISO)
            .forEach(row => {
              allRecords.push({
                station_id:       stns[index].id,
                timestamp:        row.bucket,
                precipitation_mm: row.avg_precipitation,
                water_level_cm:   row.avg_level,
              })
            })
        }
      })
      setRecords(allRecords)

      // 3. Obtener el último dato de cada estación
      const latest = {}
      for (const stn of stns) {
        const { data: last } = await supabase
          .from('hydromet_records')
          .select('*')
          .eq('station_id', stn.id)
          .order('timestamp', { ascending: false })
          .limit(1)
          .single()
        if (last) latest[stn.id] = last
      }

      setLatest(latest)
    } catch (err) {
      console.error("Error cargando datos:", err)
    } finally {
      setLoading(false)
    }
  }

  // Pantalla de carga profesional
  if (!authorized || loading) {
    return (
      <div style={{ 
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', 
        minHeight: '100vh', color: '#1de3c8', background: '#060c14', 
        fontFamily: 'Space Mono, monospace', gap: 10 
      }}>
        <div className="spinner" /> 
        <p style={{ fontSize: 12, letterSpacing: '0.1em' }}>INICIALIZANDO SISTEMA...</p>
      </div>
    )
  }

  // Procesamiento de datos para los subcomponentes
  const recordsByStation = Object.fromEntries(
    stations.map(s => [s.id, records.filter(r => r.station_id === s.id)])
  )

  const stationNivel  = stations.find(s => s.sensor_type === 'nivel')
  const stationLluvia = stations.find(s => s.sensor_type === 'lluvia')
  const levelData     = stationNivel  ? (recordsByStation[stationNivel.id]  || []) : []
  const rainData      = stationLluvia ? (recordsByStation[stationLluvia.id] || []) : []

  return (
    <div style={{ minHeight: '100vh', background: '#060c14', color: '#fff' }}>
      
      {/* HEADER */}
      <header style={{
        background: '#0b1523',
        borderBottom: '1px solid #1d3050',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
        position: 'sticky',
        top: 0,
        zIndex: 100
      }}>
        <div style={{ fontFamily: 'Space Mono, monospace', fontSize: 12, color: '#1de3c8', letterSpacing: '0.06em' }}>
          HydroMET<span style={{ color: '#4a6d99' }}>/</span>MBR
          <span style={{ color: '#3b9df8', marginLeft: 6 }}>v2.4</span>
        </div>

        {!isMobile && (
          <div style={{
            background: 'rgba(61,157,248,0.1)', border: '1px solid rgba(61,157,248,0.25)',
            borderRadius: 4, padding: '2px 10px',
            fontFamily: 'Space Mono, monospace', fontSize: 10, color: '#3b9df8'
          }}>
            ARROYO MBURICAÓ BASIN · PY
          </div>
        )}

        <div style={{ flex: 1 }} />

        {!isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <HStatItem color="#22c97a" label="INGEST ACTIVE" pulse />
            <HStatItem color="#1de3c8" label="REALTIME" pulse />
          </div>
        )}

        <ClockDisplay />

        <button
          onClick={() => {
            localStorage.removeItem('hydromet_auth')
            window.location.href = '/login'
          }}
          style={{
            background: 'transparent', border: '1px solid #ef4444',
            borderRadius: 4, padding: '4px 12px', color: '#ef4444',
            fontSize: 10, fontFamily: 'Space Mono, monospace',
            cursor: 'pointer', transition: 'all 0.2s'
          }}
        >
          SALIR
        </button>
      </header>

      {/* CONTENIDO PRINCIPAL */}
      <main style={{ padding: isMobile ? '12px' : '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        
        {/* Tarjetas Superiores */}
        <StationCards stations={stations} latestData={latestData} records={records} />

        {/* Layout Grid: Gráfico + Mapa */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 380px',
          gap: 16,
          alignItems: 'start'
        }}>

          {/* Gráfico Combinado */}
          <section>
            <CombinedChart
              levelData={levelData}
              rainData={rainData}
              stationLevel={stationNivel?.station_name || ''}
              stationRain={stationLluvia?.station_name || ''}
              stations={stations}
            />
          </section>

          {/* Mapa de Estaciones */}
          <aside>
            <div style={{
              background: '#0f1e30',
              border: '1px solid #1d3050',
              borderRadius: 12,
              overflow: 'hidden'
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 16px', borderBottom: '1px solid #1d3050'
              }}>
                <div style={{ fontSize: 10, color: '#4a6d99', fontFamily: 'Space Mono, monospace' }}>
                  SITUACIÓN GEOGRÁFICA
                </div>
                <div style={{
                  fontSize: 9, padding: '2px 8px', borderRadius: 3,
                  background: 'rgba(34,201,122,0.15)', color: '#22c97a', border: '1px solid rgba(34,201,122,0.3)'
                }}>
                  LIVE
                </div>
              </div>
              <div style={{ padding: 0, height: '350px', position: 'relative' }}>
                <MapStation stations={stations} latestData={latestData} />
              </div>
            </div>
          </aside>
        </div>

        {/* Tabla de Datos Históricos */}
        <section>
          <DataTable
            records={[...records].reverse().slice(0, 100)}
            stations={stations}
          />
        </section>

      </main>

      {/* Estilos CSS inline para animaciones necesarias */}
      <style jsx global>{`
        @keyframes pulse {
          0% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.2); }
          100% { opacity: 1; transform: scale(1); }
        }
        .spinner {
          width: 30px;
          height: 30px;
          border: 2px solid rgba(29, 227, 200, 0.1);
          border-top: 2px solid #1de3c8;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}