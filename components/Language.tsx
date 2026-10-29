"use client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { bengali } from "@/lib/bengali";
import styles from "./Language.module.css";

type Language = "en" | "bn";
const LanguageContext = createContext({ language: "en" as Language, setLanguage: (_: Language) => {}, t: (text: string) => text });
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, updateLanguage] = useState<Language>("en");
  useEffect(() => {
    const sync = () => { try { updateLanguage(localStorage.getItem("tranzora-language") === "bn" ? "bn" : "en"); } catch {} };
    sync();
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  function setLanguage(value: Language) {
    updateLanguage(value);
    try { localStorage.setItem("tranzora-language", value); } catch {}
  }
  function t(text: string) {
    if (language !== "bn") return text;
    const key = text.trim();
    // Surrounding whitespace is part of the sentence: {t("Run every ")}<em>{t("trip")}</em> would otherwise collide.
    return bengali[key] ? text.replace(key, bengali[key]) : text;
  }
  return <LanguageContext.Provider value={{ language, setLanguage, t }}>{children}</LanguageContext.Provider>;
}
export const useLanguage = () => useContext(LanguageContext);
export default function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { language, setLanguage } = useLanguage();
  const [open, setOpen] = useState(false);
  const [menuLeft, setMenuLeft] = useState(-146);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const hoverOpened = useRef(false);
  useEffect(() => {
    if (!open) return;
    // A hover-opened menu must not steal focus, or the keyboard user loses their place.
    if (!hoverOpened.current) root.current?.querySelector<HTMLButtonElement>('[role="menuitemradio"][aria-checked="true"]')?.focus();
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  function choose(value: Language) { hoverOpened.current = false; setLanguage(value); setOpen(false); trigger.current?.focus(); }
  // The menu is 190px wide and must stay on screen; the same clamp is needed for hover and tap opens.
  function place() { const bounds = root.current!.getBoundingClientRect(); setMenuLeft(Math.max(8 - bounds.left, Math.min(bounds.width - 190, window.innerWidth - 198 - bounds.left))); }
  return <div className={styles.control} ref={root} onPointerEnter={event => { if (event.pointerType === "mouse") { hoverOpened.current = true; place(); setOpen(true); } }} onPointerLeave={() => { if (!hoverOpened.current) return; hoverOpened.current = false; setOpen(false); }} onKeyDown={event => {
    if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
    if (open && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const items = Array.from(root.current!.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'));
      const current = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (current + (event.key === "ArrowUp" ? -1 : 1) + items.length) % items.length;
      items[next]?.focus();
    }
    if (event.key === "Tab") setOpen(false);
  }}>
    <button ref={trigger} type="button" className={`${styles.trigger} ${className}`} aria-label="Change language" title={language === "bn" ? "Language: Bengali" : "Language: English"} aria-haspopup="menu" aria-expanded={open} onClick={() => {
      place();
      // Hover already opened it, so the first click must not toggle it shut; later clicks close as normal.
      const fromHover = hoverOpened.current;
      hoverOpened.current = false;
      if (fromHover) setOpen(true);
      else setOpen(value => !value);
    }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z"/></svg>
      <span className={styles.badge}>{language === "bn" ? "\u09acা" : "EN"}</span>
    </button>
    {open && <div className={styles.menu} style={{ left: menuLeft, right: "auto" }} role="menu" aria-label="Choose language">
      <small><span lang="en">LANGUAGE</span><span aria-hidden="true"> / </span><span lang="bn">{"\u09ad\u09be\u09b7\u09be"}</span></small>
      {(["en", "bn"] as const).map(value => <button key={value} type="button" role="menuitemradio" aria-checked={language === value} lang={value} onClick={() => choose(value)}>
        <span>{value === "en" ? "English" : "\u09ac\u09be\u0982\u09b2\u09be"}</span><span aria-hidden="true">{language === value ? "\u2713" : ""}</span>
      </button>)}
    </div>}
  </div>;
}
