export const roleNames = [
  "Super Admin",
  "Business Admin",
  "Manager",
  "Accountant",
  "Dispatcher",
  "Driver",
  "Support Staff",
  "Viewer",
] as const;
export type UserRole = (typeof roleNames)[number];
export const normalizeRole = (role?: string | null): UserRole =>
  roleNames.includes(role as UserRole) ? (role as UserRole) : "Viewer";
export const getRoleHome = (role?: string | null) =>
  role === "Driver"
    ? "/driver"
    : role === "Support Staff"
      ? "/help-support"
      : "/dashboard";
const administrators: UserRole[] = ["Super Admin", "Business Admin"];
const operations: UserRole[] = [
  ...administrators,
  "Manager",
  "Accountant",
  "Dispatcher",
  "Viewer",
];
const finance: UserRole[] = [
  ...administrators,
  "Manager",
  "Accountant",
  "Viewer",
];
const resourceRoles: Record<string, UserRole[]> = {
  dashboard: operations,
  analytics: operations,
  reports: operations,
  finance,
  revenue: finance,
  performance: operations,
  trips: operations,
  bookings: operations,
  vehicles: operations,
  drivers: operations,
  customers: [...operations, "Support Staff"],
  maintenance: finance,
  fuel: finance,
  expenses: finance,
  income: finance,
  invoices: finance,
  payments: finance,
  suppliers: finance,
  documents: [...administrators, "Manager", "Viewer"],
  notifications: [
    ...administrators,
    "Manager",
    "Dispatcher",
    "Support Staff",
    "Viewer",
  ],
  "help-support": [...administrators, "Manager", "Support Staff", "Viewer"],
  support: [...administrators, "Manager", "Support Staff", "Viewer"],
  "audit-logs": [...administrators, "Manager"],
  users: administrators,
  settings: administrators,
  "roles-permissions": administrators,
  subscription: finance,
  tracking: [...administrators, "Manager", "Dispatcher"],
  driver: ["Driver"],
};
export function canAccessRoute(
  role?: string | null,
  route?: string | null,
): boolean {
  const path = (route ?? "/").split(/[?#]/)[0];
  if (
    [
      "/",
      "/login",
      "/register",
      "/forgot-password",
      "/reset-password",
      "/verify-otp",
    ].includes(path)
  )
    return true;
  if (!roleNames.includes(role as UserRole)) return false;
  if (
    path === "/settings/profile" ||
    path.startsWith("/settings/profile/") ||
    path === "/settings/security/password"
  )
    return true;
  const allowed = resourceRoles[path.split("/")[1]] ?? [
    ...administrators,
    "Manager",
  ];
  return allowed.includes(role as UserRole);
}
export type NavigationItem = {
  label: string;
  href: string;
  group: "Workspace" | "Operations" | "Account";
};
const navigation: NavigationItem[] = [
  { label: "My workspace", href: "/driver", group: "Workspace" },
  { label: "My trips", href: "/driver/trips", group: "Workspace" },
  { label: "My vehicles", href: "/driver/vehicles", group: "Workspace" },
  { label: "Overview", href: "/dashboard", group: "Workspace" },
  { label: "Trips", href: "/trips", group: "Operations" },
  { label: "Bookings", href: "/bookings", group: "Operations" },
  { label: "Vehicles", href: "/vehicles", group: "Operations" },
  { label: "Drivers", href: "/drivers", group: "Operations" },
  { label: "Customers", href: "/customers", group: "Operations" },
  { label: "Maintenance", href: "/maintenance", group: "Operations" },
  { label: "Fuel", href: "/fuel", group: "Operations" },
  { label: "Expenses", href: "/expenses", group: "Operations" },
  { label: "Income", href: "/income", group: "Operations" },
  { label: "Invoices", href: "/invoices", group: "Operations" },
  { label: "Payments", href: "/payments", group: "Operations" },
  { label: "Suppliers", href: "/suppliers", group: "Operations" },
  { label: "Documents", href: "/documents", group: "Operations" },
  { label: "Reports", href: "/reports", group: "Operations" },
  { label: "Notifications", href: "/notifications", group: "Workspace" },
  { label: "Support", href: "/help-support", group: "Workspace" },
  { label: "Audit trail", href: "/audit-logs", group: "Operations" },
  { label: "Users", href: "/users", group: "Account" },
  { label: "Workspace settings", href: "/settings", group: "Account" },
  { label: "My profile", href: "/settings/profile", group: "Account" },
  { label: "Security", href: "/settings/security/password", group: "Account" },
];
export const getVisibleNavigation = (role?: string | null) =>
  navigation.filter((item) => canAccessRoute(role, item.href));
