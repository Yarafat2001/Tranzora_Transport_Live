export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.method && init.method !== "GET"
        ? { "X-Tranzora-Request": "1" }
        : {}),
      ...init.headers,
    },
  });
  if (response.status === 401 && !path.startsWith("auth/"))
    window.location.assign("/login");
  if (response.status === 204) return undefined as T;
  const data = (await response.json().catch(() => ({}))) as {
    error?: string;
    detail?: string;
  };
  if (!response.ok)
    throw new ApiError(
      data.error ?? data.detail ?? `Request failed (${response.status}).`,
      response.status,
    );
  return data as T;
}

// Keep the same key for retries of an unchanged command, including after a page reload.
// Only the fingerprint and random key are stored; form contents and passwords are not persisted.
export async function commandKey(
  path: string,
  method: string,
  body: string,
  version?: number,
) {
  const bytes = new TextEncoder().encode(
    `${path}:${method}:${version ?? ""}:${body}`,
  );
  const fingerprint = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const storageKey = `tranzora-command:${fingerprint}`;
  try {
    const stored = JSON.parse(sessionStorage.getItem(storageKey) ?? "null") as {
      key: string;
      created: number;
    } | null;
    if (stored && Date.now() - stored.created < 23 * 60 * 60 * 1000)
      return stored.key;
    const key = crypto.randomUUID();
    sessionStorage.setItem(
      storageKey,
      JSON.stringify({ key, created: Date.now() }),
    );
    return key;
  } catch {
    return crypto.randomUUID();
  }
}

export async function mutate<T>(
  path: string,
  method: string,
  input?: unknown,
  version?: number,
): Promise<T> {
  const body = input === undefined ? "" : JSON.stringify(input);
  const key = await commandKey(path, method, body, version);
  return api<T>(path, {
    method,
    ...(body ? { body } : {}),
    headers: {
      "Idempotency-Key": key,
      ...(version ? { "If-Match": `"${version}"` } : {}),
    },
  });
}
