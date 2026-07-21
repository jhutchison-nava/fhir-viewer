/**
 * Theme store. The <html> className is rendered by React from this store
 * (see __root.tsx) — mutating the DOM class directly would be clobbered on
 * the next render. The boot script only prevents a flash before hydration.
 */
export type Theme = 'light' | 'dark'

const KEY = 'fhir-viewer-theme'

/** Inlined into <head> so the class lands before first paint. */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  KEY,
)});if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}})()`

let current: Theme | null = null
const listeners = new Set<() => void>()

function resolve(): Theme {
  try {
    const stored = localStorage.getItem(KEY)
    if (stored === 'dark' || stored === 'light') return stored
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function getTheme(): Theme {
  if (current === null) current = resolve()
  return current
}

export function getServerTheme(): Theme {
  return 'light'
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setTheme(theme: Theme) {
  current = theme
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // private mode etc. — theme just won't persist
  }
  listeners.forEach((fn) => fn())
}

export function toggleTheme() {
  setTheme(getTheme() === 'dark' ? 'light' : 'dark')
}
