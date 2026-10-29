// Umbrales de nivel del arroyo, en METROS (los mismos del panel 4 de Grafana).
// Única fuente para el gráfico, las tarjetas, el mapa y la tabla:
//   nivel < UMBRAL_NARANJA                 → NORMAL
//   UMBRAL_NARANJA ≤ nivel < UMBRAL_ROJO   → ALERTA  (banda naranja)
//   nivel ≥ UMBRAL_ROJO                    → CRÍTICO (banda roja)
export const UMBRAL_NARANJA = 2
export const UMBRAL_ROJO    = 3

// Sin lecturas durante más de esto, el último dato se marca "sin lecturas
// nuevas" (la estación reporta cada 5 min).
export const MAX_SIN_DATOS_MS = 30 * 60 * 1000

export const statusForLevel = (m) =>
  m >= UMBRAL_ROJO ? 'critico' : m >= UMBRAL_NARANJA ? 'alerta' : 'normal'

export const STATUS_LABEL = {
  normal:   'NORMAL',
  atencion: 'ATENCIÓN',
  alerta:   'ALERTA',
  critico:  'CRÍTICO',
}

export const POLL_INTERVAL_MS = 60_000
export const CHART_SAMPLE_CAP = 600
