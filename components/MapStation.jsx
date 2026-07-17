'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const MONO = 'var(--font-mono, "Space Mono", monospace)'

export default function MapStation({ stations, latestData }) {
  const mapRef      = useRef(null)
  const mapInstance = useRef(null)

  const stationsWithCoords = stations.filter(s => s.latitude && s.longitude)

  // Fullscreen lightbox for the camera feed — lives outside Leaflet's popup
  // entirely, because the popup sits inside a map container with
  // overflow:hidden and a fixed height, which clipped a large photo no
  // matter how the popup's own sizing was tuned.
  const [camModal, setCamModal] = useState({ open: false, loading: false, url: null, timestamp: null, error: null, station: '' })

  const openCameraModal = useCallback(async (stationName) => {
    setCamModal({ open: true, loading: true, url: null, timestamp: null, error: null, station: stationName })
    try {
      const res = await fetch(`/api/last-image?t=${Date.now()}`, { cache: 'no-store' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Sin imagen disponible')
      }
      const blob = await res.blob()
      const ts   = res.headers.get('X-Photo-Timestamp')
      const url  = URL.createObjectURL(blob)
      setCamModal({ open: true, loading: false, url, timestamp: ts, error: null, station: stationName })
    } catch (err) {
      setCamModal({ open: true, loading: false, url: null, timestamp: null, error: err.message || 'Sin imagen disponible', station: stationName })
    }
  }, [])

  const closeCameraModal = useCallback(() => {
    setCamModal(prev => {
      if (prev.url) URL.revokeObjectURL(prev.url)
      return { open: false, loading: false, url: null, timestamp: null, error: null, station: '' }
    })
  }, [])

  // Close on Escape while the modal is open
  useEffect(() => {
    if (!camModal.open) return
    function onKeyDown(e) { if (e.key === 'Escape') closeCameraModal() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [camModal.open, closeCameraModal])

  // Revoke the blob URL on unmount if the modal was left open
  useEffect(() => {
    return () => {
      setCamModal(prev => {
        if (prev.url) URL.revokeObjectURL(prev.url)
        return prev
      })
    }
  }, [])

  // Inject Leaflet CSS once on first mount — moved here from layout.js so it is
  // no longer a render-blocking CDN resource in <head>.
  useEffect(() => {
    if (document.querySelector('link[data-leaflet-css]')) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    link.setAttribute('data-leaflet-css', '')
    document.head.appendChild(link)
  }, [])

  function getColor(station) {
    const level = latestData[station.id]?.water_level_cm
    if (level == null) return 'var(--accent)'
    if (level > 200)   return 'var(--st-critico)'
    if (level > 100)   return 'var(--st-alerta)'
    if (level > 50)    return 'var(--st-atencion)'
    return 'var(--st-normal)'
  }

  function getStatus(station) {
    const level = latestData[station.id]?.water_level_cm
    if (level == null) return { label: 'SIN DATOS',         color: 'var(--ink-3)' }
    if (level > 200)   return { label: 'RIESGO INUNDACIÓN', color: 'var(--st-critico)' }
    if (level > 100)   return { label: 'NIVEL ELEVADO',     color: 'var(--st-alerta)' }
    if (level > 50)    return { label: 'LLUVIA INTENSA',    color: 'var(--st-atencion)' }
    return { label: 'NORMAL', color: 'var(--st-normal)' }
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!mapRef.current) return
    if (stationsWithCoords.length === 0) return
    if (mapInstance.current) return

    if (mapRef.current._leaflet_id) {
      mapRef.current._leaflet_id = null
    }

    let isMounted       = true
    let resizeObserver  = null
    let themeObserver   = null
    let watershedBounds = null
    let tileLayer       = null
    let limitLayer      = null
    let subLayer        = null

    function isDark() {
      return document.documentElement.classList.contains('dark')
    }

    // Resolve CSS token values at call time so style objects always reflect
    // the current theme. Leaflet GeoJSON style objects don't go through the CSS
    // cascade — values must be resolved hex/rgb strings, not var() references.
    function resolveTokens() {
      const css  = getComputedStyle(document.documentElement)
      const dark = isDark()
      return {
        accent: css.getPropertyValue('--accent').trim() || (dark ? '#5b9bff' : '#1c54a8'),
        rain:   css.getPropertyValue('--rain').trim()   || (dark ? '#5cb6d6' : '#3f8fb0'),
        dark,
      }
    }

    function makeTileLayer(Lx, dark) {
      return dark
        ? Lx.tileLayer(
            'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
            {
              attribution:
                '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> ' +
                '© <a href="https://carto.com/attributions">CARTO</a>',
              subdomains: 'abcd',
              maxZoom: 19,
            }
          )
        : Lx.tileLayer(
            'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
            {
              attribution:
                '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
              maxZoom: 19,
            }
          )
    }

    function limitStyle(t) {
      return {
        color:       t.accent,
        weight:      2,
        fillColor:   t.accent,
        fillOpacity: t.dark ? 0.10 : 0.05,
        dashArray:   '5, 10',
      }
    }

    function subcuencaStyle(t) {
      return {
        color:       t.rain,
        weight:      1,
        fillColor:   t.rain,
        fillOpacity: t.dark ? 0.15 : 0.08,
      }
    }

    import('leaflet').then(async (L) => {
      if (!isMounted) return
      const Lx = L.default || L

      const tokens = resolveTokens()

      const centerLat = stationsWithCoords.reduce((a, s) => a + Number(s.latitude),  0) / stationsWithCoords.length
      const centerLon = stationsWithCoords.reduce((a, s) => a + Number(s.longitude), 0) / stationsWithCoords.length

      const map = Lx.map(mapRef.current, {
        center: [centerLat, centerLon],
        zoom: 13,
        scrollWheelZoom: false,
        dragging: true,
        zoomControl: true,
      })
      mapInstance.current = map
      map.invalidateSize()

      tileLayer = makeTileLayer(Lx, tokens.dark).addTo(map)

      // Metric scale bar (bottom-left, metric only)
      Lx.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(map)

      // GeoJSON watershed layers
      try {
        const resLimite = await fetch('/Limite_Mburicao_Victoria.json')
        if (resLimite.ok && isMounted) {
          const dataLimite = await resLimite.json()
          limitLayer      = Lx.geoJSON(dataLimite, { style: limitStyle(tokens) }).addTo(map)
          watershedBounds = limitLayer.getBounds()
          map.invalidateSize()
          map.fitBounds(watershedBounds, { padding: [16, 16] })
        }

        const resSub = await fetch('/Subcuencas_Mburicao_Victoria.json')
        if (resSub.ok && isMounted) {
          const dataSub = await resSub.json()
          subLayer = Lx.geoJSON(dataSub, { style: subcuencaStyle(tokens) }).addTo(map)
        }
      } catch {
        // GeoJSON load failure is non-fatal — map still works without polygons
      }

      // Station markers
      // Marker icons use CSS vars inline (browser resolves them on render).
      // Popup content also uses CSS vars. Tooltip text is plain HTML resolved at
      // bind time — status color must be a resolved string, not a var() reference,
      // because Leaflet renders it inside a detached DOM fragment before insertion.
      stationsWithCoords.forEach(station => {
        const data   = latestData[station.id]
        const color  = getColor(station)
        const status = getStatus(station)

        // Resolve status color to an actual hex string for tooltip use
        const css          = getComputedStyle(document.documentElement)
        const statusKey    = status.color.replace('var(--', '').replace(')', '')
        const statusColor  = css.getPropertyValue('--' + statusKey).trim() || status.color

        const icon = Lx.divIcon({
          className: '',
          html: `<div style="
            width:32px;height:32px;border-radius:50%;
            background:${color};border:2.5px solid rgba(255,255,255,0.9);
            display:flex;align-items:center;justify-content:center;
            font-family:'Space Mono',monospace;font-size:11px;font-weight:700;color:#fff;
            box-shadow:0 2px 6px rgba(0,0,0,0.4),0 0 0 1px rgba(0,0,0,0.10);
          ">${station.station_code}</div>`,
          iconSize:    [32, 32],
          iconAnchor:  [16, 16],
          popupAnchor: [0, -20],
        })

        const marker = Lx.marker(
          [Number(station.latitude), Number(station.longitude)],
          { icon }
        ).addTo(map)

        // Hover tooltip — shows station name, level, rainfall, status
        const levelText = data?.water_level_cm   != null ? `Nivel: ${Number(data.water_level_cm).toFixed(2)} cm`  : ''
        const rainText  = data?.precipitation_mm != null ? `Lluvia: ${Number(data.precipitation_mm).toFixed(1)} mm` : ''

        marker.bindTooltip(`
          <div style="font-family:system-ui;line-height:1.5;min-width:130px">
            <div style="font-weight:700;font-size:12px;margin-bottom:3px">${station.station_name}</div>
            ${levelText ? `<div style="font-size:11px">${levelText}</div>` : ''}
            ${rainText  ? `<div style="font-size:11px">${rainText}</div>`  : ''}
            <div style="font-size:10px;font-weight:600;color:${statusColor};margin-top:3px">${status.label}</div>
          </div>
        `, { direction: 'top', offset: [0, -20], opacity: 0.97 })

        // Click popup — shows level/rain/status; non-camera stations also
        // fetch their latest photo from media_records on open
        const levelLine  = data?.water_level_cm   != null
          ? `<div style="margin-bottom:3px">Nivel: <strong style="color:var(--level)">${Number(data.water_level_cm).toFixed(2)} cm</strong></div>` : ''
        const rainLine   = data?.precipitation_mm != null
          ? `<div style="margin-bottom:3px">Lluvia: <strong style="color:var(--rain)">${Number(data.precipitation_mm).toFixed(1)} mm</strong></div>` : ''
        const statusLine = `<div style="color:${statusColor};font-size:10px;font-weight:600;margin-top:4px">${status.label}</div>`
        const timeLine   = data?.timestamp
          ? `<div style="color:var(--ink-4);font-size:10px;margin-top:6px">${new Date(data.timestamp).toLocaleString('es-PY')}</div>` : ''

        // Shared station header used across all popup states
        const stationHeader = `
          <div style="font-weight:700;font-size:13px;margin-bottom:8px;color:var(--ink)">${station.station_name}</div>
          ${levelLine}${rainLine}${statusLine}${timeLine}
        `
        const wrapPopup = (inner) =>
          `<div style="font-size:12px;min-width:180px;font-family:system-ui;color:var(--ink)">${stationHeader}${inner}</div>`

        // keepInView + explicit autoPan padding fix the real bug: the popup
        // opens with a tiny "loading" placeholder (fits fine), then grows
        // once the photo loads. Plain autoPan only runs once at open time,
        // so the taller popup ended up clipped by the map container's
        // overflow:hidden and overlapping the top-left zoom control. This is
        // NOT forced-open — bindPopup keeps the standard click-to-open
        // behavior; autoClose/closeOnClick just make that explicit.
        const popup = Lx.popup({
          maxWidth: 300,
          minWidth: 180,
          autoPan: true,
          keepInView: true,
          autoPanPaddingTopLeft: Lx.point(12, 60),
          autoPanPaddingBottomRight: Lx.point(12, 12),
          autoClose: true,
          closeOnClick: true,
        })
          .setContent(wrapPopup(
            `<div style="margin-top:8px;font-size:10px;color:var(--ink-4);text-align:center;padding:4px">Cargando imagen…</div>`
          ))
        marker.bindPopup(popup)

        // Estación A (nivel+lluvia) has a live camera feed at /api/last-image
        // instead of a media_records row — the other stations only ever get
        // photos uploaded into media_records. The photo itself no longer
        // lives inside the popup (see camModal) — the popup just gets a
        // button that opens the fullscreen lightbox.
        const isCameraStation = station.sensor_type === 'nivel+lluvia'

        if (isCameraStation) {
          popup.setContent(wrapPopup(`
            <button type="button" class="cam-open-btn" style="
              margin-top:8px;width:100%;display:flex;align-items:center;justify-content:center;gap:6px;
              padding:8px 10px;border-radius:6px;border:1px solid var(--border);
              background:var(--panel-alt, rgba(61,157,248,0.08));color:var(--accent, #3b9df8);
              font-size:11px;font-weight:600;font-family:system-ui;cursor:pointer;
            ">📷 Ver foto de la cámara</button>
          `))
        }

        marker.on('popupopen', async () => {
          if (isCameraStation) {
            // Content is static (no fetch here) — attach the button's click
            // handler once; dataset.bound guards against double-binding
            // since the popup's DOM node is reused across open/close cycles.
            const el  = popup.getElement()
            const btn = el?.querySelector('.cam-open-btn')
            if (btn && !btn.dataset.bound) {
              btn.dataset.bound = '1'
              btn.addEventListener('click', (e) => {
                e.stopPropagation()
                openCameraModal(station.station_name)
              })
            }
            return
          }

          // Reset to loading state each open
          popup.setContent(wrapPopup(
            `<div style="margin-top:8px;font-size:10px;color:var(--ink-4);text-align:center;padding:4px">Cargando imagen…</div>`
          ))
          popup.update()

          try {
            const { data: mediaRow, error: mediaErr } = await supabase
              .from('media_records')
              .select('file_url, timestamp, media_type')
              .eq('station_id', station.id)
              .order('timestamp', { ascending: false })
              .limit(1)
              .maybeSingle()

            if (mediaErr || !mediaRow) {
              popup.setContent(wrapPopup(
                `<div style="margin-top:8px;font-size:10px;color:var(--ink-4);text-align:center">Sin imagen disponible</div>`
              ))
              popup.update()
              return
            }

            // Support both full URLs and storage-relative paths
            const imgUrl = (mediaRow.file_url.startsWith('http')
              ? mediaRow.file_url
              : supabase.storage.from('hydromet-media').getPublicUrl(mediaRow.file_url).data.publicUrl
            ) + `?t=${Date.now()}`

            const photoTs = `<div style="color:var(--ink-4);font-size:9px;margin-top:3px;text-align:right">${new Date(mediaRow.timestamp).toLocaleString('es-PY')}</div>`

            popup.setContent(wrapPopup(`
              <div style="margin-top:8px;max-width:280px;margin-left:auto;margin-right:auto;border-radius:6px;overflow:hidden;border:1px solid var(--border)">
                <img
                  src="${imgUrl}"
                  alt="Foto ${station.station_name}"
                  style="width:100%;max-width:280px;height:auto;max-height:160px;object-fit:cover;display:block"
                  onerror="this.outerHTML='<div style=&quot;font-size:10px;color:var(--ink-4);text-align:center;padding:6px&quot;>Sin imagen disponible</div>'"
                />
              </div>
              ${photoTs}
            `))
            popup.update()

          } catch {
            popup.setContent(wrapPopup(
              `<div style="margin-top:8px;font-size:10px;color:var(--ink-4);text-align:center">Error al cargar imagen</div>`
            ))
            popup.update()
          }
        })
      })

      // Theme observer: swaps basemap tile layer and restyles GeoJSON polygons
      // whenever ThemeProvider toggles the .dark class on <html>.
      themeObserver = new MutationObserver(() => {
        if (!mapInstance.current || !isMounted) return
        const t = resolveTokens()

        // Swap basemap
        if (tileLayer) mapInstance.current.removeLayer(tileLayer)
        tileLayer = makeTileLayer(Lx, t.dark)
        tileLayer.addTo(mapInstance.current)
        tileLayer.bringToBack()

        // Restyle watershed polygons to match new theme
        if (limitLayer) limitLayer.setStyle(limitStyle(t))
        if (subLayer)   subLayer.setStyle(subcuencaStyle(t))
      })
      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class'],
      })

      // ResizeObserver: re-invalidates on grid breakpoint change or window resize
      if (mapRef.current) {
        resizeObserver = new ResizeObserver(() => {
          if (mapInstance.current) mapInstance.current.invalidateSize()
        })
        resizeObserver.observe(mapRef.current)
      }

      // Delayed re-fit: ensures correct bounds after CSS layout fully settles
      setTimeout(() => {
        if (!isMounted || !mapInstance.current) return
        mapInstance.current.invalidateSize()
        if (watershedBounds) mapInstance.current.fitBounds(watershedBounds, { padding: [16, 16] })
      }, 400)
    })

    return () => {
      isMounted = false
      if (themeObserver)  { themeObserver.disconnect();  themeObserver  = null }
      if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null }
      if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null }
    }
  }, [])

  if (stationsWithCoords.length === 0) {
    return (
      <div style={{
        height: 260, background: 'var(--panel)', borderRadius: 12,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--ink-3)', fontSize: 12,
      }}>
        Sin coordenadas configuradas
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Map container — responsive height via Tailwind static class literals */}
      <div
        ref={mapRef}
        role="application"
        aria-label="Mapa de la cuenca Arroyo Mburicaó con estaciones hidrometeorológicas"
        className="h-[230px] md:h-[354px] xl:h-[300px]"
        style={{
          width: '100%', borderRadius: 8,
          zIndex: 0, position: 'relative',
          border: '1px solid var(--border)',
          overflow: 'hidden',
        }}
      />

      {/* Station list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {stations.map(station => {
          const data     = latestData[station.id]
          const color    = getColor(station)
          const status   = getStatus(station)
          const hasLevel = station.sensor_type?.includes('nivel')
          const hasRain  = station.sensor_type?.includes('lluvia')

          return (
            <div key={station.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 10px', borderRadius: 8,
              background: 'var(--app)', border: '1px solid var(--border)',
            }}>
              {/* Station badge */}
              <div style={{
                width: 26, height: 26, borderRadius: '50%',
                background: color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, color: '#fff',
                fontFamily: MONO, flexShrink: 0,
                boxShadow: `0 0 8px ${color}`,
              }}>
                {station.station_code}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 12, color: 'var(--ink)', fontWeight: 500,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {station.station_name}
                </div>
                <div style={{
                  fontSize: 9, color: status.color,
                  fontFamily: MONO, marginTop: 1,
                }}>
                  {status.label}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                {hasRain && data?.precipitation_mm != null && (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 9, color: 'var(--ink-4)' }}>lluvia</div>
                    <div style={{ fontSize: 12, color: 'var(--rain)', fontFamily: MONO, fontWeight: 700 }}>
                      {Number(data.precipitation_mm).toFixed(1)}
                      <span style={{ fontSize: 9, color: 'var(--ink-4)' }}>mm</span>
                    </div>
                  </div>
                )}
                {hasLevel && data?.water_level_cm != null && (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 9, color: 'var(--ink-4)' }}>nivel</div>
                    <div style={{ fontSize: 12, color: 'var(--level)', fontFamily: MONO, fontWeight: 700 }}>
                      {Number(data.water_level_cm).toFixed(2)}
                      <span style={{ fontSize: 9, color: 'var(--ink-4)' }}>cm</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Threshold legend — color + label + range (not color alone, per WCAG 1.4.1) */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', padding: '0 2px' }}>
        {[
          { color: 'var(--st-normal)',   label: 'NORMAL',   range: '0–50 cm'    },
          { color: 'var(--st-atencion)', label: 'ATENCIÓN', range: '50–100 cm'  },
          { color: 'var(--st-alerta)',   label: 'ALERTA',   range: '100–200 cm' },
          { color: 'var(--st-critico)',  label: 'CRÍTICO',  range: '> 200 cm'   },
        ].map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
            <span style={{ color: item.color, fontWeight: 600, fontFamily: MONO }}>{item.label}</span>
            <span style={{ color: 'var(--ink-4)', fontFamily: MONO }}>{item.range}</span>
          </div>
        ))}
      </div>

      {/* Camera lightbox — fixed overlay above the whole page, not clipped by
          the map container's overflow:hidden like the old in-popup image was. */}
      {camModal.open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Foto ${camModal.station || 'cámara'}`}
          onClick={closeCameraModal}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'relative',
              maxWidth: 'min(90vw, 720px)', maxHeight: '90vh',
              background: 'var(--panel)', borderRadius: 10, overflow: 'hidden',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }}
          >
            <button
              type="button"
              onClick={closeCameraModal}
              aria-label="Cerrar"
              style={{
                position: 'absolute', top: 8, right: 8, zIndex: 1,
                width: 32, height: 32, borderRadius: '50%',
                background: 'rgba(0,0,0,0.55)', color: '#fff', border: 'none',
                cursor: 'pointer', fontSize: 18, lineHeight: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              ✕
            </button>

            {camModal.loading && (
              <div style={{
                width: '80vw', maxWidth: 500, height: 300,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--ink-3)', fontSize: 13, fontFamily: 'system-ui',
              }}>
                Cargando imagen…
              </div>
            )}

            {camModal.error && !camModal.loading && (
              <div style={{
                width: '80vw', maxWidth: 500, height: 300, padding: 20,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--st-critico, #ef4444)', fontSize: 13,
                fontFamily: 'system-ui', textAlign: 'center',
              }}>
                {camModal.error}
              </div>
            )}

            {camModal.url && !camModal.loading && !camModal.error && (
              <>
                <img
                  src={camModal.url}
                  alt={`Última foto de la cámara — ${camModal.station}`}
                  style={{ display: 'block', width: '100%', maxWidth: '80vw', maxHeight: '80vh', objectFit: 'contain' }}
                />
                {camModal.timestamp && (
                  <div style={{
                    padding: '8px 12px', fontSize: 12, color: 'var(--ink-3)',
                    textAlign: 'center', background: 'var(--panel)', fontFamily: MONO,
                  }}>
                    {new Date(camModal.timestamp).toLocaleString('es-PY')}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
