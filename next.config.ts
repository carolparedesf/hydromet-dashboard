import type { NextConfig } from "next";

const GEOJSON_CACHE = 'public, max-age=86400, stale-while-revalidate=604800';

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/Limite_Mburicao_Victoria.json',
        headers: [{ key: 'Cache-Control', value: GEOJSON_CACHE }],
      },
      {
        source: '/Subcuencas_Mburicao_Victoria.json',
        headers: [{ key: 'Cache-Control', value: GEOJSON_CACHE }],
      },
    ]
  },
};

export default nextConfig;
