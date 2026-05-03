'use client'

import { useState, useMemo } from 'react'
import {
  Line, Bar, ScatterChart, Scatter, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine
} from 'recharts'
import { format, subDays } from 'date-fns'
import { es } from 'date-fns/locale'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'rgba(6,12,20,0.97)', border: '1px solid #1d3050',
      borderRadius: 8, padding: '8px 14px', fontSize: 11,
      fontFamily: 'Space Mono, monospace'
    }}>
      <div style={{ color: '#4a6d99', marginBottom: 6 }}>{label}</div>
      {payload.map(p => p.value != null && (
        <div key={p.name} style={{ color: p.color, marginBottom: 2 }}>
          {p.name}: <strong>{Number(p.value).toFixed(3)}</strong>
        </div>
      ))}
    </div>
  )
}

function TabButton({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '6px 14px', fontSize: 11, borderRadius: 6, cursor: 'pointer',
      fontFamily: 'Space Mono, monospace', letterSpacing: '0.04em',
      background: active ? 'rgba(61,157,248,0.15)' : 'transparent',
      color: active ? '#3b9df8' : '#4a6d99',
      border: active ? '1px solid rgba(61,157,248,0.3)' : '1px solid transparent',
      transition: 'all 0.15s'
    }}>
      {label}
    </button>
  )
}

const QUICK_RANGES = [
  { label: '7D',   days: 7 },
  { label: '14D',  days: 14 },
  { label: '30D',  days: 30 },
  { label: '60D',  days: 60 },
  { label: 'TODO', days: null },
]

