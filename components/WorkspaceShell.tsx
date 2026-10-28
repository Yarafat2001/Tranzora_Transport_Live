"use client";
import { useLanguage } from "./Language";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { SessionUser } from "@/lib/auth";
import type { Screen } from "@/lib/screens";
import { getRoleHome, getVisibleNavigation } from "@/lib/roles";
import { api } from "@/lib/api-client";
import { Icon, Logo, type IconName } from "./WorkspaceIcons";
import LanguageSwitcher from "./Language";
import ThemeToggle from "./ThemeToggle";
import OperationsWorkspace from "./OperationsWorkspace";

function navigationIcon(href: string): IconName {
  const module = href.split("/")[1];
  if (href.includes("profile")) return "user";
  if (href.includes("password")) return "lock";
  if (href === "/driver/trips") return "trip";
  if (href === "/driver/vehicles") return "vehicle";
  return (
    (
      {
        dashboard: "grid",
        driver: "grid",
        trips: "trip",
        bookings: "booking",
        vehicles: "vehicle",
        drivers: "driver",
        customers: "customer",
        maintenance: "wrench",
        fuel: "fuel",
        expenses: "expense",
        income: "income",
        reports: "report",
        invoices: "invoice",
        payments: "payment",
        users: "users",
        settings: "settings",
        notifications: "bell",
        "help-support": "support",
        "audit-logs": "audit",
        suppliers: "supplier",
        documents: "document",
      } as Record<string, IconName>
    )[module] ?? "grid"
  );
}

