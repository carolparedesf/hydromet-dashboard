export const dynamic = 'force-dynamic';

export async function GET(request) {
  const debug = request.nextUrl.searchParams.get('debug') === '1';

  try {
    // 1. Traer la galería HTML y extraer la primera imagen (la más reciente)
    const listRes = await fetch('http://200.10.231.202/level/ver_imagenes.php', {
      cache: 'no-store',
    });
    if (!listRes.ok) {
      const payload = { error: 'No se pudo contactar al servidor de imágenes', listStatus: listRes.status };
      return new Response(JSON.stringify(payload), {
        status: debug ? 200 : 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const html = await listRes.text();

    // The gallery renders <img src="fotos/foto_....jpg"> with a path relative
    // to ver_imagenes.php, not an absolute URL — matching the absolute form
    // never found anything, which is why every request hit the 404 branch.
    const match = html.match(
      /fotos\/(foto_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})_pro_[a-f0-9]+\.jpg)/
    );

    // Diagnostic mode: instead of the image, report what the gallery HTML
    // actually contains — so a mismatch between the strict filename regex
    // and the server's real naming (e.g. a missing "_pro_" segment, a
    // different extension, or an empty gallery) is visible without guessing.
    if (debug) {
      const anyFotoMatches = [...html.matchAll(/(foto_[^"'\s]+\.(?:jpg|jpeg|png))/gi)].map(m => m[1]);
      return new Response(JSON.stringify({
        listStatus: listRes.status,
        htmlLength: html.length,
        htmlSnippet: html.slice(0, 1500),
        strictRegexMatched: !!match,
        matchedFilename: match ? match[1] : null,
        anyFotoFilenamesFound: anyFotoMatches.slice(0, 20),
      }, null, 2), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!match) {
      return new Response(JSON.stringify({ error: 'No se encontró ninguna imagen todavía' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const [, filename, y, mo, d, h, mi, s] = match;
    const imageUrl = `http://200.10.231.202/level/fotos/${filename}`;
    const timestamp = `${y}-${mo}-${d}T${h}:${mi}:${s}`;

    // 2. Traer la imagen en sí (server-side, evita mixed content y CORS)
    const imgRes = await fetch(imageUrl, { cache: 'no-store' });
    if (!imgRes.ok) {
      return new Response(JSON.stringify({ error: 'No se pudo descargar la imagen' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const imgBuffer = await imgRes.arrayBuffer();

    return new Response(imgBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'no-store',
        'X-Photo-Timestamp': timestamp,
        'X-Photo-Filename': filename,
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}