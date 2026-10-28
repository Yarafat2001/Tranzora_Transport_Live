"use client";
import { useLanguage } from "./Language";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import LanguageSwitcher from "./Language";
import ThemeToggle from "@/components/ThemeToggle";
import { Logo } from "@/components/WorkspaceIcons";

type LpIconName = "route" | "truck" | "gauge" | "shield" | "chart" | "users" | "check" | "arrow" | "spark" | "wallet";

const lpIconPaths: Record<LpIconName, ReactNode> = {
  route: <><circle cx="6" cy="18" r="2.4"/><circle cx="18" cy="6" r="2.4"/><path d="M8.4 18h3.1a3 3 0 0 0 3-3V9a3 3 0 0 1 3-3"/></>,
  truck: <><path d="M3 17h11V7H3zM14 10h3.6l3.4 4v3h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></>,
  gauge: <><path d="M4 18a8 8 0 1 1 16 0"/><path d="m12 14 4-4"/><circle cx="12" cy="18" r="1.6"/></>,
  shield: <><path d="M12 3 5 6v5c0 4.4 2.9 8.3 7 10 4.1-1.7 7-5.6 7-10V6z"/><path d="m9 12 2 2 4-4"/></>,
  chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
  users: <><circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 5.5a3 3 0 0 1 0 5.8M17 14c2.3.5 4 2.5 4 5"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  arrow: <path d="M5 12h14m-6-6 6 6-6 6"/>,
  spark: <path d="m12 3 2.2 6.1L20 11l-5.8 1.9L12 19l-2.2-6.1L4 11l5.8-1.9z"/>,
  wallet: <><path d="M4 7h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4z"/><path d="M4 7V6a2 2 0 0 1 2-2h11v3M16 13h2"/></>,
};

function LpIcon({ name, size = 18 }: { name: LpIconName; size?: number }) {
  const { t } = useLanguage();
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{lpIconPaths[name]}</svg>;
}

const heroStats = [
  ["96.4%", "On-time delivery"],
  ["24/7", "Fleet visibility"],
  ["120+", "Operational screens"],
  ["1", "Source of truth"],
];

const floatBars = [38, 56, 44, 70, 58, 82, 66, 92];

