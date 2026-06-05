import { inter, ibmPlexSans, ibmPlexMono } from './fonts'
import ThemeProvider from '../components/ThemeProvider'
import './globals.css'

export const metadata = {
  title: 'HydroMET Mburicaó',
  description: 'Sistema de monitoreo hidrometeorológico',
}

// Runs synchronously before first paint.
// 1. Reads localStorage('hm-theme').
// 2. Falls back to prefers-color-scheme.
// 3. Adds class="dark" to <html> if needed.
// suppressHydrationWarning on <html> prevents React from complaining
// that the server-rendered class differs from what this script wrote.
const noFlashScript = `(function(){try{var s=localStorage.getItem('hm-theme');if(s==='dark'||(s==null&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch{}})();`

export default function RootLayout({ children }) {
  return (
    <html
      lang="es"
      className={`${inter.variable} ${ibmPlexSans.variable} ${ibmPlexMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* No-flash theme init — must be first thing in <head> */}
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
      </head>
      <body className="font-sans bg-app text-ink" style={{ margin: 0, padding: 0 }}>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
