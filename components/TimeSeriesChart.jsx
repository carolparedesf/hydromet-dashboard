'use client'

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

const CustomTooltip = ({ active, payload, label, unit }) => {
  if (!active || !payload?.length || payload[0].value == null) return null
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e2e8f0',
      borderRadius: 8,
      padding: '8px 14px',
      fontSize: 13,
      boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
    }}>
      <div style={{ color: '#94a3b8', marginBottom: 4 }}>{label}</div>
      <div style={{ color: '#2563eb', fontWeight: 600 }}>
        {unit} : {Number(payload[0].value).toFixed(2)}
      </div>
    </div>
  )
}

export default function TimeSeriesChart({ data, stationName, variable }) {
  const isRain = variable === 'precipitation_mm'
  const unit   = isRain ? 'lluvia' : 'nivel'
  const title  = isRain ? 'Historial de Lluvia' : 'Historial de Nivel de Agua'

  // Reducir puntos si hay muchos
  let displayData = data
  if (data.length > 500) {
    const step = Math.ceil(data.length / 500)
    displayData = data.filter((_, i) => i % step === 0)
  }

  const formatted = displayData.map(r => ({
    time:  format(new Date(r.timestamp), 'dd/MM HH:mm', { locale: es }),
    value: r[variable] != null ? Number(r[variable]) : null,
  }))

  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e2e8f0',
      borderRadius: 12,
      padding: '20px 24px',
      marginBottom: 16
    }}>
      <div style={{ fontWeight: 600, fontSize: 15, color: '#1a2332', marginBottom: 20 }}>
        {title}
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={formatted} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`grad-${variable}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#2563eb" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey="time"
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            interval={Math.floor(formatted.length / 6)}
          />
          <YAxis
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={48}
            tickFormatter={v => `${v} ${isRain ? 'mm' : 'cm'}`}
          />
          <Tooltip content={<CustomTooltip unit={unit} />} />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#2563eb"
            strokeWidth={2}
            fill={`url(#grad-${variable})`}
            dot={false}
            activeDot={{ r: 5, fill: '#2563eb', strokeWidth: 0 }}
            connectNulls={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}