export const dynamic = 'force-dynamic';

// Serie Nivel + Lluvia de la estación Colegio SIL, leída del datasource MySQL
// del Grafana externo (dashboard 30yTZR8Nz, panel 4 "Nivel y Lluvia SIL")
// mediante /api/ds/query con acceso anónimo (viewer).

const GRAFANA_BASE = 'http://200.10.231.202:3000';
const ORG_ID       = 2;
const DATASOURCE   = { type: 'mysql', uid: 'cpH4-LwNk' };

// Zona horaria: timeStamp se guarda en hora local de Paraguay (UTC−3) y la
// sesión MySQL del datasource también está en −03:00.
//  - SELECT: Grafana interpreta los DATETIME como UTC, por eso se suma 3 h
//    (igual que en el panel) para obtener el instante UTC correcto.
//  - WHERE: $__timeFilter genera FROM_UNIXTIME(...), que en la sesión −03:00
//    ya devuelve hora local, así que se compara contra timeStamp SIN shift.
//    (Restar 3 h acá desplazaría la ventana 3 h hacia atrás; verificado.)
// Nivel = 7.0 − lectura del sensor (distancia al agua), como en el panel.
const SERIES_SQL = `
SELECT
  DATE_ADD(timeStamp, INTERVAL 3 HOUR) AS "time",
  (7.0 - Nivel) AS nivel,
  lluvia
FROM Mburicao_Sil_RainAndLevel
WHERE $__timeFilter(timeStamp)
ORDER BY timeStamp`;

// Última lectura de toda la tabla (no solo del rango), para el indicador
// "último dato hace X".
const LATEST_SQL = `
SELECT DATE_ADD(MAX(timeStamp), INTERVAL 3 HOUR) AS ultimo
FROM Mburicao_Sil_RainAndLevel`;

// Cómo se calcula "lluvia acumulada 1 h" sobre las lecturas de (t − 1 h, t]:
//  'suma'     → suma de las lecturas (correcto si `lluvia` son mm caídos en
//               cada intervalo de 5 min).
//  'promedio' → promedio de las lecturas, como la query C del panel de
//               Grafana (correcto si `lluvia` es una intensidad en mm/h).
// Los datos sugieren intensidad (mediana de lecturas con lluvia ≈ 12, que como
// mm cada 5 min serían ~144 mm/h); confirmar la unidad del sensor.
const ACUM_1H_MODO = 'suma';

const HOUR_MS = 3600 * 1000;
const DAY_MS  = 24 * HOUR_MS;

const DEFAULT_FROM = 'now-24h';
const DEFAULT_TO   = 'now';
// Límites: hasta 31 días por consulta (~9k lecturas cada 5 min) y nada
// anterior al inicio de la serie.
const MAX_SPAN_MS = 31 * DAY_MS;
const MIN_FROM_MS = Date.UTC(2025, 0, 1);

const TIMEOUT_MS = 10_000;

const UNIT_MS = { m: 60 * 1000, h: HOUR_MS, d: DAY_MS };

// Accepts epoch ms, `now`, or `now-<n><m|h|d>` (relative values keep the URL
// stable between polls, so the CDN cache can actually serve repeats).
function parseTime(value, now) {
  if (/^\d{12,14}$/.test(value)) return Number(value);
  const m = /^now(?:-(\d{1,4})([mhd]))?$/.exec(value);
  if (!m) return null;
  return m[1] ? now - Number(m[1]) * UNIT_MS[m[2]] : now;
}

function errorResponse(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function frameColumns(result) {
  if (result?.error) throw new Error(result.error);
  const frame = result?.frames?.[0];
  if (!frame) return {};
  const cols = {};
  frame.schema.fields.forEach((f, i) => { cols[f.name] = frame.data?.values?.[i] ?? []; });
  return cols;
}

const round = (v, digits) => (v == null ? null : Number(Number(v).toFixed(digits)));

export async function GET(request) {
  const sp  = request.nextUrl.searchParams;
  const now = Date.now();

  const from = parseTime(sp.get('from') || DEFAULT_FROM, now);
  let   to   = parseTime(sp.get('to')   || DEFAULT_TO,   now);
  if (from == null || to == null) {
    return errorResponse(400, 'from/to inválidos: usar epoch ms, "now" o "now-<n>[m|h|d]"');
  }
  to = Math.min(to, now + 5 * 60 * 1000);
  if (from >= to)                 return errorResponse(400, '"from" debe ser anterior a "to"');
  if (to - from > MAX_SPAN_MS)    return errorResponse(400, 'El rango máximo es de 31 días');
  if (from < MIN_FROM_MS)         return errorResponse(400, 'El rango empieza antes del inicio de la serie');

  // One extra hour before `from` so the 1 h accumulation of the first points
  // includes the readings that precede the range.
  const body = {
    from: String(from - HOUR_MS),
    to:   String(to),
    queries: [
      { refId: 'A', datasource: DATASOURCE, rawQuery: true, format: 'table', rawSql: SERIES_SQL },
      { refId: 'U', datasource: DATASOURCE, rawQuery: true, format: 'table', rawSql: LATEST_SQL },
    ],
  };

  let res;
  try {
    res = await fetch(`${GRAFANA_BASE}/api/ds/query?orgId=${ORG_ID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Grafana-Org-Id': String(ORG_ID) },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    if (err.name === 'TimeoutError') {
      return errorResponse(502, `Grafana no respondió en ${TIMEOUT_MS / 1000} s`);
    }
    return errorResponse(502, 'No se pudo contactar al servidor de Grafana');
  }
  if (!res.ok) return errorResponse(502, `Grafana devolvió ${res.status}`);

  let series, latest;
  try {
    const json = await res.json();
    series = frameColumns(json.results?.A);
    latest = frameColumns(json.results?.U);
  } catch (err) {
    return errorResponse(502, `Respuesta inválida de Grafana: ${err.message}`);
  }

  // The table has a few duplicated rows (same timeStamp twice); keep one so
  // they don't count twice in the 1 h window.
  const rows = [];
  (series.time ?? []).forEach((t, i) => {
    if (rows.length && rows[rows.length - 1].t === t) return;
    rows.push({ t, nivel: series.nivel?.[i], lluvia: Number(series.lluvia?.[i] ?? 0) });
  });

  // Lluvia acumulada 1 h sobre las lecturas en (t − 1 h, t] (12 lecturas
  // cuando no faltan datos), con una ventana deslizante. Ver ACUM_1H_MODO.
  const puntos = [];
  let windowStart = 0;
  let windowSum   = 0;
  for (let i = 0; i < rows.length; i++) {
    windowSum += rows[i].lluvia;
    while (rows[windowStart].t <= rows[i].t - HOUR_MS) {
      windowSum -= rows[windowStart].lluvia;
      windowStart++;
    }
    if (rows[i].t < from) continue;
    const acum = ACUM_1H_MODO === 'promedio' ? windowSum / (i - windowStart + 1) : windowSum;
    puntos.push({
      t:      rows[i].t,
      nivel:  round(rows[i].nivel, 3),
      lluvia: round(rows[i].lluvia, 2),
      acum1h: round(Math.max(0, acum), 2),
    });
  }

  return new Response(JSON.stringify({
    from,
    to,
    ultimo: latest.ultimo?.[0] ?? null,
    puntos,
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=60',
    },
  });
}