export default function LandingPage({ signedIn }: { signedIn: boolean }) {
  const { t } = useLanguage();
  const navRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const nav = navRef.current;
    const stage = stageRef.current;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onScroll = () => nav?.classList.toggle("is-scrolled", window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    let frame = 0;
    let pointerX = 0;
    let pointerY = 0;
    const resetStage = () => {
      if (!stage) return;
      ["--prx", "--pry", "--pgx", "--pgy"].forEach((name) => stage.style.removeProperty(name));
    };
    const paintStage = () => {
      frame = 0;
      if (!stage) return;
      const rect = stage.getBoundingClientRect();
      const x = (pointerX - rect.left) / rect.width;
      const y = (pointerY - rect.top) / rect.height;
      stage.style.setProperty("--prx", `${(.5 - y) * 6}deg`);
      stage.style.setProperty("--pry", `${(x - .5) * 8}deg`);
      stage.style.setProperty("--pgx", `${x * 100}%`);
      stage.style.setProperty("--pgy", `${y * 100}%`);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (reduceMotion.matches || event.pointerType === "touch") return;
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (!frame) frame = requestAnimationFrame(paintStage);
    };

    stage?.addEventListener("pointermove", onPointerMove);
    stage?.addEventListener("pointerleave", resetStage);
    return () => {
      window.removeEventListener("scroll", onScroll);
      stage?.removeEventListener("pointermove", onPointerMove);
      stage?.removeEventListener("pointerleave", resetStage);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const primaryHref = signedIn ? "/dashboard" : "/register";
  const primaryLabel = signedIn ? "Open dashboard" : "Start free";

  return <div className="lp lp-cinematic">
    <div className="lp-aurora" aria-hidden="true"><span /><span /><span /></div>

    <header className="lp-nav" ref={navRef}>
      <Link href="/" className="lp-brand" aria-label="Tranzora home">
        <Logo />
        <span className="lp-brand-copy"><b>TRANZORA</b><small>{t("Transport operations")}</small></span>
      </Link>
      <nav className="lp-links" aria-label="Landing sections">
        <a href="#platform">{t("Platform")}</a>
        <a href="#modules">{t("Modules")}</a>
        <a href="#workflow">{t("Workflow")}</a>
      </nav>
      <div className="lp-nav-actions">
        <LanguageSwitcher className="lp-lang-toggle" />
            <ThemeToggle className="lp-theme-toggle" size={18} />
        {!signedIn && <Link className="lp-btn lp-btn-ghost lp-btn-sm" href="/login">{t("Sign in")}</Link>}
        <Link className="lp-btn lp-btn-primary lp-btn-sm" href={primaryHref}>{t(primaryLabel)}</Link>
      </div>
    </header>

    <main>
      <section className="lp-hero" id="platform">
        <div className="lp-hero-copy">
          <span className="lp-eyebrow lp-rise"><i />{t("Transport operations, one command center")}</span>
          <h1 className="lp-rise lp-d1">{t("Run every ")}<em>{t("trip")}</em>{t(", truck and taka from one calm workspace.")}</h1>
          <p className="lp-rise lp-d2">{t("Dispatch, fleet health, driver compliance, fuel and settlements in a single connected system — built for transport teams that move fast and cannot afford guesswork.")}</p>
          <div className="lp-hero-actions lp-rise lp-d3">
            <Link className="lp-btn lp-btn-primary" href={primaryHref}>{t(primaryLabel)}<LpIcon name="arrow" size={16} /></Link>
            {signedIn ? <a className="lp-btn lp-btn-ghost" href="#modules">{t("Explore modules")}</a> : <Link className="lp-btn lp-btn-ghost" href="/login">{t("Sign in")}</Link>}
          </div>
          <ul className="lp-trust lp-rise lp-d4">
            <li><i><LpIcon name="check" size={12} /></i>{t("Trip Management")}</li>
            <li><i><LpIcon name="check" size={12} /></i>{t("Role-based access")}</li>
            <li><i><LpIcon name="check" size={12} /></i>{t("Reports that settle")}</li>
          </ul>
        </div>

        <div className="lp-stage" ref={stageRef}>
          <span className="lp-preview-caption">Illustrative interface / not live telemetry</span>
          <div className="lp-light-trails" aria-hidden="true"><i /><i /><i /></div>
          <div className="lp-stage-glow" aria-hidden="true" />
          <div className="lp-app" aria-hidden="true">
            <div className="lp-app-bar">
              <span className="lp-dot" /><span className="lp-dot" /><span className="lp-dot" />
              <span className="lp-app-url">tranzora.app/dashboard</span>
              <span className="lp-app-live"><i />Preview</span>
            </div>
            <div className="lp-app-body">
              <div className="lp-app-rail">
                <span className="lp-app-mark"><Logo /></span>
                <i className="lp-rail-line is-active" />
                <i className="lp-rail-line" />
                <i className="lp-rail-line" />
                <i className="lp-rail-line" />
                <i className="lp-rail-line" />
                <span className="lp-rail-avatar" />
              </div>
              <div className="lp-app-main">
                <div className="lp-app-head"><div><small>{t("OPERATIONS")}</small><strong>{t("Today at a glance")}</strong></div><span className="lp-app-chip">{t("Dhaka hub")}</span></div>
                <div className="lp-app-stats">
                  <div><small>{t("Active trips")}</small><b>128</b><em>+8.2%</em></div>
                  <div><small>{t("On time")}</small><b>96.4%</b><em>+2.4%</em></div>
                  <div><small>{t("Fuel spend")}</small><b>৳78.2k</b><em>-4.1%</em></div>
                </div>
                <div className="lp-app-chart">
                  {floatBars.map((bar, i) => <span key={i} style={{ height: `${bar}%` }} />)}
                </div>
                <div className="lp-digital-map" aria-hidden="true">
                  <svg viewBox="0 0 500 150" fill="none"><defs><pattern id="transport-grid" width="25" height="25" patternUnits="userSpaceOnUse"><path d="M25 0H0V25" stroke="#6fcfe9" strokeOpacity=".12"/></pattern></defs><rect width="500" height="150" fill="url(#transport-grid)"/><path d="M5 100 90 100 150 45 260 45 330 110 490 110M40 20 125 135M270 0 195 150M360 0 420 150M0 55 500 55" stroke="#6c6d9d" strokeWidth="8" strokeOpacity=".3"/><path className="lp-map-route" d="M35 100H90L150 45H260L330 110H465" stroke="#54e8ff" strokeWidth="3"/><g fill="#b7f6ff" stroke="#31cde8" strokeWidth="4"><circle cx="90" cy="100" r="6"/><circle cx="260" cy="45" r="6"/><circle cx="465" cy="110" r="6"/></g><path d="M186 37h19v15h-19zM205 41h7l5 7v4h-12z" fill="#d7c8ff"/></svg>
                </div>
                <div className="lp-app-route">
                  <span className="lp-route-stop is-start" />
                  <span className="lp-route-line"><i /></span>
                  <span className="lp-route-stop is-mid" />
                  <span className="lp-route-line"><i className="is-slow" /></span>
                  <span className="lp-route-stop is-end" />
                  <small>Dhaka → Chattogram · 264 km</small>
                </div>
              </div>
            </div>
          </div>
          <div className="lp-float lp-float-a" aria-hidden="true">
            <span className="lp-float-icon"><LpIcon name="gauge" size={16} /></span>
            <div><small>{t("On-time delivery")}</small><strong>96.4%</strong></div>
            <span className="lp-float-trend">+2.4%</span>
          </div>
          <div className="lp-float lp-float-b" aria-hidden="true">
            <span className="lp-float-icon is-green"><LpIcon name="route" size={16} /></span>
            <div><small>{t("Active trips")}</small><strong>128</strong></div>
            <span className="lp-float-pulse" />
          </div>
          <div className="lp-float lp-float-c" aria-hidden="true">
            <span className="lp-float-icon is-violet"><LpIcon name="wallet" size={16} /></span>
            <div><small>{t("Fuel saved")}</small><strong>৳12,400</strong></div>
          </div>
        </div>
      </section>

      <p className="lp-illustration-note">Dashboard visuals use illustrative data. Your live business totals appear after sign-in.</p>
      <section className="lp-stats" aria-label="Illustrative dashboard metrics">
        {heroStats.map(([value, label]) => <div key={label}><b>{value}</b><small>{label}</small></div>)}
      </section>

      <section className="lp-section" id="modules">
        <div className="lp-section-head">
          <span className="lp-eyebrow"><i />{t("The platform")}</span>
          <h2>{t("Every part of the operation, already connected.")}</h2>
          <p>{t("One workspace for dispatch, fleet, drivers, money and reporting. No spreadsheets to reconcile, no group chats to chase.")}</p>
        </div>
        <div className="lp-bento">
          <article className="lp-feature lp-feature-wide">
            <span className="lp-feature-icon"><LpIcon name="route" size={20} /></span>
            <h3>{t("Dispatch without the group chat")}</h3>
            <p>{t("Assign vehicles and drivers, check availability and manage trips from a shared workspace.")}</p>
            <div className="lp-mini-board">
              {[["TRP-2048", "Dhaka → Chattogram", "In progress", "45%"], ["TRP-2049", "Sylhet → Dhaka", "Scheduled", "18%"], ["TRP-2050", "Khulna → Rajshahi", "In progress", "72%"]].map(([id, lane, status, width]) => <div className="lp-mini-row" key={id}><b>{id}</b><span>{lane}</span><em>{status}</em><i style={{ width }} /></div>)}
            </div>
          </article>

          <article className="lp-feature">
            <span className="lp-feature-icon is-green"><LpIcon name="gauge" size={20} /></span>
            <h3>{t("Fleet health")}</h3>
            <p>{t("Utilisation, maintenance windows and fuel efficiency per vehicle.")}</p>
            <div className="lp-mini-gauge"><span><b>78.4%</b><small>{t("Utilisation")}</small></span></div>
          </article>

          <article className="lp-feature">
            <span className="lp-feature-icon is-violet"><LpIcon name="shield" size={20} /></span>
            <h3>{t("Driver compliance")}</h3>
            <p>{t("Licences, assignments and performance in one record.")}</p>
            <div className="lp-mini-people">
              {["AH", "NJ", "RA", "TH"].map((initials, i) => <span key={initials} className={`lp-mini-avatar lp-mini-avatar-${i}`}>{initials}</span>)}
              <em>132 active</em>
            </div>
          </article>

          <article className="lp-feature lp-feature-wide">
            <span className="lp-feature-icon is-orange"><LpIcon name="chart" size={20} /></span>
            <h3>{t("Numbers that settle the trip")}</h3>
            <p>{t("Receipts, fuel, maintenance and expenses stay connected to your trips, with a clear cash summary for your team.")}</p>
            <div className="lp-mini-chart">
              {[42, 64, 51, 78, 58, 88, 69, 96, 74, 84, 63, 91].map((bar, i) => <span key={i} style={{ height: `${bar}%` }} />)}
            </div>
          </article>
        </div>
      </section>

      <section className="lp-workflow" id="workflow">
        <div className="lp-section-head">
          <span className="lp-eyebrow"><i />{t("Workflow")}</span>
          <h2>{t("From booking to settlement in three moves.")}</h2>
        </div>
        <div className="lp-steps">
          <article>
            <span className="lp-step-number">01</span>
            <span className="lp-step-icon"><LpIcon name="spark" size={19} /></span>
            <h3>{t("Capture the job")}</h3>
            <p>{t("Book a trip, attach the customer and lock the lane, load and rate before anything moves.")}</p>
          </article>
          <article>
            <span className="lp-step-number">02</span>
            <span className="lp-step-icon"><LpIcon name="truck" size={19} /></span>
            <h3>{t("Dispatch with clarity")}</h3>
            <p>{t("Assign the right vehicle and driver, review the planned route and update status as work progresses.")}</p>
          </article>
          <article>
            <span className="lp-step-number">03</span>
            <span className="lp-step-icon"><LpIcon name="wallet" size={19} /></span>
            <h3>{t("Settle and learn")}</h3>
            <p>{t("Fuel, expenses and income reconcile against the trip, feeding reports and the next decision.")}</p>
          </article>
        </div>
      </section>

      <section className="lp-cta">
        <div className="lp-cta-copy">
          <span className="lp-eyebrow is-light"><i />{t("Ready when you are")}</span>
          <h2>{t("Put your transport business on one calm rail.")}</h2>
          <p>{t("Set up your workspace, invite your team and run the first trip today. Your vehicles, drivers and numbers finally in the same place.")}</p>
          <div className="lp-hero-actions">
            <Link className="lp-btn lp-btn-light" href={primaryHref}>{t(primaryLabel)}<LpIcon name="arrow" size={16} /></Link>
            {!signedIn && <Link className="lp-btn lp-btn-outline" href="/login">{t("Sign in")}</Link>}
          </div>
        </div>
        <div className="lp-cta-visual" aria-hidden="true">
          <span className="lp-orbit lp-orbit-a" />
          <span className="lp-orbit lp-orbit-b" />
          <div className="lp-cta-badge"><strong>96.4%</strong><small>{t("On-time delivery")}</small></div>
          <span className="lp-cta-chip lp-chip-a"><i />128 active trips</span>
          <span className="lp-cta-chip lp-chip-b"><i />24 vehicles</span>
        </div>
      </section>
    </main>

    <footer className="lp-footer">
      <div className="lp-footer-brand">
        <Link href="/" className="lp-brand"><Logo /><span className="lp-brand-copy"><b>TRANZORA</b><small>{t("Transport operations")}</small></span></Link>
        <p>{t("Smart transport business management for teams that keep Bangladesh moving.")}</p>
      </div>
      <div className="lp-footer-links">
        <div><b>{t("Platform")}</b><a href="#platform">{t("Overview")}</a><a href="#modules">{t("Modules")}</a><a href="#workflow">{t("Workflow")}</a></div>
        <div><b>{t("Account")}</b><Link href="/login">{t("Sign in")}</Link><Link href="/register">{t("Create account")}</Link><Link href="/dashboard">{t("Dashboard")}</Link></div>
      </div>
      <small className="lp-copyright">© 2026 Tranzora. Transport business management platform.</small>
    </footer>
  </div>;
}
