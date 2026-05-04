'use client'

import { useEffect, useRef } from 'react'

export default function MapStation({ stations, latestData }) {
  const mapRef      = useRef(null)
  const mapInstance = useRef(null)

  const stationsWithCoords = stations.filter(s => s.latitude && s.longitude)

  function getColor(station) {
    const data  = latestData[station.id]
    const level = data?.water_level_cm
    if (level == null) return '#3b9df8'
    if (level > 200)   return '#ef4444'
    if (level > 100)   return '#f97316'
    if (level > 50)    return '#eab308'
    return '#22c55e'
  }

  function getStatus(station) {
    const data  = latestData[station.id]
    const level = data?.water_level_cm
    if (level == null) return { label: 'SIN DATOS', color: '#4a6d99' }
    if (level > 200)   return { label: 'RIESGO INUNDACIÓN', color: '#ef4444' }
    if (level > 100)   return { label: 'NIVEL ELEVADO', color: '#f97316' }
    if (level > 50)    return { label: 'LLUVIA INTENSA', color: '#eab308' }
    return { label: 'NORMAL', color: '#22c55e' }
  }

  useEffect(() => {
    if (!mapRef.current) return
    if (stationsWithCoords.length === 0) return

    if (mapInstance.current) {
      mapInstance.current.remove()
      mapInstance.current = null
    }

    import('leaflet').then(async L => {
      const Lx = L.default || L

      if (mapRef.current._leaflet_id) {
        mapRef.current._leaflet_id = null
      }

      const centerLat = stationsWithCoords.reduce((a, s) => a + Number(s.latitude), 0) / stationsWithCoords.length
      const centerLon = stationsWithCoords.reduce((a, s) => a + Number(s.longitude), 0) / stationsWithCoords.length

      const map = Lx.map(mapRef.current, {
        center: [centerLat, centerLon],
        zoom: 13,
        scrollWheelZoom: false,
        dragging: true,
        zoomControl: true,
      })

      setTimeout(() => { map.invalidateSize() }, 200)

      Lx.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19
      }).addTo(map)

      // Cargar GeoJSON de límite de cuenca
      try {
        const limiteRes = await fetch('/Limite_Mburicao_Victoria.geojson')
        const limiteData = await limiteRes.json()
        Lx.geoJSON(limiteData, {
          style: {
            color: '#3b9df8',
            weight: 2.5,
            opacity: 0.9,
            fillColor: '#3b9df8',
            fillOpacity: 0.06,
            dashArray: '6 4'
          }
        }).addTo(map)
      } catch(e) {
        console.warn('No se pudo cargar límite de cuenca:', e)
      }

      // Cargar GeoJSON de subcuencas
      try {
        const subcuencasRes = await fetch('/Subcuencas_Mburicao_Victoria.geojson')
        const subcuencasData = await subcuencasRes.json()

        const subcuencaColors = [
          '#1de3c8', '#f97316', '#a855f7',
          '#eab308', '#22c55e', '#ef4444', '#3b9df8'
        ]
        let colorIdx = 0

        Lx.geoJSON(subcuencasData, {
          style: (feature) => {
            const color = subcuencaColors[colorIdx % subcuencaColors.length]
            colorIdx++
            return {
              color: color,
              weight: 1.5,
              opacity: 0.7,
              fillColor: color,
              fillOpacity: 0.08,
            }
          },
          onEachFeature: (feature, layer) => {
            const props = feature.properties
            const nombre = props?.nombre || props?.name || props?.Name || props?.NOMBRE || 'Subcuenca'
            layer.bindTooltip(nombre, {
              permanent: false,
              direction: 'center',
              className: 'leaflet-tooltip-dark'
            })
          }
        }).addTo(map)
      } catch(e) {
        console.warn('No se pudo cargar subcuencas:', e)
      }

      // Marcadores de estaciones
      stationsWithCoords.forEach(station => {
        const data  = latestData[station.id]
        const color = getColor(station)

        const icon = Lx.divIcon({
          className: '',
          html: `
            <div style="
              width: 32px; height: 32px; border-radius: 50%;
              background: ${color}; border: 2px solid rgba(255,255,255,0.8);
              display: flex; align-items: center; justify-content: center;
              font-family: Space Mono, monospace; font-size: 13px;
              font-weight: 700; color: #fff;
              box-shadow: 0 0 12px ${color}88;
            ">${station.station_code}</div>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        })

        const marker = Lx.marker(
          [Number(station.latitude), Number(station.longitude)],
          { icon }
        ).addTo(map)

        const levelLine = data?.water_level_cm != null
          ? `<div style="margin-bottom:3px">Nivel: <strong style="color:#1de3c8">${Number(data.water_level_cm).toFixed(2)} cm</strong></div>` : ''
        const rainLine = data?.precipitation_mm != null
          ? `<div style="margin-bottom:3px">Lluvia: <strong style="color:#3b9df8">${Number(data.precipitation_mm).toFixed(1)} mm</strong></div>` : ''
        const timeLine = data?.timestamp
          ? `<div style="color:#94a3b8;font-size:10px;margin-top:6px">${new Date(data.timestamp).toLocaleString('es-PY')}</div>` : ''

        marker.bindPopup(`
          <div style="font-size:12px;min-width:160px;font-family:system-ui">
            <div style="font-weight:700;font-size:13px;margin-bottom:8px;color:#1a2332">
              ${station.station_name}
            </div>
            ${levelLine}${rainLine}${timeLine}
          </div>
        `)
      })

      mapInstance.current = map
    })

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove()
        mapInstance.current = null
      }
    }
  }, [])

  if (stationsWithCoords.length === 0) {
    return (
      <div style={{ height: 420, background: '#0f1e30', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a6d99', fontSize: 12 }}>
        Sin coordenadas configuradas
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        ref={mapRef}
        style={{ height: 420, width: '100%', borderRadius: 10, zIndex: 0, position: 'relative' }}
      />

      {/* Lista de estaciones */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {stations.map(station => {
          const data   = latestData[station.id]
          const color  = getColor(station)
          const status = getStatus(station)
          const hasLevel = station.sensor_type.includes('nivel')
          const hasRain  = station.sensor_type.includes('lluvia')

          return (
            <div key={station.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 10px', borderRadius: 8,
              background: '#060c14', border: '1px solid #1d3050'
            }}>
              <div style={{
                width: 26, height: 26, borderRadius: '50%',
                background: color, display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 11, fontWeight: 700,
                color: '#fff', fontFamily: 'Space Mono, monospace', flexShrink: 0,
                boxShadow: `0 0 8px ${color}66`
              }}>
                {station.station_code}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: '#c8ddf5', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {station.station_name}
                </div>
                <div style={{ fontSize: 9, color: status.color, fontFamily: 'Space Mono, monospace', marginTop: 1 }}>
                  {status.label}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                {hasRain && data?.precipitation_mm != null && (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 9, color: '#4a6d99' }}>lluvia</div>
                    <div style={{ fontSize: 12, color: '#3b9df8', fontFamily: 'Space Mono, monospace', fontWeight: 700 }}>
                      {Number(data.precipitation_mm).toFixed(1)}<span style={{ fontSize: 9, color: '#4a6d99' }}>mm</span>
                    </div>
                  </div>
                )}
                {hasLevel && data?.water_level_cm != null && (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 9, color: '#4a6d99' }}>nivel</div>
                    <div style={{ fontSize: 12, color: '#1de3c8', fontFamily: 'Space Mono, monospace', fontWeight: 700 }}>
                      {Number(data.water_level_cm).toFixed(2)}<span style={{ fontSize: 9, color: '#4a6d99' }}>cm</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Leyenda */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {[
          { color: '#22c55e', label: '< 50 cm' },
          { color: '#eab308', label: '50–100 cm' },
          { color: '#f97316', label: '100–200 cm' },
          { color: '#ef4444', label: '> 200 cm' },
        ].map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#4a6d99' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color }} />
            {item.label}
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#4a6d99' }}>
          <div style={{ width: 16, height: 2, background: '#3b9df8', borderRadius: 1 }} />
          Límite cuenca
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#4a6d99' }}>
          <div style={{ width: 16, height: 2, background: '#1de3c8', borderRadius: 1 }} />
          Subcuencas
        </div>
      </div>
    </div>
  )
}