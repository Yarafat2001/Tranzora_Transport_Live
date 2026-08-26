export type ScreenKind =
  | "auth"
  | "overview"
  | "table"
  | "analytics"
  | "settings"
  | "profile"
  | "details"
  | "map"
  | "calendar"
  | "support"
  | "notifications"
  | "subscription"
  | "reports-center"
  | "backup"
  | "database"
  | "permissions"
  | "integrations";

export type Screen = {
  id: number;
  board: number;
  quadrant: number;
  slug: string;
  title: string;
  description: string;
  section: string;
  kind: ScreenKind;
  role: string;
};

const boards: Array<Array<[string, ScreenKind]>> = [
  [["Login", "auth"], ["Register", "auth"], ["Forgot Password", "auth"], ["OTP Verification", "auth"]],
  [["Dashboard Overview", "overview"], ["Trip Management", "table"], ["Vehicle Management", "table"], ["Driver Management", "table"]],
  [["Customer Management", "table"], ["Booking Management", "table"], ["Expense Management", "table"], ["Income Management", "table"]],
  [["Reports Overview", "reports-center"], ["Maintenance Overview", "table"], ["User Management", "table"], ["Settings", "settings"]],
  [["Profile", "profile"], ["Subscription & Billing", "subscription"], ["Notifications", "notifications"], ["Activity Logs", "table"]],
  [["Trip Overview", "table"], ["Booking Management", "table"], ["Vehicle Utilization Report", "analytics"], ["Profit & Loss Statement", "analytics"]],
  [["Driver Performance", "analytics"], ["Fuel Analysis", "analytics"], ["Geofencing", "map"], ["Document Management", "table"]],
  [["Invoice Management", "table"], ["Customer Management", "table"], ["Expense Categories", "table"], ["Payment Methods", "table"]],
  [["Vehicle Management", "table"], ["Driver Management", "table"], ["Route Management", "map"], ["Maintenance Management", "table"]],
  [["Expense Management", "table"], ["Income Management", "table"], ["Reports Overview", "reports-center"], ["Settings", "settings"]],
  [["User Management", "table"], ["Roles & Permissions", "permissions"], ["System Preferences", "settings"], ["Backup & Restore", "backup"]],
  [["Database Management", "database"], ["Security Settings", "settings"], ["Audit Logs", "table"], ["Profile Settings", "profile"]],
  [["Notification Settings", "settings"], ["Appearance Settings", "settings"], ["Change Password", "settings"], ["System Activity Dashboard", "analytics"]],
  [["Trip Management", "table"], ["Booking Management", "table"], ["Vehicle Tracking", "map"], ["Fuel Management", "table"]],
  [["Income Overview", "analytics"], ["Reports", "reports-center"], ["Maintenance Management", "table"], ["Expense Categories", "analytics"]],
  [["Patients", "table"], ["Bookings", "table"], ["Live Vehicle Tracking", "map"], ["Analytics Overview", "analytics"]],
  [["Trips", "table"], ["Drivers", "table"], ["Customers", "table"], ["Maintenance Overview", "analytics"]],
  [["Driver Report", "table"], ["Customer Report", "table"], ["Trip Report", "table"], ["Monthly/Yearly Analytics", "analytics"]],
  [["Bookings", "table"], ["Expenses", "table"], ["Vehicles", "table"], ["Analytics Overview", "analytics"]],
  [["Customer Insights", "analytics"], ["Booking Calendar", "calendar"], ["Maintenance Analytics", "analytics"], ["System Settings", "settings"]],
  [["Income vs Expense", "analytics"], ["Notifications", "notifications"], ["Payment Settings", "settings"], ["Backup & Restore", "backup"]],
  [["Trip Tracking", "map"], ["Vehicle Details", "details"], ["Driver Performance", "table"], ["Reports & Analytics", "analytics"]],
  [["Customer Details", "details"], ["Booking Details", "details"], ["Income by Date", "analytics"], ["Maintenance History", "table"]],
  [["Driver Management", "table"], ["Fuel Management", "analytics"], ["User Management", "table"], ["Settings", "settings"]],
  [["System Logs", "table"], ["Expense Analytics", "analytics"], ["Route Optimization", "map"], ["Performance Overview", "analytics"]],
  [["Revenue Analytics", "analytics"], ["Expense Management", "analytics"], ["Booking Management", "table"], ["Vehicle Maintenance", "table"]],
  [["Alert Management", "table"], ["Notifications", "notifications"], ["Report Center", "reports-center"], ["Help & Support", "support"]],
  [["Trip Management", "analytics"], ["Vehicle Tracking", "map"], ["Financial Summary", "analytics"], ["Settings", "settings"]],
  [["Supplier Management", "table"], ["Payroll Management", "analytics"], ["Role & Permission Management", "permissions"], ["API & Integrations", "integrations"]],
  [["Income Management", "analytics"], ["Expense Analytics", "analytics"], ["Reports Center", "reports-center"], ["User Management", "table"]],
];

const descriptions: Record<ScreenKind, string> = {
  auth: "Secure access to your transport business workspace.",
  overview: "A complete snapshot of your transport operations.",
  table: "View, organize and manage your operational records.",
  analytics: "Track performance and understand the latest trends.",
  settings: "Configure preferences and manage workspace controls.",
  profile: "Manage account details and personal preferences.",
  details: "Review complete record details and recent activity.",
  map: "Monitor routes, locations and live movement.",
  calendar: "Plan and review scheduled transport activity.",
  support: "Find answers and get help from our support team.",
  notifications: "View all system notifications and alerts.",
  subscription: "Manage your subscription plan and billing information.",
  "reports-center": "Generate and download detailed business reports.",
  backup: "Create backups and restore your system data.",
  database: "Manage and monitor database performance and operations.",
  permissions: "Manage roles and permissions for system access.",
  integrations: "Connect and manage third-party services.",
};

const roleForBoard = (board: number) => {
  if (board <= 5) return "Admin Portal";
  if (board <= 13) return "Fleet Manager";
  if (board <= 18) return "Trip Manager";
  if (board <= 23) return "Operations Manager";
  if (board <= 27) return "Business Owner";
  return "Finance Manager";
};

export const screens: Screen[] = boards.flatMap((items, boardIndex) =>
  items.map(([title, kind], quadrantIndex) => {
    const id = boardIndex * 4 + quadrantIndex + 1;
    return {
      id,
      board: boardIndex + 1,
      quadrant: quadrantIndex + 1,
      slug: `${String(id).padStart(3, "0")}-${title.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`,
      title,
      description: kind === "auth" ? ({
        Login: "Enter your email and password to continue",
        Register: "Fill in the details to create your account",
        "Forgot Password": "Enter your registered email address and we'll send you reset instructions.",
        "OTP Verification": "We have sent a 6-digit OTP to your email address.",
      }[title] ?? descriptions.auth) : descriptions[kind as ScreenKind],
      section: title.replace(/ Management| Overview| Analytics| Report| Settings| Details| Dashboard/g, ""),
      kind: kind as ScreenKind,
      role: roleForBoard(boardIndex + 1),
    };
  }),
);

export const getScreen = (slug: string) => screens.find((screen) => screen.slug === slug);

export const navigation = [
  "Dashboard",
  "Trips",
  "Bookings",
  "Vehicles",
  "Drivers",
  "Customers",
  "Maintenance",
  "Fuel",
  "Expenses",
  "Income",
  "Reports",
  "Users",
  "Settings",
];
