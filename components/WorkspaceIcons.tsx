import type React from "react";

export type IconName =
  | "grid"
  | "trip"
  | "booking"
  | "vehicle"
  | "driver"
  | "customer"
  | "wrench"
  | "fuel"
  | "expense"
  | "income"
  | "report"
  | "invoice"
  | "payment"
  | "document"
  | "audit"
  | "support"
  | "supplier"
  | "users"
  | "settings"
  | "search"
  | "bell"
  | "plus"
  | "dots"
  | "arrow"
  | "menu"
  | "close"
  | "check"
  | "eye"
  | "edit"
  | "trash"
  | "google"
  | "microsoft"
  | "user"
  | "mail"
  | "lock"
  | "phone"
  | "building"
  | "sun"
  | "moon";

const iconPaths: Record<IconName, React.ReactNode> = {
  invoice: (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
      <path d="M9 7h6M9 11h6M9 15h2" />
    </>
  ),
  payment: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="3" />
      <path d="M2 10h20M6 15h3M16 15h2" />
    </>
  ),
  document: (
    <>
      <path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10Z" />
      <path d="M13 3v7h7M8 14h8M8 17h5" />
    </>
  ),
  audit: (
    <>
      <path d="M12 3 4 6v6c0 4 4 7 8 9 4-2 8-5 8-9V6Z" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  support: (
    <>
      <path d="M4 14v-3a8 8 0 0 1 16 0v3M20 17v1a3 3 0 0 1-3 3h-3" />
      <rect x="2" y="11" width="4" height="7" rx="2" />
      <rect x="18" y="11" width="4" height="7" rx="2" />
    </>
  ),
  supplier: (
    <>
      <path d="m3 7 9-4 9 4v11l-9 4-9-4ZM3 7l9 4 9-4M12 11v11M7 5l10 4" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="2" />
      <rect x="14" y="3" width="7" height="7" rx="2" />
      <rect x="3" y="14" width="7" height="7" rx="2" />
      <rect x="14" y="14" width="7" height="7" rx="2" />
    </>
  ),
  trip: (
    <>
      <circle cx="6" cy="6" r="3" />
      <circle cx="18" cy="18" r="3" />
      <path d="M9 6h7a4 4 0 0 1 0 8H8a4 4 0 0 0 0 8M6 9v3M18 12v3" />
    </>
  ),
  booking: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </>
  ),
  vehicle: (
    <>
      <path d="M5 17h14l-1.5-7h-11zM3 14h2m14 0h2" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </>
  ),
  driver: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1-5 4-7 8-7s7 2 8 7" />
    </>
  ),
  customer: (
    <>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2" />
      <path d="M3 20c1-4 3-6 6-6s5 2 6 6M15 15c3 0 5 2 6 5" />
    </>
  ),
  wrench: <path d="M14 6a4 4 0 0 0-5 5L3 17l4 4 6-6a4 4 0 0 0 5-5l-3 2-3-3z" />,
  fuel: (
    <>
      <path d="M5 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16M3 21h15M8 7h5v4H8z" />
      <path d="M16 8h2l3 3v7a2 2 0 0 1-4 0v-3" />
    </>
  ),
  expense: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12h8M12 8l-4 4 4 4" />
    </>
  ),
  income: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M16 12H8m4-4 4 4-4 4" />
    </>
  ),
  report: (
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </>
  ),
  users: (
    <>
      <circle cx="8" cy="8" r="3" />
      <circle cx="17" cy="8" r="3" />
      <path d="M2 20c1-4 3-6 6-6s5 2 6 6M12 20c1-4 3-6 5-6 3 0 5 2 6 6" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a8 8 0 0 0-1.7-1L14.5 3h-5L9 6a8 8 0 0 0-1.7 1L5 6 3 9.5 5.1 11a7 7 0 0 0 0 2L3 14.5 5 18l2.3-1a8 8 0 0 0 1.7 1l.5 3h5l.5-3a8 8 0 0 0 1.7-1l2.3 1 2-3.5-2.1-1.5a7 7 0 0 0 .1-1z" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  dots: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
  arrow: <path d="m9 18 6-6-6-6" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  check: <path d="m5 12 4 4L19 6" />,
  eye: (
    <>
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z" />
      <path d="m14.5 7.5 2 2" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M10 11v5M14 11v5M6 7l1 13h10l1-13M9 7V4h6v3" />
    </>
  ),
  google: (
    <>
      <path
        d="M21 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.1a4.4 4.4 0 0 1-1.9 2.9v2.4h3.1c1.8-1.7 2.7-4.1 2.7-7.1z"
        fill="#4285f4"
        stroke="none"
      />
      <path
        d="M12 21c2.6 0 4.8-.9 6.3-2.4l-3.1-2.4c-.9.6-1.9 1-3.2 1-2.5 0-4.6-1.7-5.4-4H3.4v2.5A9.5 9.5 0 0 0 12 21z"
        fill="#34a853"
        stroke="none"
      />
      <path
        d="M6.6 13.2a5.7 5.7 0 0 1 0-3.6V7.1H3.4a9.5 9.5 0 0 0 0 8.6z"
        fill="#fbbc05"
        stroke="none"
      />
      <path
        d="M12 5.6c1.4 0 2.7.5 3.7 1.5l2.8-2.8A9.5 9.5 0 0 0 3.4 7.1l3.2 2.5c.8-2.3 2.9-4 5.4-4z"
        fill="#ea4335"
        stroke="none"
      />
    </>
  ),
  microsoft: (
    <>
      <path d="M3 3h8.5v8.5H3z" fill="#f35325" stroke="none" />
      <path d="M12.5 3H21v8.5h-8.5z" fill="#81bc06" stroke="none" />
      <path d="M3 12.5h8.5V21H3z" fill="#05a6f0" stroke="none" />
      <path d="M12.5 12.5H21V21h-8.5z" fill="#ffba08" stroke="none" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c.8-4 3.2-6 7-6s6.2 2 7 6" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="m4.5 7.5 7.5 5.5 7.5-5.5" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="10" rx="3" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
      <circle cx="12" cy="15.5" r="1.2" />
    </>
  ),
  phone: (
    <path d="M7 3.5h3l1.4 4-2 1.5a12 12 0 0 0 5.6 5.6l1.5-2 4 1.4v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 5 5.7 2 2 0 0 1 7 3.5Z" />
  ),
  building: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-2h4v2" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2.5 12h2M19.5 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />,
};

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {iconPaths[name]}
    </svg>
  );
}

export function Logo() {
  return (
    <span className="logo-mark" aria-hidden="true">
      <svg viewBox="0 0 48 36">
        <path d="M4 8h25v19H4zM29 14h8l7 8v5H29z" />
        <path d="M10 8V4h13v4M34 17h4l3 5h-7z" className="logo-detail" />
        <circle cx="12" cy="28" r="5" />
        <circle cx="36" cy="28" r="5" />
      </svg>
    </span>
  );
}
