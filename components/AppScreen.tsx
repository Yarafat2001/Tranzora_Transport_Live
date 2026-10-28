"use client";
import Link from "next/link";
import { apiUrl } from "@/lib/api-client";
import { FormEvent, useEffect, useRef, useState } from "react";
import type { Screen } from "@/lib/screens";
import type { SessionUser } from "@/lib/auth";
import ThemeToggle from "@/components/ThemeToggle";
import WorkspaceShell from "@/components/WorkspaceShell";
import { Icon, Logo, type IconName } from "@/components/WorkspaceIcons";

function AuthScreen({ screen }: { screen: Screen }) {
  const [submitted, setSubmitted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [authNotice, setAuthNotice] = useState("");
  const [socialProvider, setSocialProvider] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [providers, setProviders] = useState<Record<string, boolean>>({});
  const [externalEnrollment, setExternalEnrollment] = useState<{ provider: string; name: string; email: string } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const isLogin = screen.title === "Login";
  const isRegister = screen.title === "Register";
  const isOtp = screen.title.includes("OTP");
  useEffect(() => {
    const message = new URLSearchParams(window.location.search).get(
      "oauth_error",
    );
    if (message) setAuthNotice(message);
    fetch(apiUrl("auth/providers"), { cache: "no-store", credentials: "include" }).then(response => response.ok ? response.json() : []).then((items: { provider: string; enabled: boolean }[]) => setProviders(Object.fromEntries(items.map(item => [item.provider, item.enabled])))).catch(() => setProviders({ google: false, microsoft: false }));
    if (isRegister && new URLSearchParams(window.location.search).has("external")) {
      fetch(apiUrl("auth/external/enrollment"), { cache: "no-store", credentials: "include" }).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Sign-up request expired. Please start provider sign-in again."); return data; }).then(data => { setExternalEnrollment(data); setSocialProvider(data.provider === "google" ? "Google" : "Microsoft"); }).catch(error => setAuthNotice(error.message));
    }
  }, [isRegister]);
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let pointerX = 0;
    let pointerY = 0;
    const reset = () =>
      ["--arx", "--ary", "--agx", "--agy"].forEach((name) =>
        card.style.removeProperty(name),
      );
    const paint = () => {
      frame = 0;
      const rect = card.getBoundingClientRect();
      const x = (pointerX - rect.left) / rect.width;
      const y = (pointerY - rect.top) / rect.height;
      card.style.setProperty("--ary", `${(x - 0.5) * 6}deg`);
      card.style.setProperty("--arx", `${(0.5 - y) * 4}deg`);
      card.style.setProperty("--agx", `${x * 100}%`);
      card.style.setProperty("--agy", `${y * 100}%`);
    };
    const handleMove = (event: PointerEvent) => {
      if (
        reduceMotion.matches ||
        event.pointerType === "touch" ||
        card.contains(document.activeElement)
      )
        return;
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (!frame) frame = requestAnimationFrame(paint);
    };
    card.addEventListener("pointermove", handleMove);
    card.addEventListener("pointerleave", reset);
    card.addEventListener("focusin", reset);
    return () => {
      card.removeEventListener("pointermove", handleMove);
      card.removeEventListener("pointerleave", reset);
      card.removeEventListener("focusin", reset);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isOtp) {
      setAuthNotice(
        "OTP verification is not enabled. Use email and password sign-in.",
      );
      return;
    }
    if (isRegister && new URLSearchParams(window.location.search).has("external") && !externalEnrollment) {
      setAuthNotice("Provider sign-up is not ready or has expired. Please start provider sign-in again.");
      return;
    }
    setAuthNotice("");
    const form = new FormData(e.currentTarget);
    if (isRegister && form.get("password") !== form.get("confirmPassword")) {
      setAuthNotice("Passwords do not match.");
      return;
    }
    setAuthLoading(true);
    const body = {
      email: form.get("email"),
      password: form.get("password"),
      name: form.get("name"),
      company: form.get("company"),
      phone: form.get("phone"),
    };
    try {
      const response = await fetch(
        apiUrl(`auth/${isLogin ? "login" : isRegister ? externalEnrollment ? "external/register" : "register" : "forgot-password"}`),
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "X-Tranzora-Request": "1",
          },
          body: JSON.stringify(body),
        },
      );
      const responseText = await response.text();
      let result: { error?: string } = {};
      if (responseText.trim()) {
        try {
          result = JSON.parse(responseText) as { error?: string };
        } catch {
          result = {
            error: "The authentication service returned an invalid response.",
          };
        }
      }
      if (!response.ok) {
        setAuthNotice(result.error ?? "Authentication failed.");
        return;
      }
      setSubmitted(true);
    } catch {
      setAuthNotice(
        "Unable to connect to the authentication service. Please try again.",
      );
    } finally {
      setAuthLoading(false);
    }
  };
  const heading = isLogin
    ? "Welcome Back!"
    : isRegister
      ? "Create Your Account"
      : isOtp
        ? "Verify OTP"
        : "Forgot Password?";
  const formTitle = isLogin
    ? "Login to your account"
    : isRegister
      ? "Create New Account"
      : isOtp
        ? "Enter Verification Code"
        : "Reset Your Password";
  const passwordFields = (
    <>
      <label>
        Password
        <span className="auth-field">
          <Icon name="lock" size={17} />
          <div className="password-input">
            <input
              name="password"
              required
              minLength={isRegister ? 8 : 1}
              maxLength={128}
              pattern={
                isRegister
                  ? "(?=.*[A-Za-z])(?=.*\\d)(?=.*[^A-Za-z0-9\\s]).{8,128}"
                  : undefined
              }
              title={
                isRegister
                  ? "Use 8-128 characters with at least one letter, one number and one symbol."
                  : undefined
              }
              type={showPassword ? "text" : "password"}
              placeholder={
                isRegister ? "Create password" : "Enter your password"
              }
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </span>
      </label>
      {isRegister && (
        <label>
          Confirm Password
          <span className="auth-field">
            <Icon name="lock" size={17} />
            <div className="password-input">
              <input
                name="confirmPassword"
                required
                minLength={8}
                maxLength={128}
                pattern="(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9\s]).{8,128}"
                title="Use 8-128 characters with at least one letter, one number and one symbol."
                type="password"
                placeholder="Confirm password"
              />
            </div>
          </span>
        </label>
      )}
    </>
  );
  return (
    <main className={`auth-page auth-screen-${screen.id}`}>
      <section className="auth-brand">
        <Link href="/login" className="brand brand-large">
          <Logo />
          <span className="brand-copy">
            <b>TRANZORA</b>
            <small>Smart Transport Business Management Platform</small>
          </span>
        </Link>
        <div className="auth-message">
          <h1>{heading}</h1>
          <p>
            {isLogin
              ? "Login to your account to manage your trips, vehicles, drivers and more."
              : isRegister
                ? "Join TRANZORA and streamline your transport business."
                : isOtp
                  ? "Enter the 6-digit code sent to your email address."
                  : "Don't worry! Enter your email address and we'll send you a link to reset your password."}
          </p>
          {(isLogin || !isRegister) && (
            <div
              className={`auth-illustration ${isOtp ? "otp-art" : !isLogin ? "lock-art" : ""}`}
            >
              <span className="building b1" />
              <span className="building b2" />
              <span className="building b3" />
              <span className="road-art" />
              <span className="bus-art">▰</span>
            </div>
          )}
          {isRegister ? (
            <div className="register-benefits">
              {[
                ["grid", "Centralized Management"],
                ["customer", "Real-time Tracking"],
                ["report", "Reports & Analytics"],
              ].map(([icon, label]) => (
                <span key={label}>
                  <i>
                    <Icon name={icon as IconName} />
                  </i>
                  <b>{label}</b>
                  <small>Manage your operations in one place.</small>
                </span>
              ))}
            </div>
          ) : isLogin ? (
            <div className="auth-features">
              <span>
                <i className="blue">
                  <Icon name="report" />
                </i>
                Manage Operations
              </span>
              <span>
                <i className="green">
                  <Icon name="vehicle" />
                </i>
                Track Vehicles
              </span>
              <span>
                <i className="violet">
                  <Icon name="users" />
                </i>
                Manage Drivers
              </span>
            </div>
          ) : null}
        </div>
      </section>
      <section className="auth-form-wrap">
        <div className="auth-form-card" ref={cardRef}>
          <ThemeToggle className="auth-theme-toggle" />
          <div className="mobile-brand">
            <Logo />
            <b>TRANZORA</b>
          </div>
          <h2>{formTitle}</h2>
          <p>{screen.description}</p>
          {submitted ? (
            <div className="success-card">
              <span>
                <Icon name="check" size={26} />
              </span>
              <h3>
                {socialProvider
                  ? `${socialProvider} sign-in complete`
                  : isOtp
                    ? "Account verified"
                    : isRegister
                      ? "Account created"
                      : isLogin
                        ? "Welcome back"
                        : "Check your email"}
              </h3>
              <p>
                {socialProvider
                  ? `Your ${socialProvider} account is connected to Tranzora.`
                  : "Your request was completed successfully."}
              </p>
              <Link className="primary button-link" href="/dashboard">
                Continue to dashboard
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} key={externalEnrollment?.provider ?? "password"}>
              {externalEnrollment && <p className="external-signup-note">Finish setting up your workspace to connect {socialProvider}. Choose a backup password and an email you control for account recovery. If you already have an account, sign in with your password and connect {socialProvider} from My profile.</p>}
              {isRegister && (
                <div className="form-grid register-grid">
                  <label>
                    Full Name
                    <span className="auth-field">
                      <Icon name="user" size={17} />
                      <input
                        name="name"
                        defaultValue={externalEnrollment?.name ?? ""}
                        required
                        placeholder="Enter full name"
                      />
                    </span>
                  </label>
                  <label>
                    Email Address
                    <span className="auth-field">
                      <Icon name="mail" size={17} />
                      <input
                        name="email"
                        defaultValue={externalEnrollment?.email ?? ""}
                        required
                        type="email"
                        placeholder="Enter email"
                      />
                    </span>
                  </label>
                  <label>
                    Phone Number
                    <span className="auth-field">
                      <Icon name="phone" size={17} />
                      <input
                        name="phone"
                        required
                        placeholder="Enter phone number"
                      />
                    </span>
                  </label>
                  <label>
                    Company Name
                    <span className="auth-field">
                      <Icon name="building" size={17} />
                      <input
                        name="company"
                        required
                        placeholder="Enter company name"
                      />
                    </span>
                  </label>
                </div>
              )}
              {!isOtp && !isRegister && (
                <label>
                  Email Address
                  <span className="auth-field">
                    <Icon name="mail" size={17} />
                    <input
                      name="email"
                      required
                      type="email"
                      placeholder={
                        isLogin
                          ? "Enter your email"
                          : "Enter your registered email"
                      }
                    />
                  </span>
                </label>
              )}
              {(isLogin || isRegister) &&
                (isRegister ? (
                  <div className="form-grid register-grid">
                    {passwordFields}
                  </div>
                ) : (
                  passwordFields
                ))}
              {isOtp && (
                <>
                  <div className="otp-inputs">
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <input
                        aria-label={`Verification digit ${n}`}
                        inputMode="numeric"
                        maxLength={1}
                        key={n}
                      />
                    ))}
                  </div>
                  <p className="otp-expiry">
                    OTP will expire in <b>04:45</b>
                  </p>
                </>
              )}
              {isLogin && (
                <div className="remember">
                  <label>
                    <input type="checkbox" defaultChecked /> Remember me
                  </label>
                  <Link href="/forgot-password">Forgot Password?</Link>
                </div>
              )}
              {isRegister && (
                <label className="terms">
                  <input type="checkbox" required /> I agree to the Terms &
                  Conditions and Privacy Policy
                </label>
              )}
              <button className="primary auth-submit" disabled={authLoading} aria-busy={authLoading}>
                {authLoading
                  ? isLogin
                    ? "Signing you in..."
                    : isRegister ? "Creating your account..." : "Sending reset link..."
                  : isLogin
                    ? "Login"
                    : isRegister
                      ? "Register"
                      : isOtp
                        ? "Verify OTP"
                        : "Send Reset Link"}
              </button>
              {!isLogin && !isRegister && !isOtp && (
                <div className="email-tip">
                  <Icon name="report" />
                  <span>
                    <b>Check your email</b>
                    <small>
                      We will send a password reset link to your email address.
                    </small>
                  </span>
                </div>
              )}
              {(isLogin || isRegister) && !externalEnrollment && (
                <>
                  <div className="or">
                    <span />
                    or {isRegister ? "register" : "continue"} with
                    <span />
                  </div>
                  <div className="social-login">
                    <button
                      type="button"
                      className="google-btn"
                      disabled={!providers.google || authLoading}
                      onClick={() => window.location.assign(apiUrl("auth/google"))}
                    >
                      <Icon name="google" size={20} />{" "}
                      <span>Continue with Google</span>
                    </button>
                    <button
                      type="button"
                      className="google-btn"
                      disabled={!providers.microsoft || authLoading}
                      onClick={() =>
                        window.location.assign(apiUrl("auth/microsoft"))
                      }
                    >
                      <Icon name="microsoft" size={20} />{" "}
                      <span>Continue with Microsoft</span>
                    </button>
                  </div>
                  {providers.google === false && providers.microsoft === false && <p className="external-signup-note">Google and Microsoft sign-in need administrator setup. Email and password sign-in is available.</p>}
                </>
              )}
              {(isLogin || isRegister) && (
                <p className="auth-switch">
                  {isLogin
                    ? "Don't have an account?"
                    : "Already have an account?"}{" "}
                  <Link href={isLogin ? "/register" : "/login"}>
                    {isLogin ? "Register here" : "Login here"}
                  </Link>
                </p>
              )}
              {isOtp && (
                <p className="auth-switch">
                  Didn't receive the code?{" "}
                  <button
                    type="button"
                    onClick={() =>
                      setAuthNotice(
                        "OTP delivery is not enabled. Use email and password sign-in.",
                      )
                    }
                  >
                    Resend OTP
                  </button>
                </p>
              )}
              {authNotice && (
                <p className="inline-notice" role="alert">
                  {authNotice}
                </p>
              )}
            </form>
          )}
        </div>
        <Link className="back-link" href="/login">
          ← Back to Login
        </Link>
      </section>
    </main>
  );
}

export default function AppScreen({
  screen,
  user,
}: {
  screen: Screen;
  user?: SessionUser | null;
}) {
  return screen.kind === "auth" ? (
    <AuthScreen screen={screen} />
  ) : (
    <WorkspaceShell screen={screen} initialUser={user ?? null} />
  );
}
