import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import AppScreen from "@/components/AppScreen";
import { getSessionUser } from "@/lib/auth";
import { canAccessRoute, getRoleHome } from "@/lib/roles";
import { getScreenByRoute, screens, type Screen } from "@/lib/screens";

type PageProps = { params: Promise<{ path: string[] }> };

const supplementalRoutes = {
  "/driver": { source: "/dashboard", title: "My workspace", section: "Driver", kind: "overview" },
  "/driver/trips": { source: "/trips", title: "My trips", section: "Driver", kind: "table" },
  "/driver/vehicles": { source: "/vehicles", title: "My vehicles", section: "Driver", kind: "table" },
  "/payments": { source: "/settings/payments", title: "Payment Management", section: "Payment", kind: "table" },
  "/payments/create": { source: "/settings/payments", title: "Create Payment", section: "Payment", kind: "form" },
  "/challans": { source: "/invoices", title: "Challan Management", section: "Challan", kind: "table" },
  "/challans/create": { source: "/invoices", title: "Create Challan", section: "Challan", kind: "form" },
  "/subscription/payment": { source: "/subscription", title: "Subscription Payment", section: "Subscription", kind: "subscription" },
  "/subscription/history": { source: "/subscription", title: "Subscription History", section: "Subscription", kind: "subscription" },
} satisfies Record<string, { source: string; title: string; section: string; kind: Screen["kind"] }>;

const entityLabels: Record<string, string> = {
  trips: "Trip",
  vehicles: "Vehicle",
  drivers: "Driver",
  customers: "Customer",
  bookings: "Booking",
  expenses: "Expense",
  income: "Income",
  fuel: "Fuel",
  documents: "Document",
  invoices: "Invoice",
  maintenance: "Maintenance",
  users: "User",
  suppliers: "Supplier",
  payments: "Payment",
  notifications: "Notification",
  support: "Support",
};

function resolveScreen(path: string[]): Screen | undefined {
  const route = `/${path.join("/")}`;
  const exact = getScreenByRoute(route);
  if (exact) return exact;

  const supplemental = supplementalRoutes[route as keyof typeof supplementalRoutes];
  if (supplemental) {
    const source = getScreenByRoute(supplemental.source);
    if (!source) return undefined;
    return { ...source, id: 500 + source.id, route, title: supplemental.title, section: supplemental.section, kind: supplemental.kind, description: `Manage ${supplemental.section.toLowerCase()} records and connected business activity.` };
  }

  const [module, record] = path;
  const label = entityLabels[module];
  if (!label || !record) return undefined;

  const supplementalBase = supplementalRoutes[`/${module}` as keyof typeof supplementalRoutes];
  const base = getScreenByRoute(`/${module}`) ?? getScreenByRoute(module === "support" ? "/help-support" : supplementalBase?.source ?? "");
  if (!base) return undefined;

  if (record === "create") {
    return {
      ...base,
      id: 200 + base.id,
      route,
      title: `Create ${label}`,
      section: label,
      description: `Add a new ${label.toLowerCase()} with complete operational information.`,
      kind: "form",
    };
  }

  return {
    ...base,
    id: 300 + base.id,
    route,
    title: `${label} Details`,
    section: label,
    description: `Review ${record} and its connected transport activity.`,
    kind: "details",
  };
}

export function generateStaticParams() {
  const createRoutes = Object.keys(entityLabels).map((entity) => `/${entity}/create`);
  return [...screens.map((screen) => screen.route), ...Object.keys(supplementalRoutes), ...createRoutes].map((route) => ({ path: route.slice(1).split("/") }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { path } = await params;
  const screen = resolveScreen(path);
  return screen ? { title: `${screen.title} | TRANZORA`, description: screen.description } : {};
}

export default async function ProductPage({ params }: PageProps) {
  const { path } = await params;
  const screen = resolveScreen(path);
  if (!screen) notFound();

  const route = `/${path.join("/")}` || "/";
  const authRoute = ["/login", "/register", "/forgot-password", "/verify-otp"].includes(route);
  const sessionUser = await getSessionUser();

  if (!authRoute && !sessionUser) {
    redirect("/login");
  }

  if (!authRoute && sessionUser && !canAccessRoute(sessionUser.role, route)) {
    redirect(getRoleHome(sessionUser.role));
  }

  return <AppScreen screen={screen} user={sessionUser} />;
}
