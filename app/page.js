'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import StationCards from '../components/StationCards'
import CombinedChart from '../components/CombinedChart'
import DataTable from '../components/DataTable'
import dynamic from 'next/dynamic'

const MapStation = dynamic(() => import('../components/MapStation'), { ssr: false })

function HStatItem({ color, label, pulse }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#7a9dc5', fontFamily: 'Space Mono, monospace' }}>
      <div style={{
        width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0,
        animation: pulse ? 'pulse 2s ease-in-out infinite' : 'none'
      }} />
      {label}
    </div>
  )
}

function ClockDisplay() {
  const [time, setTime] = useState('')
  useEffect(() => {
    function update() {
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
  return (
    <div style={{ fontFamily: 'Space Mono, monospace', fontSize: 11, color: '#c8ddf5', whiteSpace: 'nowrap' }}>
      {time}
    </div>
  )
}

export default function Home() {
  const [stations, setStations] = useState([])
  const [records, setRecords] = useState([])
  const [latestData, setLatest] = useState({})
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [dateFrom, setDateFrom] = useState('2025-08-27')
  const [dateTo, setDateTo] = useState('2026-05-07')
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    function checkMobile() {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    window.addEventListener('orientationchange', () => {
      setTimeout(checkMobile, 300)
    })
    return () => {
      window.removeEventListener('resize', checkMobile)
      window.removeEventListener('orientationchange', checkMobile)
    }
  }, [])
  useEffect(() => {
    fetchData(dateFrom, dateTo)
  }, [])

  async function fetchData(from, to) {
    const { data: stns } = await supabase
      .from('stations')
      .select('*')
      .order('station_code')

    if (!stns) return
    setStations(stns)

    const fromISO = new Date(from + 'T00:00:00').toISOString()
    const toISO = new Date(to + 'T23:59:59').toISOString()

    const allRecords = []
    for (const stn of stns) {
      const { data: sampled } = await supabase
        .rpc('get_records_sampled', { p_station_id: stn.id })
        .range(0, 9999)
        .select()
      if (sampled) {
        sampled
          .filter(row => row.bucket >= fromISO && row.bucket <= toISO)
          .forEach(row => {
            allRecords.push({
              station_id: stn.id,
              timestamp: row.bucket,
              precipitation_mm: row.avg_precipitation,
              water_level_cm: row.avg_level,
            })
          })
      }
    }

    setRecords(allRecords)

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
    setLastUpdate(new Date())
    setLoading(false)
  }

  function handleFilter() {
    setLoading(true)
    fetchData(dateFrom, dateTo)
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: '#4a6d99', background: '#060c14', fontFamily: 'Space Mono, monospace', fontSize: 13 }}>
        Cargando datos...
      </div>
    )
  }

  const recordsByStation = Object.fromEntries(
    stations.map(s => [s.id, records.filter(r => r.station_id === s.id)])
  )

  const stationNivel = stations.find(s => s.sensor_type === 'nivel')
  const stationLluvia = stations.find(s => s.sensor_type === 'lluvia')
  const levelData = stationNivel ? (recordsByStation[stationNivel.id] || []) : []
  const rainData = stationLluvia ? (recordsByStation[stationLluvia.id] || []) : []

  return (
    <div style={{ minHeight: '100vh', background: '#060c14' }}>

      {/* HEADER */}
      <div style={{
        background: '#0b1523',
        borderBottom: '1px solid #1d3050',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap'
      }}>

        {/* Logo */}
        <div style={{ fontFamily: 'Space Mono, monospace', fontSize: 12, color: '#1de3c8', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
          HydroMET<span style={{ color: '#4a6d99' }}>/</span>MBR
          <span style={{ color: '#3b9df8', marginLeft: 6 }}>v2.4</span>
        </div>

        {/* Badge */}
        {!isMobile && (
          <div style={{
            background: 'rgba(61,157,248,0.1)', border: '1px solid rgba(61,157,248,0.25)',
            borderRadius: 4, padding: '2px 10px',
            fontFamily: 'Space Mono, monospace', fontSize: 10, color: '#3b9df8', letterSpacing: '0.06em'
          }}>
            ARROYO MBURICAÓ BASIN · PY
          </div>
        )}

        <div style={{ flex: 1 }} />

        {/* Indicadores */}
        {!isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <HStatItem color="#22c97a" label="INGEST ACTIVE" pulse />
            <HStatItem color="#3b9df8" label={stations.length + ' / ' + stations.length + ' STATIONS'} />
            <HStatItem color="#1de3c8" label="SUPABASE REALTIME" pulse />
            <HStatItem color="#ef4444" label="SISTEMA ACTIVO" pulse />
          </div>
        )}

        <ClockDisplay />

        <button
          onClick={() => {
            localStorage.removeItem('hydromet_auth')
            window.location.href = '/login'
          }}
          style={{
            background: 'transparent', border: '1px solid #1d3050',
            borderRadius: 4, padding: '3px 10px', color: '#4a6d99',
            fontSize: 10, fontFamily: 'Space Mono, monospace',
            cursor: 'pointer', letterSpacing: '0.04em'
          }}
        >
          SALIR
        </button>
      </div>

      {/* CONTENIDO */}
      <div style={{ padding: isMobile ? '12px 12px' : '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        <StationCards stations={stations} latestData={latestData} records={records} />

        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 360px',
          gap: 12,
          alignItems: 'start'
        }}>

          {/* Gráfico */}
          <div>
            <CombinedChart
              levelData={levelData}
              rainData={rainData}
              stationLevel={stationNivel?.station_name || ''}
              stationRain={stationLluvia?.station_name || ''}
              stations={stations}
            />
          </div>

          {/* Mapa */}
          <div>
            <div style={{
              background: '#0f1e30',
              border: '1px solid #1d3050',
              borderRadius: 12,
              overflow: 'hidden',
              position: 'relative',
              zIndex: 1
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 16px', borderBottom: '1px solid #1d3050'
              }}>
                <div style={{ fontSize: 10, color: '#4a6d99', fontFamily: 'Space Mono, monospace', letterSpacing: '0.06em' }}>
                  BASIN MAP — MBURICAÓ
                </div>
                <div style={{
                  fontSize: 9, padding: '2px 8px', borderRadius: 3,
                  background: 'rgba(34,201,122,0.15)', border: '1px solid rgba(34,201,122,0.3)',
                  color: '#22c97a', fontFamily: 'Space Mono, monospace'
                }}>
                  LIVE
                </div>
              </div>
              <div style={{ padding: 16 }}>
                <MapStation stations={stations} latestData={latestData} />
              </div>
            </div>
          </div>

        </div>

        <DataTable
          records={[...records].reverse().slice(0, 100)}
          stations={stations}
        />

      </div>
    </div>
  )
}