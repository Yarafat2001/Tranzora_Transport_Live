import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

// Real ASP.NET OAuth handlers and PostgreSQL; only the remote identity service is mocked.
// Endpoint overrides are rejected by the application outside Testing + loopback.
test("external authentication, enrollment and cross-replica account protection", { timeout: 300000 }, async (t) => {
  const origin = "http://localhost:5082";
  const mockOrigin = "http://127.0.0.1:5095";
  const suffix = randomUUID();
  const password = "OAuth-Integration-Password-93!";
  const codes = new Map(), tokens = new Map();
  let nextProfile, pkceChecks = 0;
  const children = [], logs = [];
  const mock = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, mockOrigin);
      const [provider, action] = url.pathname.slice(1).split("/");
      if (action === "authorize") {
        assert.equal(url.searchParams.get("code_challenge_method"), "S256");
        assert.equal(url.searchParams.get("redirect_uri"), `${origin}/api/auth/callback/${provider}`);
        const code = randomUUID();
        codes.set(code, { profile: nextProfile, challenge: url.searchParams.get("code_challenge"), redirect: url.searchParams.get("redirect_uri"), provider });
        const destination = new URL(url.searchParams.get("redirect_uri"));
        destination.searchParams.set("code", code);
        destination.searchParams.set("state", url.searchParams.get("state"));
        res.writeHead(302, { Location: destination.href }).end();
      } else if (action === "token") {
        let body = "";
        for await (const chunk of req) body += chunk;
        const input = new URLSearchParams(body);
        const code = codes.get(input.get("code"));
        assert.ok(code, "authorization codes must be single-use");
        codes.delete(input.get("code"));
        assert.equal(code.provider, provider);
        assert.equal(input.get("client_secret"), "integration-secret");
        assert.equal(input.get("redirect_uri"), code.redirect);
        assert.equal(createHash("sha256").update(input.get("code_verifier")).digest("base64url"), code.challenge);
        pkceChecks++;
        const token = randomUUID();
        tokens.set(token, code.profile);
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ access_token: token, token_type: "Bearer", expires_in: 300 }));
      } else if (action === "userinfo") {
        const profile = tokens.get(req.headers.authorization?.replace(/^Bearer /i, ""));
        assert.ok(profile);
        const body = provider === "google" ? { id: profile.id, name: profile.name, email: profile.email, verified_email: true } : { id: profile.id, displayName: profile.name, mail: profile.email, userPrincipalName: profile.email };
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(body));
      } else res.writeHead(404).end();
    } catch (error) {
      logs.push(String(error));
      res.writeHead(400).end("Mock provider rejected request");
    }
  });
  await new Promise((done) => mock.listen(5095, "127.0.0.1", done));
  class Jar {
    values = new Map();
    header() { return [...this.values].map(([k,v]) => `${k}=${v}`).join("; "); }
    read(response) {
      for (const raw of response.headers.getSetCookie()) {
        const [pair] = raw.split(";");
        const i = pair.indexOf("=");
        if (/max-age=0|expires=Thu, 01 Jan 1970/i.test(raw) || pair.slice(i+1) === "") this.values.delete(pair.slice(0,i));
        else this.values.set(pair.slice(0,i), pair.slice(i+1));
      }
    }
  }
  async function request(path, { jar = new Jar(), method = "GET", input, replica = 0, key = randomUUID() } = {}) {
    const response = await fetch(`http://localhost:${5082 + replica}${path}`, {
      method, redirect: "manual", signal: AbortSignal.timeout(30000),
      headers: { Cookie: jar.header(), "X-Tranzora-Request": "1", "Idempotency-Key": key, ...(input === undefined ? {} : { "Content-Type": "application/json" }) },
      body: input === undefined ? undefined : JSON.stringify(input),
    });
    if (response.status === 429) {
      await response.arrayBuffer();
      await delay(Math.min(60, Number(response.headers.get("retry-after")) || 60) * 1000 + 100);
      return request(path, { jar, method, input, replica, key });
    }
    jar.read(response);
    return response;
  }
  async function oauth(provider, profile, jar = new Jar(), link) {
    nextProfile = profile;
    const challenge = await request(`/api/auth/${provider}${link ? `?link=${link}` : ""}`, { jar });
    assert.equal(challenge.status, 302);
    const authorization = await fetch(challenge.headers.get("location"), { redirect: "manual" });
    assert.equal(authorization.status, 302, await authorization.text());
    const callback = new URL(authorization.headers.get("location"));
    // A different replica must decrypt state and complete the initial replica's challenge.
    const result = await request(callback.pathname + callback.search, { jar, replica: 1 });
    assert.equal(result.status, 302);
    return { result, callback, jar };
  }
  async function json(response, status = 200) {
    const body = await response.json();
    assert.equal(response.status, status, JSON.stringify(body));
    return body;
  }
  try {
    for (const port of [5082,5083]) {
      const child = spawn("dotnet", [resolve("backend/Tranzora.Api/bin/Debug/net10.0/Tranzora.Api.dll")], {
        env: { ...process.env, ASPNETCORE_ENVIRONMENT: "Testing", ASPNETCORE_URLS: `http://localhost:${port}`, ConnectionStrings__Postgres: process.env.TEST_POSTGRES ?? "Host=localhost;Port=55432;Database=tranzora;Username=tranzora;Password=local-development-only", ConnectionStrings__Redis: "", App__PublicOrigin: origin, App__SecureCookies: "false", Authentication__TestProviderBaseUrl: mockOrigin, Authentication__google__ClientId: "integration-google", Authentication__google__ClientSecret: "integration-secret", Authentication__microsoft__ClientId: "integration-microsoft", Authentication__microsoft__ClientSecret: "integration-secret", Logging__LogLevel__Default: "Error" },
        windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
      });
      children.push(child);
      child.stdout.on("data", x => logs.push(x.toString()));
      child.stderr.on("data", x => logs.push(x.toString()));
    }
    for (let i=0;i<120;i++) {
      try {
        if ((await fetch(`${origin}/health/ready`)).ok && (await fetch("http://localhost:5083/health/ready")).ok) break;
      } catch {}
      if (i === 119) throw new Error(`Test API did not start: ${logs.join("\n")}`);
      await delay(500);
    }
    const input = { name: "OAuth Test", email: `oauth-${suffix}@example.test`, company: "OAuth integration workspace", phone: "+8801700000000", password };
    const profile = { id: suffix, name: input.name, email: input.email };
    const owner = new Jar();
    const local = await json(await request("/api/auth/register", { jar: owner, method: "POST", input }), 201);
    await t.test("provider discovery and unknown provider", async () => {
      const providers = await json(await request("/api/auth/providers", { jar: owner }));
      assert.deepEqual(providers.map(x => x.enabled), [true,true]);
      assert.equal((await request("/api/auth/unknown", { jar: owner })).status,404);
    });
    await t.test("an email match cannot authenticate or take over a local account", async () => {
      const { result, jar } = await oauth("google", profile);
      assert.match(result.headers.get("location"), /\/register\?external=google$/);
      assert.equal(jar.values.has("tranzora_session"),false);
      assert.equal((await request("/api/auth/session", { jar })).status,401);
      assert.equal((await request("/api/auth/external/register", { jar, method:"POST",input })).status,409);
    });
    await t.test("explicit linking is session-bound and survives a replica change", async () => {
      const { url } = await json(await request("/api/auth/connections/google", { jar:owner,method:"POST",input:{} }));
      assert.equal((await request(url)).status,400);
      const link = new URL(url, origin).searchParams.get("link");
      const { result } = await oauth("google", profile, owner, link);
      assert.match(result.headers.get("location"), /\/settings\/profile\?connected=google$/);
      assert.equal((await request(url, { jar:owner })).status,400,"link intent must be single-use");
      const connections = await json(await request("/api/auth/connections",{ jar:owner }));
      assert.deepEqual(connections.map(x=>x.provider),["google"]);
    });
    let googleLogin;
    await t.test("linked sign-in retains the existing user, role and tenant", async () => {
      googleLogin = await oauth("google", profile);
      assert.match(googleLogin.result.headers.get("location"), /\/dashboard$/);
      const session = await json(await request("/api/auth/session",{jar:googleLogin.jar}));
      assert.equal(session.user.id,local.user.id);
      assert.equal(session.user.role,local.user.role);
      assert.equal(session.user.organizationId,local.user.organizationId);
    });
    await t.test("invalid state, missing correlation and callback replay do not issue sessions", async () => {
      const invalid = await request("/api/auth/callback/google?code=invalid&state=invalid");
      assert.match(invalid.headers.get("location"), /oauth_error=/);
      const replay = await request(googleLogin.callback.pathname + googleLogin.callback.search);
      assert.match(replay.headers.get("location"), /oauth_error=/);
      assert.equal(replay.headers.getSetCookie().some(x=>x.startsWith("tranzora_session=")),false);
    });
    await t.test("Microsoft enrollment creates a workspace once, with a backup password", async () => {
      const ms = await oauth("microsoft", { id:`ms-${suffix}`,name:"Microsoft Test",email:`ms-${suffix}@example.test` });
      assert.match(ms.result.headers.get("location"), /\/register\?external=microsoft$/);
      const enrollmentCookie = ms.jar.header();
      const info = await json(await request("/api/auth/external/enrollment",{jar:ms.jar}));
      assert.equal(info.provider,"microsoft");
      const enrollmentInput = {...input,email:info.email};
      const registration = await json(await request("/api/auth/external/register",{jar:ms.jar,method:"POST",input:enrollmentInput}),201);
      assert.equal(registration.user.role,"Business Admin");
      const replayJar = new Jar();
      for (const pair of enrollmentCookie.split("; ")) { const i=pair.indexOf("="); replayJar.values.set(pair.slice(0,i),pair.slice(i+1)); }
      assert.equal((await request("/api/auth/external/register",{jar:replayJar,method:"POST",input:enrollmentInput})).status,400);
      const login = await oauth("microsoft", { id:`ms-${suffix}`,name:"Changed Name",email:"changed@example.test" });
      const session = await json(await request("/api/auth/session",{jar:login.jar}));
      assert.equal(session.user.id,registration.user.id,"stable provider ID, not mutable email, determines identity");
      const backup = await json(await request("/api/auth/login",{method:"POST",input:{email:info.email,password}}));
      assert.equal(backup.user.id,registration.user.id);
    });
    await t.test("disconnect revokes other sessions and removes provider access", async () => {
      await json(await request("/api/auth/connections/google",{jar:owner,method:"DELETE"}));
      assert.equal((await request("/api/auth/session",{jar:googleLogin.jar})).status,401);
      assert.equal((await json(await request("/api/auth/connections",{jar:owner}))).length,0);
    });
    await t.test("provider sign-in preserves all staff roles and their home destinations", async () => {
      const create = async (resource, input) => json(await request(`/api/v1/${resource}`, { jar:owner,method:"POST",input }),201);
      for (const role of ["Business Admin","Manager","Accountant","Dispatcher","Driver","Support Staff","Viewer"]) {
        const id = randomUUID();
        const email = `staff-${id}@example.test`;
        const driver = role === "Driver" ? await create("drivers", { name:"OAuth Driver",reference:`O-${id}`,phone:"+8801700000001",licenseNumber:`L-${id}`,licenseExpiry:"2035-01-01" }) : null;
        const user = await create("users", { name:`OAuth ${role}`,email,phone:"",password,role,...(driver ? {driverId:driver.id} : {}) });
        const jar = new Jar();
        await json(await request("/api/auth/login",{jar,method:"POST",input:{email,password}}));
        const { url } = await json(await request("/api/auth/connections/google",{jar,method:"POST",input:{}}));
        const profile = {id,name:`OAuth ${role}`,email};
        await oauth("google",profile,jar,new URL(url,origin).searchParams.get("link"));
        const login = await oauth("google",profile);
        const session = await json(await request("/api/auth/session",{jar:login.jar}));
        assert.equal(session.user.id,user.id);
        assert.equal(session.user.role,role);
        assert.equal(session.user.organizationId,local.user.organizationId);
        const home = role === "Driver" ? "/driver" : role === "Support Staff" ? "/help-support" : "/dashboard";
        assert.equal(new URL(login.result.headers.get("location")).pathname,home);
      }
    });
    assert.ok(pkceChecks >= 5, "both providers must verify PKCE at the token endpoint");
  } catch (error) {
    t.diagnostic(logs.slice(-10).join("\n"));
    throw error;
  } finally {
    for (const child of children) child.kill();
    await new Promise(done => mock.close(done));
  }
});

test("unsafe external authentication configuration fails closed", { timeout: 90000 }, async () => {
  for (const invalid of [
    { Authentication__TestProviderBaseUrl:"http://127.0.0.1:5095" },
    { App__PublicOrigin:"http://public.example.test",App__SecureCookies:"false" },
    { Authentication__google__ClientId:"only-half-configured" },
    { App__PublicOrigin:"https://public.example.test",Authentication__google__ClientId:"configured",Authentication__google__ClientSecret:"configured" },
  ]) {
    const child = spawn("dotnet",[resolve("backend/Tranzora.Api/bin/Debug/net10.0/Tranzora.Api.dll")],{
      env:{...process.env,ASPNETCORE_ENVIRONMENT:"Production",App__PublicOrigin:"http://localhost:5082",App__SecureCookies:"true",...invalid},
      windowsHide:true,stdio:["ignore","pipe","pipe"],
    });
    let output="";
    child.stdout.on("data",x=>output+=x); child.stderr.on("data",x=>output+=x);
    const timer=setTimeout(()=>child.kill(),20000);
    const code=await new Promise(done=>child.on("exit",done));
    clearTimeout(timer);
    assert.notEqual(code,0);
    assert.match(output,/InvalidOperationException/);
  }
});
