'use client'

import { useMemo } from 'react'

function KpiCard({ label, value, unit, sub, color, topColor }) {
  return (
    <div style={{
      background: '#0f1e30', border: '1px solid #1d3050', borderRadius: 12,
      padding: '14px 18px', position: 'relative', overflow: 'hidden', flex: 1
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${topColor}, transparent)` }} />
      <div style={{ fontSize: 10, color: '#4a6d99', fontFamily: 'Space Mono, monospace', letterSpacing: '0.06em', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
        <span style={{ fontSize: 24, fontWeight: 700, color, fontFamily: 'Space Mono, monospace' }}>{value}</span>
        <span style={{ fontSize: 11, color: '#4a6d99' }}>{unit}</span>
      </div>
      <div style={{ fontSize: 10, color: '#4a6d99' }}>{sub}</div>
    </div>
  )
}

export default function StationCards({ stations, latestData, records }) {
  const hasRainStation  = stations.find(s => s.sensor_type.includes('lluvia'))
  const hasLevelStation = stations.find(s => s.sensor_type.includes('nivel'))

  const kpis = useMemo(() => {
    if (!records || !records.length) return null

    const levelVals = records.map(r => r.water_level_cm).filter(v => v != null).map(Number)
    const rainVals  = records.map(r => r.precipitation_mm).filter(v => v != null).map(Number)

    const maxLevel = levelVals.length ? Math.max(...levelVals) : null
    const avgLevel = levelVals.length ? levelVals.reduce((a, b) => a + b, 0) / levelVals.length : null
    const maxRain  = rainVals.length  ? Math.max(...rainVals)  : null

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

  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      {kpis && (
        <>
          {kpis.maxLevel != null && (
            <KpiCard
              label="NIVEL MÁXIMO HISTÓRICO"
              value={kpis.maxLevel.toFixed(2)}
              unit="cm"
              sub={kpis.peakLevelDay ? 'Pico el ' + formatDate(kpis.peakLevelDay[0]) : ''}
              color="#ef4444"
              topColor="#ef4444"
            />
          )}
          {kpis.avgLevel != null && (
            <KpiCard
              label="NIVEL PROMEDIO DEL PERÍODO"
              value={kpis.avgLevel.toFixed(2)}
              unit="cm"
              sub="promedio horario"
              color="#1de3c8"
              topColor="#1de3c8"
            />
          )}
          {kpis.maxRain != null && (
            <KpiCard
              label="LLUVIA MÁX. POR HORA"
              value={kpis.maxRain.toFixed(1)}
              unit="mm"
              sub={kpis.rainiestDay ? 'Día más lluvioso: ' + formatDate(kpis.rainiestDay[0]) : ''}
              color="#3b9df8"
              topColor="#3b9df8"
            />
          )}
        </>
      )}
    </div>
  )
}