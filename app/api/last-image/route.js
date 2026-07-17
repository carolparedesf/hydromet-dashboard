export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. Traer la galería HTML y extraer la primera imagen (la más reciente)
    const listRes = await fetch('http://200.10.231.202/level/ver_imagenes.php', {
      cache: 'no-store',
    });
    if (!listRes.ok) {
      return new Response(JSON.stringify({ error: 'No se pudo contactar al servidor de imágenes' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const html = await listRes.text();

    const match = html.match(
      /http:\/\/200\.10\.231\.202\/level\/fotos\/(foto_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})_pro_[a-f0-9]+\.jpg)/
    );

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