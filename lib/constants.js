export const LEVEL_THRESHOLDS = { ATENCION: 50, ALERTA: 100, CRITICO: 200 }

export const statusForLevel = (cm) =>
  cm >= 200 ? 'critico' : cm >= 100 ? 'alerta' : cm >= 50 ? 'atencion' : 'normal'

export const STATUS_LABEL = {
  normal:   'NORMAL',
  atencion: 'ATENCIÓN',
  alerta:   'ALERTA',
  critico:  'CRÍTICO',
}

export const POLL_INTERVAL_MS = 60_000
export const CHART_SAMPLE_CAP = 600
