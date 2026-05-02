export const metadata = {
  title: 'HydroMET Mburicaó',
  description: 'Sistema de monitoreo hidrometeorológico',
}

export default function RootLayout({ children }) {
  return (
    <html lang="es" style={{ background: '#060c14', margin: 0, padding: 0 }}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Inter:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        />
      </head>
      <body style={{ margin: 0, padding: 0, background: '#060c14', border: 'none' }}>
        {children}
      </body>
    </html>
  )
}