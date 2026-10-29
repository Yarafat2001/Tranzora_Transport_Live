import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

export async function waitForApi(url, { timeoutMs = 120000, intervalMs = 500, isAlive = () => true } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive()) throw new Error("API process stopped before becoming ready.");
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(Math.max(1, Math.min(2000, deadline - Date.now()))) });
      const ready = response.ok;
      await response.body?.cancel();
      if (ready) return;
    } catch { /* The API may still be initializing its listener or database. */ }
    await delay(Math.max(0, Math.min(intervalMs, deadline - Date.now())));
  }
  throw new Error("API did not become ready within the startup deadline. Check API and database logs.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const pid = Number(process.argv[2]);
  const port = Number(process.argv[3]);
  if (!Number.isInteger(pid) || pid < 1 || !Number.isInteger(port) || port < 1 || port > 65535) {
    console.error("Invalid internal API process or port.");
    process.exitCode = 1;
  } else {
    try {
      console.log("Waiting for internal API readiness before starting the frontend.");
      await waitForApi(`http://127.0.0.1:${port}/health/ready`, {
        isAlive: () => { try { process.kill(pid, 0); return true; } catch { return false; } },
      });
      console.log("Internal API ready; starting the frontend.");
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
