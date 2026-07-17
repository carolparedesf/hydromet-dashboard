'use client';

import { useEffect, useState } from 'react';

export default function LastPhoto({ refreshMs = 60000 }) {
  const [src, setSrc] = useState(null);
  const [timestamp, setTimestamp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    let currentUrl = null;

    async function fetchPhoto() {
      try {
        const res = await fetch(`/api/last-image?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'No se pudo cargar la imagen');
        }
        const blob = await res.blob();
        const ts = res.headers.get('X-Photo-Timestamp');
        if (!active) return;

        const newUrl = URL.createObjectURL(blob);
        if (currentUrl) URL.revokeObjectURL(currentUrl);
        currentUrl = newUrl;

        setSrc(newUrl);
        setTimestamp(ts);
        setError(null);
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchPhoto();
    const interval = setInterval(fetchPhoto, refreshMs);
    return () => {
      active = false;
      clearInterval(interval);
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  }, [refreshMs]);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="mb-2 text-sm font-semibold text-gray-700">Última imagen — Estación</h3>

      {loading && (
        <div className="flex h-48 items-center justify-center text-gray-400">Cargando...</div>
      )}

      {error && !loading && (
        <div className="flex h-48 items-center justify-center text-sm text-red-500">{error}</div>
      )}

      {src && !error && (
        <>
          <img
            src={src}
            alt="Última captura de la cámara"
            className="w-full rounded-md object-cover"
          />
          {timestamp && (
            <p className="mt-2 text-xs text-gray-500">
              📅{' '}
              {new Date(timestamp).toLocaleString('es-PY', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </p>
          )}
        </>
      )}
    </div>
  );
}