export default function WorkspaceShell({
  screen,
  initialUser,
}: {
  screen: Screen;
  initialUser: SessionUser | null;
}) {
  const { t } = useLanguage();
  const [user, setUser] = useState(initialUser);
  const [menuOpen, setMenuOpen] = useState(false);
  const [compact, setCompact] = useState(true);
  const [mobile, setMobile] = useState(false);
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [error, setError] = useState("");
  const [healthy, setHealthy] = useState<boolean | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const drawer = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const navbar = useRef<HTMLElement>(null);
  const railSurface = useRef<HTMLDivElement>(null);
  const railOutline = useRef<SVGPathElement>(null);
  const home = getRoleHome(user?.role);
  const items = getVisibleNavigation(user?.role);
  const active = [...items]
    .sort((a, b) => b.href.length - a.href.length)
    .find(
      (item) =>
        screen.route === item.href || screen.route.startsWith(`${item.href}/`),
    )?.href;

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1024px)");
    const sync = () => {
      setMobile(media.matches);
      if (media.matches) setCompact(false);
      else setMenuOpen(false);
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  useEffect(() => {
    setMenuOpen(false);
    setQuery("");
  }, [screen.route]);
  useEffect(() => {
    const sidebar = drawer.current;
    const surface = railSurface.current;
    const nav = sidebar?.querySelector("nav");
    if (!sidebar || !surface || !nav) return;
    const update = () => {
      const selected = nav.querySelector('[aria-current="page"]');
      if (!selected || !compact || mobile) {
        surface.style.clipPath = "";
        railOutline.current?.setAttribute("d", "");
        return;
      }
      const bounds = sidebar.getBoundingClientRect();
      const link = selected.getBoundingClientRect();
      const visible =
        link.bottom > nav.getBoundingClientRect().top &&
        link.top < nav.getBoundingClientRect().bottom;
      if (!visible) {
        surface.style.clipPath = "";
        railOutline.current?.setAttribute("d", "");
        return;
      }
      const w = bounds.width,
        h = bounds.height;
      const y = Math.max(
        90,
        Math.min(h - 100, link.top + link.height / 2 - bounds.top),
      );
      // A smooth concave edge leaves breathing room around the floating badge.
      const contour = `M 32 0 H ${w - 32} Q ${w} 0 ${w} 32 V ${y - 49} C ${w} ${y - 34} ${w - 38} ${y - 37} ${w - 38} ${y} C ${w - 38} ${y + 37} ${w} ${y + 34} ${w} ${y + 49} V ${h - 32} Q ${w} ${h} ${w - 32} ${h} H 32 Q 0 ${h} 0 ${h - 32} V 32 Q 0 0 32 0 Z`;
      surface.style.clipPath = `path("${contour}")`;
      railOutline.current?.setAttribute("d", contour);
    };
    const observer = new ResizeObserver(update);
    observer.observe(sidebar);
    observer.observe(nav);
    nav.addEventListener("scroll", update);
    const frame = requestAnimationFrame(() => {
      const selected = nav.querySelector('[aria-current="page"]');
      if (selected) {
        const link = selected.getBoundingClientRect();
        const viewport = nav.getBoundingClientRect();
        if (link.bottom > viewport.bottom)
          nav.scrollTop += link.bottom - viewport.bottom + 8;
        else if (link.top < viewport.top)
          nav.scrollTop -= viewport.top - link.top + 8;
      }
      update();
    });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      nav.removeEventListener("scroll", update);
    };
  }, [active, compact, mobile, user?.role]);
  useEffect(() => {
    const refresh = () =>
      api<{ user: SessionUser }>("auth/session")
        .then((result) => setUser(result.user))
        .catch((error) => setError(error.message));
    if (!initialUser) refresh();
    api("health")
      .then(() => setHealthy(true))
      .catch(() => setHealthy(false));
    window.addEventListener("tranzora:profile-updated", refresh);
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        search.current?.focus();
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => {
      window.removeEventListener("tranzora:profile-updated", refresh);
      window.removeEventListener("keydown", shortcut);
    };
  }, [initialUser]);
  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawer.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
      if (event.key === "Tab") {
        const controls = drawer.current?.querySelectorAll<HTMLElement>(
          "a[href],button:not([disabled])",
        );
        if (!controls?.length) return;
        const first = controls[0],
          last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);
  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await api("auth/logout", { method: "POST", body: "{}" });
      sessionStorage.clear();
      window.location.assign("/login");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Sign out failed.");
      setSigningOut(false);
    }
  }
  const initials = (user?.name ?? "Your profile")
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
  return (
    <div className={`app-shell workspace-shell ${compact ? "is-compact" : ""}`}>
      <a className="skip-to-content" href="#workspace-content">
        {t("Skip to content ")}</a>
      <aside
        ref={drawer}
        id="workspace-navigation"
        className={`sidebar ${menuOpen ? "open" : ""}`}
        aria-label="Workspace sidebar"
      >
        <div className="rail-surface" ref={railSurface} aria-hidden="true" />
        <svg className="rail-outline" aria-hidden="true" focusable="false">
          <path
            ref={railOutline}
            fill="none"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div className="sidebar-top">
          <Link href={home} className="brand" aria-label="Tranzora home">
            <Logo />
            <span>
              TRANZORA<small>{t("MOVE BUSINESS FORWARD")}</small>
            </span>
          </Link>
          <button
            className="close-menu"
            aria-label="Close navigation"
            onClick={() => {
              setMenuOpen(false);
              menuButton.current?.focus();
            }}
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="workspace">
          <span className="workspace-icon">
            <Icon
              name={user?.role === "Driver" ? "vehicle" : "building"}
              size={20}
            />
          </span>
          <span>
            <small>{t("YOUR WORKSPACE")}</small>
            <b>
              {user?.role === "Driver" ? t("On the road") : t("Transport operations")}
            </b>
          </span>
          <span className="workspace-spark" aria-hidden>
            ✦
          </span>
        </div>
        <nav aria-label="Main navigation">
          {(["Workspace", "Operations", "Account"] as const).map((group) => {
            const links = items.filter((item) => item.group === group);
            if (!links.length) return null;
            return (
              <div className="nav-group" key={group}>
                <span className="nav-group-label">{t(group)}</span>
                {links.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={compact ? t(item.label) : undefined}
                    aria-label={t(item.label)}
                    aria-current={active === item.href ? "page" : undefined}
                    className={active === item.href ? "active" : ""}
                    onClick={() => setMenuOpen(false)}
                  >
                    <span className="nav-icon">
                      <Icon name={navigationIcon(item.href)} />
                    </span>
                    <span className="nav-label">{t(item.label)}</span>
                    {active === item.href && (
                      <span className="nav-active-dot" />
                    )}
                  </Link>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <Link
            href="/settings/profile"
            className="sidebar-identity"
            aria-label="My account profile"
            title={user?.name ?? "Your profile"}
          >
            <span className="avatar">{initials}</span>
            <span>
              <b>{user?.name ?? "Your account"}</b>
              <small>{user?.role ?? "Workspace member"}</small>
            </span>
          </Link>
          <button
            className="sign-out"
            aria-label={t("Sign out")}
            title={t("Sign out")}
            onClick={signOut}
            disabled={signingOut}
          >
            <Icon name="arrow" />
            <span>{signingOut ? "Signing out…" : t("Sign out")}</span>
          </button>
        </div>
      </aside>
      {menuOpen && (
        <button
          className="sidebar-scrim"
          aria-label="Dismiss navigation"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <main className="main-area">
        <header
          className="topbar"
          ref={navbar}
          onPointerMove={(event) => {
            if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
              return;
            const rect = event.currentTarget.getBoundingClientRect();
            navbar.current?.style.setProperty(
              "--pointer-x",
              `${event.clientX - rect.left}px`,
            );
            navbar.current?.style.setProperty(
              "--pointer-y",
              `${event.clientY - rect.top}px`,
            );
            navbar.current?.style.setProperty(
              "--nav-tilt-x",
              `${(0.5 - (event.clientY - rect.top) / rect.height) * 0.8}deg`,
            );
            navbar.current?.style.setProperty(
              "--nav-tilt-y",
              `${((event.clientX - rect.left) / rect.width - 0.5) * 0.7}deg`,
            );
          }}
          onPointerLeave={() => {
            navbar.current?.style.setProperty("--nav-tilt-x", "0deg");
            navbar.current?.style.setProperty("--nav-tilt-y", "0deg");
          }}
        >
          <button
            ref={menuButton}
            className="navigation-toggle"
            aria-label={
              mobile
                ? "Open navigation"
                : compact
                  ? "Expand sidebar"
                  : "Collapse sidebar"
            }
            aria-controls="workspace-navigation"
            aria-expanded={mobile ? menuOpen : !compact}
            onClick={() =>
              window.matchMedia("(max-width: 1024px)").matches
                ? setMenuOpen((value) => !value)
                : setCompact((value) => !value)
            }
          >
            <Icon name="menu" size={20} />
          </button>
          <div
            className="top-search"
            role="search"
            onFocus={() => setSearchFocused(true)}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget))
                setSearchFocused(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setSearchFocused(false);
                search.current?.blur();
              }
            }}
          >
            <Icon name="search" size={18} />
            <input
              ref={search}
              aria-label={t("Search workspace")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t(mobile ? "Search…" : "Search records or find a page…")}
            />
            <kbd>⌘ K</kbd>
            {query &&
              searchFocused &&
              items.some((item) =>
                (item.label + " " + t(item.label)).toLowerCase().includes(query.toLowerCase()),
              ) && (
                <div className="navigation-results">
                  {items
                    .filter((item) =>
                      (item.label + " " + t(item.label)).toLowerCase().includes(query.toLowerCase()),
                    )
                    .slice(0, 6)
                    .map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setQuery("")}
                      >
                        <Icon name={navigationIcon(item.href)} />
                        {t(item.label)}
                        <Icon name="arrow" size={14} />
                      </Link>
                    ))}
                  <small>{t("Record lists filter as you type.")}</small>
                </div>
              )}
          </div>
          <div className="header-actions">
            <span className={`connection-status ${healthy ? "online" : ""}`}>
              <i />
              {healthy === null ? t("Connecting") : healthy ? t("Live workspace") : t("Service unavailable")}
            </span>
            <LanguageSwitcher className="topbar-lang-toggle" />
            <ThemeToggle className="topbar-theme-toggle" />
            {items.some((item) => item.href === "/notifications") && (
              <Link
                className="icon-btn"
                href="/notifications"
                aria-label={t("Notifications")}
              >
                <Icon name="bell" />
              </Link>
            )}
            <Link
              className="user-menu"
              href="/settings/profile"
              aria-label={t("Open my profile")}
            >
              <span className="avatar">{initials}</span>
              <span>
                <b>{user?.name ?? "Your account"}</b>
                <small>{t(user?.role ?? "")}</small>
              </span>
              <Icon name="arrow" size={14} />
            </Link>
          </div>
        </header>
        <div className="page" id="workspace-content" tabIndex={-1}>
          <div className="page-heading">
            <div>
              <div className="breadcrumb">
                <Link href={home}>{t("Workspace")}</Link>
                <span>/</span>
                <span>{t(screen.title)}</span>
              </div>
              <span className="page-eyebrow">
                {user?.role === "Driver" ? t("YOUR JOURNEY, CONNECTED") : t("YOUR BUSINESS, IN FOCUS")}
              </span>
              <h1>
                {screen.title === "Profile" ? t("My profile") : t(screen.title)}
              </h1>
              <p>{t(screen.description)}</p>
            </div>
            <span className="role-badge">
              <span />
              {t(user?.role ?? "")}
            </span>
          </div>
          {error && (
            <div className="workspace-notice" role="alert">
              {error}
              <button onClick={() => setError("")} aria-label="Dismiss message">
                <Icon name="close" size={16} />
              </button>
            </div>
          )}
          <OperationsWorkspace screen={screen} query={query} />
          <footer className="workspace-footer">
            <span>
              <Link href={home} className="footer-brand" aria-label="Tranzora home">
                <Logo />
                <b>TRANZORA</b>
              </Link>
              <i aria-hidden="true" />
              <span>{t("Your next move, made simple.")}</span>
            </span>
            <span>{t("Connected transport workspace")}</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
