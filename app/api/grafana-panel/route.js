export const dynamic = 'force-dynamic';

const GRAFANA_BASE   = 'http://200.10.231.202:3000';
const DASHBOARD_UID  = '30yTZR8Nz';
const DASHBOARD_SLUG = 'monitoreo-arroyo-mburicao';
const ORG_ID   = 2;
const PANEL_ID = 4;

// Rango de tiempo mostrado en el panel, en epoch milisegundos (parámetros
// `from` y `to` de Grafana). Son los valores por defecto cuando el cliente no
// manda ?from= / ?to=. También aceptan expresiones relativas de Grafana como
// 'now-90d' y 'now'.
const DEFAULT_FROM = '1785514538539'; // 2026-07-31
const DEFAULT_TO   = '1793290538539'; // 2026-10-29

const DEFAULT_WIDTH  = 1600;
const DEFAULT_HEIGHT = 800;
// Upper bound so a crafted URL can't make the render server produce huge images.
const MAX_SIDE = 4000;

const TIMEOUT_MS = 10_000;

// Grafana time values: epoch ms, or relative expressions like now, now-7d, now-1d/d.
const TIME_RE = /^(\d{10,14}|now(-\d+[smhdwMy])?(\/[smhdwMy])?)$/;

function intParam(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_SIDE) : fallback;
}

function timeParam(value, fallback) {
  return value && TIME_RE.test(value) ? value : fallback;
}

// Reads width/height from the PNG IHDR chunk (bytes 16–23, big-endian).
function pngSize(buf) {
  if (buf.byteLength < 24) return null;
  const view = new DataView(buf);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function errorResponse(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function GET(request) {
  const sp = request.nextUrl.searchParams;

  const params = new URLSearchParams({
    orgId:   String(ORG_ID),
    panelId: String(PANEL_ID),
    width:   String(intParam(sp.get('width'),  DEFAULT_WIDTH)),
    height:  String(intParam(sp.get('height'), DEFAULT_HEIGHT)),
    from:    timeParam(sp.get('from'), DEFAULT_FROM),
    to:      timeParam(sp.get('to'),   DEFAULT_TO),
  });
  const renderUrl = `${GRAFANA_BASE}/render/d-solo/${DASHBOARD_UID}/${DASHBOARD_SLUG}?${params}`;

  // Optional service-account token for when the dashboard stops allowing
  // anonymous access. Server-only env var (no NEXT_PUBLIC_ prefix), so it never
  // reaches the browser.
  const headers = {};
  if (process.env.GRAFANA_API_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GRAFANA_API_TOKEN}`;
  }

  let res;
  try {
    res = await fetch(renderUrl, {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    if (err.name === 'TimeoutError') {
      return errorResponse(502, `Grafana no respondió en ${TIMEOUT_MS / 1000} s`);
    }
    return errorResponse(502, 'No se pudo contactar al servidor de Grafana');
  }

  // Without access Grafana redirects to /login and answers 200 with HTML, so
  // checking only res.ok would forward a login page as if it were the PNG.
  const contentType = res.headers.get('content-type') || '';
  if (!res.ok || !contentType.startsWith('image/')) {
    return errorResponse(502, `Grafana devolvió ${res.status} (${contentType || 'sin content-type'})`);
  }

  const png = await res.arrayBuffer();

  // When the grafana-image-renderer plugin is missing or the render fails,
  // Grafana still answers 200 image/png, but with a fixed-size placeholder
  // ("No image renderer available/installed"). A real render matches the
  // requested dimensions, so a mismatch means there is no chart to show.
  const size = pngSize(png);
  if (contentType === 'image/png' && size &&
      (size.width !== Number(params.get('width')) || size.height !== Number(params.get('height')))) {
    return errorResponse(502, `Grafana devolvió una imagen de error (${size.width}x${size.height}); ¿falta el plugin Image Renderer?`);
  }

  return new Response(png, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  });
}
