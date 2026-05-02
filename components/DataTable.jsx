'use client'

import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export default function DataTable({ records, stations }) {
  const stationMap = Object.fromEntries(stations.map(s => [s.id, s]))

  return (
    <div className="panel" style={{ overflow: 'hidden' }}>
      <div style={{
        padding: '14px 20px', borderBottom: '1px solid #1d3050',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
      }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#c8ddf5', fontFamily: 'Space Mono, monospace', letterSpacing: '0.05em' }}>
          ÚLTIMOS REGISTROS
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#22c97a', fontFamily: 'Space Mono, monospace' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c97a' }} />
          STREAMING
        </div>
      </div>
      <div style={{ overflowX: 'auto', maxHeight: 280, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1d3050' }}>
              {['Estación', 'Timestamp', 'Lluvia mm', 'Nivel cm'].map(h => (
                <th key={h} style={{
                  padding: '10px 16px', textAlign: 'left',
                  color: '#4a6d99', fontSize: 10, fontWeight: 400,
                  fontFamily: 'Space Mono, monospace', letterSpacing: '0.05em'
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map((r, i) => {
              const stn = stationMap[r.station_id]
              const isLevel = stn?.sensor_type === 'nivel'
              return (
                <tr key={`${r.station_id}-${r.timestamp}`} style={{
                  borderBottom: '1px solid rgba(29,48,80,0.3)',
                  background: i % 2 === 0 ? 'transparent' : 'rgba(15,30,48,0.4)'
                }}>
                  <td style={{ padding: '8px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: isLevel ? '#1de3c8' : '#3b9df8', flexShrink: 0 }} />
                      <span style={{ color: '#7a9dc5', fontSize: 11 }}>{stn?.station_code}</span>
                      <span style={{ color: '#4a6d99', fontSize: 11 }}>{stn?.station_name}</span>
                    </div>
                  </td>
                  <td style={{ padding: '8px 16px', color: '#4a6d99', fontFamily: 'Space Mono, monospace', fontSize: 10 }}>
                    {format(new Date(r.timestamp), 'dd MMM yyyy HH:mm', { locale: es })}
                  </td>
                  <td style={{ padding: '8px 16px', color: '#3b9df8', fontFamily: 'Space Mono, monospace', fontSize: 11 }}>
                    {r.precipitation_mm != null ? Number(r.precipitation_mm).toFixed(2) : '—'}
                  </td>
                  <td style={{ padding: '8px 16px', color: '#1de3c8', fontFamily: 'Space Mono, monospace', fontSize: 11 }}>
                    {r.water_level_cm != null ? Number(r.water_level_cm).toFixed(2) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}