"use client";
import { useLanguage } from "@/components/Language";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { Icon } from "@/components/WorkspaceIcons";
import { api } from "@/lib/api-client";
import styles from "./reset-password.module.css";

export default function ResetPasswordPage() {
  const { t } = useLanguage();
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    const form = new FormData(event.currentTarget);
    try {
      if (form.get("password") !== form.get("confirmPassword"))
        throw new Error("Passwords do not match.");
      await api("auth/reset-password", {
        method: "POST",
        body: JSON.stringify({
          token: new URLSearchParams(window.location.search).get("token") ?? "",
          password: form.get("password"),
        }),
      });
      setNotice("Password reset. Sign in with your new password.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Reset failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className={`auth-page ${styles.page}`}>
      <section className={`auth-form-wrap ${styles.wrap}`} aria-labelledby="reset-heading">
        <div className={`auth-form-card ${styles.card}`}>
          <div className={styles.emblem} aria-hidden="true"><Icon name="lock" size={24} /></div>
          <h1 id="reset-heading">{t("Reset your password")}</h1>
          <p className={styles.intro}>{t("Choose a new password to secure your Tranzora account.")}</p>
          <form onSubmit={submit}>
            <label>
              {t("New password ")}<span className="auth-field">
                <Icon name="lock" size={17} />
                <input
                  name="password"
                  aria-describedby="password-guidance"
                  type="password"
                  required
                  minLength={8}
                  maxLength={128}
                  pattern="(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9\s]).{8,128}"
                  title="Use 8-128 characters with at least one letter, one number and one symbol."
                  autoComplete="new-password"
                  placeholder={t("Create a new password")}
                />
              </span>
            </label>
            <p id="password-guidance" className={styles.guidance}>{t("Use 8-128 characters with a letter, a number and a symbol.")}</p>
            <label>
              {t("Confirm password ")}<span className="auth-field">
                <Icon name="lock" size={17} />
                <input
                  name="confirmPassword"
                  type="password"
                  required
                  minLength={8}
                  maxLength={128}
                  pattern="(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9\s]).{8,128}"
                  title="Use 8-128 characters with at least one letter, one number and one symbol."
                  autoComplete="new-password"
                  placeholder={t("Repeat the new password")}
                />
              </span>
            </label>
            <button className="primary auth-submit" disabled={busy}>
              {busy ? "Saving…" : t("Reset password")}
            </button>
          </form>
          {notice && <p className={styles.notice} role="status">{notice}</p>}
          <Link className={styles.back} href="/login">{t("Back to sign in")}</Link>
        </div>
      </section>
    </main>
  );
}
