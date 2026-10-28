import { getBackendUrl } from "@/lib/backend-url";
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Runtime-configured same-origin BFF; it contains no business or database logic.
async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  if (path.some((segment) => !/^[a-zA-Z0-9_-]+$/.test(segment)))
    return Response.json({ error: "Invalid API path." }, { status: 400 });
  const mutation = !["GET", "HEAD"].includes(request.method);
  if (mutation) {
    const configured = new URL(
      process.env.AUTH_URL ?? "http://localhost:3000",
    ).origin;
    // `next dev` moves to a free port when 3000 is busy, so during development
    // also accept the origin that matches this server's own address.
    const host = request.headers.get("host");
    const selfOrigin = host
      ? `${request.nextUrl.protocol}//${host}`
      : "";
    const allowed =
      process.env.NODE_ENV === "development"
        ? [configured, selfOrigin]
        : [configured];
    const origin = request.headers.get("origin");
    if (
      (origin && !allowed.includes(origin)) ||
      request.headers.get("x-tranzora-request") !== "1"
    )
      return Response.json(
        { error: "Request origin or CSRF header is invalid." },
        { status: 403 },
      );
    if (Number(request.headers.get("content-length")) > 65536)
      return Response.json(
        { error: "Request exceeds 64 KiB." },
        { status: 413 },
      );
  }
  const backend = getBackendUrl();
  const route =
    path.join("/") === "health" ? "/health/ready" : `/api/${path.join("/")}`;
  const headers = new Headers();
  for (const name of [
    "cookie",
    "content-type",
    "idempotency-key",
    "if-match",
    "x-tranzora-request",
    "origin",
  ])
    if (request.headers.has(name))
      headers.set(name, request.headers.get(name)!);
  try {
    let body: ArrayBuffer | undefined;
    if (mutation && request.body) {
      const reader = request.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 65536) {
            await reader.cancel();
            return Response.json({ error: "Request exceeds 64 KiB." }, { status: 413 });
          }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      body = bytes.buffer;
    }
    const upstream = await fetch(
      `${backend}${route}${request.nextUrl.search}`,
      {
        method: request.method,
        headers,
        body,
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
      },
    );
    const responseHeaders = new Headers({ "Cache-Control": "no-store" });
    for (const name of [
      "content-type",
      "etag",
      "location",
      "retry-after",
      "idempotency-replayed",
      "x-request-id",
      "referrer-policy",
      "x-content-type-options",
    ])
      if (upstream.headers.has(name))
        responseHeaders.set(name, upstream.headers.get(name)!);
    for (const cookie of upstream.headers.getSetCookie())
      responseHeaders.append("set-cookie", cookie);
    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return Response.json(
      { error: "Backend is unavailable. Please retry shortly." },
      {
        status: 503,
        headers: { "Retry-After": "5", "Cache-Control": "no-store" },
      },
    );
  }
}

export {
  proxy as GET,
  proxy as POST,
  proxy as PUT,
  proxy as PATCH,
  proxy as DELETE,
};