export default function CombinedChart({ levelData, rainData, stationLevel, stationRain, stations }) {
  const [activeTab, setActiveTab]   = useState('timeseries')
  const [variable, setVariable]     = useState('both')
  const [quickRange, setQuickRange] = useState(null)
  const [dateFrom, setDateFrom]     = useState('')
  const [dateTo, setDateTo]         = useState('')

  const selectStyle = {
    background: '#0f1e30', border: '1px solid #1d3050', color: '#7a9dc5',
    borderRadius: 6, padding: '4px 8px', fontSize: 11,
    fontFamily: 'Space Mono, monospace', cursor: 'pointer', outline: 'none'
  }
  const inputStyle = {
    background: '#0f1e30', border: '1px solid #1d3050', color: '#c8ddf5',
    borderRadius: 6, padding: '4px 8px', fontSize: 11,
    fontFamily: 'Space Mono, monospace', cursor: 'pointer', outline: 'none'
  }
  const axisStyle = { fill: '#4a6d99', fontSize: 10, fontFamily: 'Space Mono, monospace' }
  const gridStyle = { stroke: 'rgba(29,48,80,0.4)', strokeDasharray: '3 3' }

  function filterData(data) {
    let from = null
    let to   = new Date().toISOString()

    if (quickRange === null) return data
    if (quickRange !== undefined && quickRange !== null) {
      from = subDays(new Date(), quickRange).toISOString()
    } else if (quickRange === undefined && dateFrom) {
      from = new Date(dateFrom + 'T00:00:00').toISOString()
      to   = dateTo ? new Date(dateTo + 'T23:59:59').toISOString() : to
    }

    if (!from) return data
    return data.filter(r => r.timestamp >= from && r.timestamp <= to)
  }

  const filteredLevel = useMemo(() => filterData(levelData), [levelData, quickRange, dateFrom, dateTo])
  const filteredRain  = useMemo(() => filterData(rainData),  [rainData,  quickRange, dateFrom, dateTo])

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
  }, [filteredLevel, filteredRain])

  const scatterData = useMemo(() => {
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
  }, [filteredLevel, filteredRain])

  const levels    = chartData.map(d => d.nivel).filter(v => v != null)
  const avgLevel  = levels.length ? levels.reduce((a, b) => a + b, 0) / levels.length : 0
  const xInterval = Math.max(1, Math.floor(chartData.length / 6))

  const TABS = [
    { key: 'timeseries',  label: 'TIME SERIES' },
    { key: 'daily',       label: 'DAILY BARS' },
    { key: 'correlation', label: 'CORRELATION' },
    { key: 'comparison',  label: 'STATION COMP.' },
  ]

  return (
     <div style={{
      background: '#0f1e30',
      border: '1px solid #1d3050',
      borderRadius: 12,
      overflow: 'hidden'
    }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid #1d3050' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#7a9dc5', fontFamily: 'Space Mono, monospace', letterSpacing: '0.06em' }}>
          TIME SERIES ANALYSIS
        </div>
        <select value={variable} onChange={e => setVariable(e.target.value)} style={selectStyle}>
          <option value="both">Nivel + Lluvia</option>
          <option value="nivel">Solo Nivel</option>
          <option value="lluvia">Solo Lluvia</option>
        </select>
      </div>

      {/* Tabs + Filtros */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid #1d3050', flexWrap: 'wrap', gap: 8 }}>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4 }}>
          {TABS.map(t => (
            <TabButton key={t.key} label={t.label} active={activeTab === t.key} onClick={() => setActiveTab(t.key)} />
          ))}
        </div>

        {/* Rango + fechas */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select
            value={quickRange === undefined ? 'custom' : String(quickRange)}
            onChange={e => {
              const val = e.target.value
              if (val === 'custom') {
                setQuickRange(undefined)
              } else {
                setQuickRange(val === 'null' ? null : Number(val))
                setDateFrom('')
                setDateTo('')
              }
            }}
            style={selectStyle}
          >
            <option value="7">Últimos 7D</option>
            <option value="14">Últimos 14D</option>
            <option value="30">Últimos 30D</option>
            <option value="60">Últimos 60D</option>
            <option value="null">Todo</option>
            <option value="custom">Personalizado</option>
          </select>

          {quickRange === undefined && (
            <>
              <input type="date" value={dateFrom} style={inputStyle}
                onChange={e => setDateFrom(e.target.value)} />
              <span style={{ fontSize: 10, color: '#4a6d99', fontFamily: 'Space Mono, monospace' }}>→</span>
              <input type="date" value={dateTo} style={inputStyle}
                onChange={e => setDateTo(e.target.value)} />
            </>
          )}
        </div>
      </div>

      {/* Contador */}
      <div style={{ padding: '6px 20px 0', fontSize: 10, color: '#4a6d99', fontFamily: 'Space Mono, monospace' }}>
        {chartData.length} puntos · {filteredLevel.length} registros nivel · {filteredRain.length} registros lluvia
      </div>

      {/* Charts */}
      <div style={{ padding: '12px 12px 8px' }}>

        {activeTab === 'timeseries' && (
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={chartData} margin={{ top: 4, right: 52, left: 0, bottom: 0 }}>
              <CartesianGrid {...gridStyle} vertical={false} />
              <XAxis dataKey="time" tick={axisStyle} tickLine={false} axisLine={false} interval={xInterval} />
              {(variable === 'both' || variable === 'nivel') && (
                <YAxis yAxisId="nivel" orientation="left" tick={axisStyle} tickLine={false} axisLine={false} width={48}
                  label={{ value: 'Nivel', angle: -90, position: 'insideLeft', fill: '#4a6d99', fontSize: 10, dx: -4 }} />
              )}
              {(variable === 'both' || variable === 'lluvia') && (
                <YAxis yAxisId="lluvia" orientation="right" tick={axisStyle} tickLine={false} axisLine={false} width={48}
                  label={{ value: 'mm', angle: 90, position: 'insideRight', fill: '#4a6d99', fontSize: 10, dx: 8 }} />
              )}
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 10, color: '#7a9dc5', paddingTop: 8, fontFamily: 'Space Mono, monospace' }} />
              <ReferenceLine yAxisId="nivel" y={avgLevel} stroke="#1de3c8" strokeDasharray="4 4" strokeOpacity={0.3} />
              {(variable === 'both' || variable === 'lluvia') && (
                <Bar yAxisId="lluvia" dataKey="lluvia" name="Lluvia (mm)" fill="#3b9df8" fillOpacity={0.6} maxBarSize={4} />
              )}
              {(variable === 'both' || variable === 'nivel') && (
                <Line yAxisId="nivel" type="monotone" dataKey="nivel" name="Nivel (cm)"
                  stroke="#1de3c8" strokeWidth={2} dot={false}
                  activeDot={{ r: 4, fill: '#1de3c8', strokeWidth: 0 }} connectNulls={false} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}

        {activeTab === 'daily' && (
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={dailyData} margin={{ top: 4, right: 52, left: 0, bottom: 0 }}>
              <CartesianGrid {...gridStyle} vertical={false} />
              <XAxis 
                dataKey="time" 
                tick={{ fill: '#4a6d99', fontSize: 9, fontFamily: 'Space Mono, monospace' }} 
                tickLine={false} 
                axisLine={false} 
                interval={Math.max(1, Math.floor(chartData.length / 4))}
                angle={-35}
                textAnchor="end"
                height={45}
              />
              <YAxis yAxisId="lluvia" orientation="left" tick={axisStyle} tickLine={false} axisLine={false} width={48}
                label={{ value: 'mm/dia', angle: -90, position: 'insideLeft', fill: '#4a6d99', fontSize: 10, dx: -4 }} />
              <YAxis yAxisId="nivel" orientation="right" tick={axisStyle} tickLine={false} axisLine={false} width={48}
                label={{ value: 'Nivel', angle: 90, position: 'insideRight', fill: '#4a6d99', fontSize: 10, dx: 8 }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 10, color: '#7a9dc5', paddingTop: 8, fontFamily: 'Space Mono, monospace' }} />
              <Bar yAxisId="lluvia" dataKey="lluvia" name="Lluvia Acum. Diaria (mm)" fill="#3b9df8" fillOpacity={0.7} maxBarSize={14} radius={[2, 2, 0, 0]} />
              <Line yAxisId="nivel" type="monotone" dataKey="nivel" name="Nivel Max (cm)"
                stroke="#1de3c8" strokeWidth={2} dot={{ r: 3, fill: '#1de3c8', strokeWidth: 0 }} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        )}

        {activeTab === 'correlation' && (
          <ResponsiveContainer width="100%" height={240}>
            <ScatterChart margin={{ top: 4, right: 20, left: 0, bottom: 20 }}>
              <CartesianGrid {...gridStyle} />
              <XAxis dataKey="lluvia" name="Lluvia" tick={axisStyle} tickLine={false} axisLine={false}
                label={{ value: 'Lluvia (mm)', position: 'insideBottom', fill: '#4a6d99', fontSize: 10, dy: 16 }} />
              <YAxis dataKey="nivel" name="Nivel" tick={axisStyle} tickLine={false} axisLine={false} width={48}
                label={{ value: 'Nivel (cm)', angle: -90, position: 'insideLeft', fill: '#4a6d99', fontSize: 10, dx: -4 }} />
              <Tooltip cursor={{ strokeDasharray: '3 3', stroke: '#1d3050' }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0].payload
                  return (
                    <div style={{ background: 'rgba(6,12,20,0.97)', border: '1px solid #1d3050', borderRadius: 8, padding: '8px 12px', fontSize: 11, fontFamily: 'Space Mono, monospace' }}>
                      <div style={{ color: '#3b9df8' }}>Lluvia: {d.lluvia?.toFixed(2)} mm</div>
                      <div style={{ color: '#1de3c8' }}>Nivel: {d.nivel?.toFixed(3)} cm</div>
                    </div>
                  )
                }} />
              <Scatter data={scatterData} fill="#3b9df8" fillOpacity={0.5} />
            </ScatterChart>
          </ResponsiveContainer>
        )}

        {activeTab === 'comparison' && (
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart
              data={[
                {
                  name: 'Maximos',
                  ...Object.fromEntries(
                    (stations || []).map(s => [
                      'STN ' + s.station_code,
                      s.sensor_type === 'nivel'
                        ? Math.max(...filteredLevel.map(r => r.water_level_cm).filter(v => v != null).map(Number), 0)
                        : Math.max(...filteredRain.map(r => r.precipitation_mm).filter(v => v != null).map(Number), 0)
                    ])
                  )
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
                  )
                }
              ]}
              margin={{ top: 4, right: 20, left: 0, bottom: 0 }}
            >
              <CartesianGrid {...gridStyle} vertical={false} />
              <XAxis dataKey="name" tick={axisStyle} tickLine={false} axisLine={false} />
              <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={48} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 10, color: '#7a9dc5', paddingTop: 8, fontFamily: 'Space Mono, monospace' }} />
              {(stations || []).map((s, i) => (
                <Bar key={s.station_code} dataKey={'STN ' + s.station_code}
                  fill={['#1de3c8', '#3b9df8', '#7c3aed', '#f97316', '#22c55e'][i % 5]}
                  fillOpacity={0.8} maxBarSize={40} radius={[3, 3, 0, 0]} />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        )}

      </div>
    </div>
  )
}