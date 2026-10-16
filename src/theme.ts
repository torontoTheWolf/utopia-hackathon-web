// Light or dark, as chosen with the switch at the end of the directions bar, and remembered in the browser. index.html
// applies a saved choice before the page first draws, so a dark page doesn't flash light; it reads the same key.

const STORAGE_KEY = 'theme'

export function savedDark(): boolean {
  return document.documentElement.dataset.theme === 'dark'
}

export function applyTheme(dark: boolean): void {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  try {
    localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light')
  } catch {
    // Storage is off, as in some private windows, so the choice lasts only until the page closes.
  }
}
