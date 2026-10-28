"use client";

import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "tranzora-theme";
const LEGACY_KEY = "tranzora-auth-theme";
const CHANGE_EVENT = "tranzora:theme";

function readTheme(): Theme {
  try {
    return (window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_KEY)) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function paintTheme(theme: Theme, persist: boolean) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  if (persist) {
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
      window.localStorage.setItem(LEGACY_KEY, theme);
    } catch {}
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const stored = readTheme();
    setTheme(stored);
    paintTheme(stored, false);
    const sync = () => setTheme(readTheme());
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const toggleTheme = () => {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    paintTheme(next, true);
  };

  return { theme, toggleTheme, setTheme };
}

export default function ThemeToggle({ className, size = 19 }: { className?: string; size?: number }) {
  const { theme, toggleTheme } = useTheme();
  const label = `Switch to ${theme === "light" ? "dark" : "light"} mode`;

  return <button type="button" className={className} data-theme-toggle onClick={toggleTheme} aria-label={label} title={label}>
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {theme === "light"
        ? <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>
        : <><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2.5 12h2M19.5 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>}
    </svg>
  </button>;
}
