import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { waitForApi } from "../deploy/wait-for-api.mjs";

async function endpoint(t, handler) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return `http://127.0.0.1:${server.address().port}/health/ready`;
}

test("startup waits through unhealthy responses until API is ready", async t => {
  let requests = 0;
  const url = await endpoint(t, (_, res) => { res.writeHead(++requests < 3 ? 503 : 200); res.end(); });
  await waitForApi(url, { timeoutMs: 3000, intervalMs: 10 });
  assert.equal(requests, 3);
});

test("startup fails if readiness remains unhealthy", async t => {
  const url = await endpoint(t, (_, res) => { res.writeHead(503); res.end(); });
  await assert.rejects(waitForApi(url, { timeoutMs: 150, intervalMs: 10 }), /startup deadline/);
});

test("startup fails if API process has stopped", async () => {
  await assert.rejects(waitForApi("http://127.0.0.1:1", { isAlive: () => false }), /process stopped/);
});

test("startup bounds requests that never respond", async t => {
  const url = await endpoint(t, () => {});
  await assert.rejects(waitForApi(url, { timeoutMs: 150, intervalMs: 10 }), /startup deadline/);
});
