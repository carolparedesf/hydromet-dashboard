# 🌊 HydroMET Mburicaó

Sistema de monitoreo hidrometeorológico en tiempo real para la cuenca del Arroyo Mburicaó, Asunción, Paraguay. Desarrollado como Trabajo Final de Grado.

🔗 [hydromet-dashboard.vercel.app](https://hydromet-dashboard.vercel.app)

---

## Stack

Next.js 14 · React · TailwindCSS · Recharts · Leaflet · Supabase · Python · Vercel

---

## Funcionalidades

- Series temporales de nivel y lluvia
- Mapa interactivo con límites de cuenca (GeoJSON)
- KPI cards con máximos y promedios del período
- Filtros de rango de fechas
- Análisis de correlación lluvia–nivel
- Diseño responsive · Autenticación propia

---

## Instalación

```bash
git clone https://github.com/carolparedesf/hydromet-dashboard.git
cd hydromet-dashboard
npm install
```

Creá `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

```bash
npm run build && npm run start
```

---

## Autora

**Victoria Paredes Frutos**<br>
Trabajo Final de Grado<br>
Universidad Nacional de Asunción · Paraguay · 2026