import "server-only";
export function getBackendUrl() {
  const configured = process.env.BACKEND_URL ?? "http://localhost:5080";
  const url = new URL(configured.includes("://") ? configured : `http://${configured}`);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash)
    throw new Error("BACKEND_URL must identify the private API origin.");
  return url.origin;
}
