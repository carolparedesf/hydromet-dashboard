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
//
// "Lluvia Acumulada 1h (mm)" se calcula en MySQL igual que la query C del
// panel: ventana móvil de las últimas 12 lecturas (ROWS BETWEEN 11 PRECEDING
// AND CURRENT ROW, ordenadas por timeStamp), sin topes ni descartes, para
// dar los mismos números que Grafana. Valores de ACUM_1H_MODO:
//  'promedio' → AVG(lluvia), exactamente como la query C del panel.
//  'suma'     → SUM(lluvia) sobre la misma ventana de 12 lecturas.
const ACUM_1H_MODO = 'promedio';
const ACUM_FN = ACUM_1H_MODO === 'suma' ? 'SUM' : 'AVG';
const ACUM_WINDOW = `${ACUM_FN}(lluvia) OVER (ORDER BY timeStamp ROWS BETWEEN 11 PRECEDING AND CURRENT ROW)`;

// Serie agrupada en MySQL por buckets de tiempo de bucketSeg segundos, para
// devolver como máximo ~MAX_PUNTOS puntos aun con la tabla completa:
//  - base: cada lectura con su acum1h, calculado como la query C del panel
//    (ventana de 12 lecturas). La query C corre sobre toda la tabla, así que
//    la ventana de las primeras lecturas del rango incluye lecturas
//    anteriores: base arranca en la 11.ª lectura previa al rango.
//  - ranked: asigna el bucket y numera las lecturas de cada bucket por nivel
//    y por acum1h descendentes, para saber a qué hora ocurrió cada máximo.
//  - Por bucket: MAX(nivel) con su hora (el punto se ubica ahí), MAX(lluvia),
//    SUM(lluvia) (totales diarios), MAX(acum1h) con su hora, inicio/fin y
//    cantidad de lecturas. Con buckets de 5 min cada punto es una lectura.
// Los buckets se alinean a la hora local (UTC−3) para que los de varias
// horas no crucen la medianoche de Paraguay.
const LOCAL_OFFSET_S = 3 * 3600;
const seriesSql = (bucketSeg) => {
  const bucket = `FLOOR((UNIX_TIMESTAMP(timeStamp) - ${LOCAL_OFFSET_S}) / ${bucketSeg})`;
  return `
WITH base AS (
  SELECT timeStamp, (7.0 - Nivel) AS nivel, lluvia, ${ACUM_WINDOW} AS acum1h
  FROM Mburicao_Sil_RainAndLevel
  WHERE timeStamp >= COALESCE(
      (SELECT timeStamp FROM Mburicao_Sil_RainAndLevel
       WHERE timeStamp < $__timeFrom()
       ORDER BY timeStamp DESC LIMIT 1 OFFSET 10),
      '1970-01-01')
    AND timeStamp <= $__timeTo()
),
ranked AS (
  SELECT base.*,
    ${bucket} AS b,
    ROW_NUMBER() OVER (PARTITION BY ${bucket} ORDER BY nivel DESC, timeStamp)  AS rn_nivel,
    ROW_NUMBER() OVER (PARTITION BY ${bucket} ORDER BY acum1h DESC, timeStamp) AS rn_acum
  FROM base
  WHERE $__timeFilter(timeStamp)
)
SELECT
  DATE_ADD(MAX(CASE WHEN rn_nivel = 1 THEN timeStamp END), INTERVAL 3 HOUR) AS "time",
  DATE_ADD(MIN(timeStamp), INTERVAL 3 HOUR) AS t_inicio,
  DATE_ADD(MAX(timeStamp), INTERVAL 3 HOUR) AS t_fin,
  DATE_ADD(MAX(CASE WHEN rn_acum = 1 THEN timeStamp END), INTERVAL 3 HOUR) AS t_acum,
  COUNT(*) AS n,
  MAX(nivel)  AS nivel,
  MAX(lluvia) AS lluvia,
  SUM(lluvia) AS lluvia_suma,
  MAX(acum1h) AS acum1h
FROM ranked
GROUP BY b
ORDER BY b`;
};

// Últimas 12 lecturas de toda la tabla (no solo del rango): la última es
// "ultimaLectura" (tarjetas, indicador "último dato hace X") y su acum1h es
// la ventana de esas 12, igual que la query C para la fila más reciente.
const LATEST_SQL = `
SELECT
  DATE_ADD(timeStamp, INTERVAL 3 HOUR) AS "time",
  (7.0 - Nivel) AS nivel,
  lluvia,
  ${ACUM_WINDOW} AS acum1h
FROM (
  SELECT timeStamp, Nivel, lluvia
  FROM Mburicao_Sil_RainAndLevel
  ORDER BY timeStamp DESC
  LIMIT 12
) last12
ORDER BY timeStamp`;

const HOUR_MS = 3600 * 1000;
const DAY_MS  = 24 * HOUR_MS;

const DEFAULT_FROM = 'now-24h';
const DEFAULT_TO   = 'now';
// Inicio de la serie (primera lectura: 2026-07-10, hora local). "from" puede
// abarcar toda la tabla; uno anterior se recorta acá. ?from=inicio lo usa
// directamente ("Todo el período").
const MIN_FROM_MS = Date.UTC(2026, 6, 10, 3, 0, 0);

