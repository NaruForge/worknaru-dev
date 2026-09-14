import { useEffect, useState } from 'react';
export type Theme = 'system' | 'light' | 'dark';
export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const change = () => setMatches(media.matches);
    change();
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, [query]);
  return matches;
}
export function useTheme() {
  const [theme, update] = useState<Theme>(() => {
    try {
      const value = localStorage.getItem('worknaru.ui.theme');
      if (value === 'light' || value === 'dark') return value;
    } catch {
      /* Storage may be unavailable. */
    }
    return 'system';
  });
  const dark = useMediaQuery('(prefers-color-scheme: dark)');
  useEffect(() => {
    document.documentElement.dataset.theme = theme === 'system' ? (dark ? 'dark' : 'light') : theme;
  }, [theme, dark]);
  return {
    theme,
    setTheme: (value: Theme) => {
      update(value);
      try {
        localStorage.setItem('worknaru.ui.theme', value);
      } catch {
        /* Keep the session preference. */
      }
    },
  };
}
