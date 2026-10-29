'use client'

import { useEffect, useState } from 'react'
import { POLL_INTERVAL_MS } from './constants'

// Polls /api/grafana-data for the given range every POLL_INTERVAL_MS.
// `from` / `to` are passed through as-is (epoch ms or Grafana-style relative
// values such as 'now-7d' / 'now').
//
// With { soloUltimo: true } only the latest reading is requested (KPI cards).
//
// Returns:
//   data     { from, to, ultimo, ultimaLectura, puntos: [{ t, nivel, lluvia, acum1h }] }
//            for the current range (no from/to/puntos with soloUltimo), or
//            null until its first response arrives
//   error    message of the last failed request (data from an earlier
//            successful poll is kept alongside it)
//   loading  true while the current range has no response yet
//   retrying true while a manual retry is in flight
//   retry()  re-requests immediately and restarts the polling interval
export function useGrafanaSeries(from, to, { soloUltimo = false } = {}) {
  const rangeKey = `${from}|${to}|${soloUltimo}`
  const [state, setState]       = useState({ rangeKey: null, data: null, error: null })
  const [attempt, setAttempt]   = useState(0)
  const [retrying, setRetrying] = useState(false)

  useEffect(() => {
    let cancelled = false
    let controller = null

    async function load() {
      controller?.abort()
      controller = new AbortController()
      try {
        const params = new URLSearchParams({ from, to })
        if (soloUltimo) params.set('solo', 'ultimo')
        const res  = await fetch(`/api/grafana-data?${params}`, { signal: controller.signal })
        const body = await res.json().catch(() => null)
        if (!res.ok) throw new Error(body?.error || `Error ${res.status}`)
        if (!cancelled) setState({ rangeKey, data: body, error: null })
      } catch (err) {
        if (cancelled || err.name === 'AbortError') return
        setState(s => ({
          rangeKey,
          data: s.rangeKey === rangeKey ? s.data : null,
          error: err.message || 'No se pudieron obtener los datos de Grafana',
        }))
      } finally {
        if (!cancelled) setRetrying(false)
      }
    }

    load()
    const id = setInterval(load, POLL_INTERVAL_MS)
    return () => { cancelled = true; clearInterval(id); controller?.abort() }
  }, [from, to, soloUltimo, rangeKey, attempt])

  const current = state.rangeKey === rangeKey
  return {
    data:    current ? state.data : null,
    error:   current ? state.error : null,
    loading: !current,
    retrying,
    retry() { setRetrying(true); setAttempt(a => a + 1) },
  }
}