// Tamaño de bucket según el rango: 5 min (cada lectura) hasta ~7 días; más
// allá, la menor cantidad de horas que deje ≤ MAX_PUNTOS puntos, entre
// divisores de 24 h para que los buckets no crucen la medianoche.
const MAX_PUNTOS   = 2000;
const RAW_BUCKET_S = 5 * 60;
const HOUR_BUCKETS = [1, 2, 3, 4, 6, 8, 12, 24];
function bucketSecondsFor(spanMs) {
  if (spanMs <= 7 * DAY_MS + HOUR_MS) return RAW_BUCKET_S;
  const hours = HOUR_BUCKETS.find(h => spanMs / (h * HOUR_MS) <= MAX_PUNTOS) ?? 24;
  return hours * 3600;
}

// Caché en el CDN: 60 s para rangos finos; 5 min cuando hay agrupación por
// horas (rangos largos), que cambian poco entre consultas.
const CACHE_SHORT = 'public, s-maxage=60, stale-while-revalidate=60';
const CACHE_LONG  = 'public, s-maxage=300, stale-while-revalidate=300';

const TIMEOUT_MS = 10_000;

const UNIT_MS = { m: 60 * 1000, h: HOUR_MS, d: DAY_MS };

// Accepts epoch ms, `now`, `now-<n><m|h|d>` or `inicio` (start of the series).
// Relative values keep the URL stable between polls, so the CDN cache can
// actually serve repeats.
function parseTime(value, now) {
  if (value === 'inicio') return MIN_FROM_MS;
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

// Frame columns → [{ t, nivel, lluvia, acum1h }]. Rows are passed through as
// Grafana returns them (duplicates and outliers included) so the numbers
// match the panel; acum1h gets 3 decimals since the 12-reading average of
// 0.1 mm steps is often below 0.01.
function puntosFrom(cols) {
  return (cols.time ?? []).map((t, i) => ({
    t,
    nivel:  round(cols.nivel?.[i], 3),
    lluvia: round(cols.lluvia?.[i], 2),
    acum1h: round(cols.acum1h?.[i], 3),
  }));
}

// Grouped series columns → [{ t, tStart, tEnd, tAcum, n, nivel, lluvia,
// lluviaSuma, acum1h }]. t is when the bucket's level maximum happened.
function seriesFrom(cols) {
  return (cols.time ?? []).map((t, i) => ({
    t,
    tStart:     cols.t_inicio?.[i],
    tEnd:       cols.t_fin?.[i],
    tAcum:      cols.t_acum?.[i],
    n:          cols.n?.[i],
    nivel:      round(cols.nivel?.[i], 3),
    lluvia:     round(cols.lluvia?.[i], 2),
    lluviaSuma: round(cols.lluvia_suma?.[i], 2),
    acum1h:     round(cols.acum1h?.[i], 3),
  }));
}

// ?solo=ultimo returns just { ultimo, ultimaLectura } (one cheap query), for
// the KPI cards; otherwise the series for the range is included.
export async function GET(request) {
  const sp  = request.nextUrl.searchParams;
  const now = Date.now();
  const soloUltimo = sp.get('solo') === 'ultimo';

  let from = parseTime(sp.get('from') || DEFAULT_FROM, now);
  let to   = parseTime(sp.get('to')   || DEFAULT_TO,   now);
  if (from == null || to == null) {
    return errorResponse(400, 'from/to inválidos: usar epoch ms, "now", "now-<n>[m|h|d]" o "inicio"');
  }
  // Clamp to the table: nothing before its first reading, nothing in the future.
  from = Math.max(from, MIN_FROM_MS);
  to   = Math.min(to, now + 5 * 60 * 1000);
  if (from >= to) return errorResponse(400, '"from" debe ser anterior a "to"');

  const bucketSeg = bucketSecondsFor(to - from);

  const queries = [
    { refId: 'U', datasource: DATASOURCE, rawQuery: true, format: 'table', rawSql: LATEST_SQL },
  ];
  if (!soloUltimo) {
    queries.push({ refId: 'A', datasource: DATASOURCE, rawQuery: true, format: 'table', rawSql: seriesSql(bucketSeg) });
  }
  const body = { from: String(from), to: String(to), queries };

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
    latest = frameColumns(json.results?.U);
    series = soloUltimo ? null : frameColumns(json.results?.A);
  } catch (err) {
    return errorResponse(502, `Respuesta inválida de Grafana: ${err.message}`);
  }

  const ultimaLectura = puntosFrom(latest).at(-1) ?? null;
  const payload = { ultimo: ultimaLectura?.t ?? null, ultimaLectura };
  if (!soloUltimo) {
    Object.assign(payload, { from, to, bucketSeg, puntos: seriesFrom(series) });
  }

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': !soloUltimo && bucketSeg > RAW_BUCKET_S ? CACHE_LONG : CACHE_SHORT,
    },
  });
}
