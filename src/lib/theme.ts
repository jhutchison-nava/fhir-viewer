export type Theme = 'light' | 'dark'

const KEY = 'fhir-viewer-theme'

/** Inlined into <head> so the class lands before first paint. */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  KEY,
)});if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}})()`

export function getTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

export function setTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // private mode etc. — theme just won't persist
  }
}

export function toggleTheme(): Theme {
  const next: Theme = getTheme() === 'dark' ? 'light' : 'dark'
  setTheme(next)
  return next
}
