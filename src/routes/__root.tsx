import type { ReactNode } from 'react'
import { useSyncExternalStore } from 'react'
import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
  Scripts,
} from '@tanstack/react-router'
import { Moon, Sun } from 'lucide-react'
import appCss from '~/styles/app.css?url'
import { getServerTheme, getTheme, subscribe, THEME_BOOT_SCRIPT, toggleTheme } from '~/lib/theme'
import { SearchPalette } from '~/components/SearchPalette'

function useTheme() {
  return useSyncExternalStore(subscribe, getTheme, getServerTheme)
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'FHIRPath Explorer' },
      {
        name: 'description',
        content: 'Browse the FHIR R4 specification: resources, elements, types, and FHIRPath.',
      },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
    scripts: [{ children: THEME_BOOT_SCRIPT }],
  }),
  shellComponent: RootDocument,
  component: RootLayout,
})

function RootDocument({ children }: { children: ReactNode }) {
  const theme = useTheme()
  return (
    <html lang="en" className={theme === 'dark' ? 'dark' : undefined} suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="min-h-dvh bg-paper text-ink antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  )
}

function RootLayout() {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur-sm">
        <div className="mx-auto flex h-11 max-w-7xl items-center gap-3 px-4 font-mono text-sm">
          <Link to="/" className="group flex items-baseline gap-1.5 font-semibold tracking-tight">
            <span aria-hidden className="text-flame">
              ▲
            </span>
            <span>
              fhirpath<span className="text-ink-faint">.</span>
              <span className="text-ink-mid group-hover:text-ink">explorer</span>
            </span>
          </Link>
          <span className="rounded-sm border border-line bg-panel px-1.5 py-px text-[11px] text-ink-mid">
            R4 · 4.0.1
          </span>
          <div className="flex-1" />
          <span className="hidden items-center gap-1 text-[11px] text-ink-faint sm:flex">
            <kbd className="rounded-sm border border-line px-1">⌘K</kbd> jump
          </span>
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 pb-24">
        <Outlet />
      </main>
      <SearchPalette />
    </>
  )
}

function ThemeToggle() {
  const theme = useTheme()
  return (
    <button
      type="button"
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={toggleTheme}
      className="rounded-sm p-1.5 text-ink-mid hover:bg-panel hover:text-ink"
    >
      {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  )
}
