import "server-only";
import { getBackendUrl } from "./backend-url";
import { cookies } from "next/headers";

export const sessionCookie = "tranzora_session";
export type SessionUser = {
  id: string;
  organizationId: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  status: string;
};

// Server-rendered pages use the same identity service as browser requests.
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(sessionCookie)?.value;
  if (!token) return null;
  const response = await fetch(
    `${getBackendUrl()}/api/auth/session`,
    {
      headers: { Cookie: `${sessionCookie}=${encodeURIComponent(token)}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    },
  );
  if (response.status === 401) return null;
  if (!response.ok)
    throw new Error(
      "The identity service is unavailable. Please try again shortly.",
    );
  return ((await response.json()) as { user: SessionUser }).user;
}
