import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";

const base = process.env.TEST_API_URL ?? "http://localhost:5080";
const suffix = randomUUID().slice(0, 8);
const password = "Driver-Workspace-Test-2026";
async function request(path, cookie, method = "GET", input, version, key = randomUUID()) {
  const response = await fetch(`${base}/api/${path}`, { method, signal: AbortSignal.timeout(20000), headers: {
    "X-Tranzora-Request": "1", "Content-Type": "application/json", "Idempotency-Key": key,
    ...(cookie ? { Cookie: cookie } : {}), ...(version ? { "If-Match": `"${version}"` } : {}),
  }, body: input === undefined ? undefined : JSON.stringify(input) });
  return { status: response.status, body: await response.json().catch(() => null), cookie: response.headers.getSetCookie().find(value => value.startsWith("tranzora_session="))?.split(";")[0] };
}

test("driver workspace isolates assignments and protects trip transitions", { timeout: 90000 }, async () => {
  const owner = await request("auth/register", null, "POST", { name: "Driver test owner", company: "Driver workspace tests", email: `owner-${suffix}@example.test`, phone: "+8801700000000", password });
  assert.equal(owner.status, 201, JSON.stringify(owner.body));
  const create = async (resource, input) => {
    const result = await request(`v1/${resource}`, owner.cookie, "POST", input);
    assert.equal(result.status, 201, JSON.stringify(result.body)); return result.body;
  };
  const customer = await create("customers", { name: "Test customer", reference: "DR-C", phone: "+8801700000001" });
  const drivers = [], trips = [], vehicles = [];
  for (let index = 0; index < 2; index++) {
    const driver = await create("drivers", { name: `Driver ${index}`, reference: `DR-D-${index}`, phone: "+8801700000001", licenseNumber: `LICENSE-${index}`, licenseExpiry: "2035-01-01" });
    const vehicle = await create("vehicles", { name: `Vehicle ${index}`, reference: `DR-V-${index}`, registrationNumber: `DR-REG-${index}`, vehicleType: "Truck", capacity: 10 });
    const booking = await create("bookings", { name: `Booking ${index}`, reference: `DR-B-${index}`, customerId: customer.id, origin: "Dhaka", destination: "Sylhet", amount: 25000, scheduledDate: new Date().toISOString().slice(0, 10) });
    const trip = await create("trips", { name: `Trip ${index}`, reference: `DR-T-${index}`, bookingId: booking.id, driverId: driver.id, vehicleId: vehicle.id, startsAt: new Date(Date.now() - 3600000).toISOString(), endsAt: new Date(Date.now() + 7200000).toISOString() });
    drivers.push(driver); vehicles.push(vehicle); trips.push(trip);
  }
  await create("users", { name: "Assigned driver", email: `driver-${suffix}@example.test`, phone: "", password, role: "Driver", driverId: drivers[0].id });
  const login = await request("auth/login", null, "POST", { email: `driver-${suffix}@example.test`, password });
  assert.equal(login.status, 200);
  const driverCookie = login.cookie;
  const overview = await request("v1/driver", driverCookie);
  assert.equal(overview.status, 200, JSON.stringify(overview.body));
  assert.equal(overview.body.profile.id, drivers[0].id);
  assert.equal(overview.body.scheduled, 1);
  assert.deepEqual(overview.body.vehicles.map(row => row.id), [vehicles[0].id]);
  const list = await request("v1/driver/trips?pageSize=1", driverCookie);
  assert.equal(list.status, 200, JSON.stringify(list.body));
  assert.equal(list.body.totalCount, 1);
  assert.equal(list.body.items[0].id, trips[0].id);
  assert.equal("amount" in list.body.items[0], false);
  assert.equal((await request("v1/driver/trips?pageSize=101", driverCookie)).status, 400);
  assert.equal((await request("v1/trips", driverCookie)).status, 403);
  assert.equal((await request("v1/invoices", driverCookie)).status, 403);
  assert.equal((await request(`v1/driver/trips/${trips[1].id}`, driverCookie, "PUT", { status: "InProgress" }, 1)).status, 404);
  assert.equal((await request("v1/driver", owner.cookie)).status, 403);
  const key = randomUUID();
  const start = await request(`v1/driver/trips/${trips[0].id}`, driverCookie, "PUT", { status: "InProgress" }, 1, key);
  assert.equal(start.status, 200, JSON.stringify(start.body));
  assert.equal(start.body.version, 2);
  const replay = await request(`v1/driver/trips/${trips[0].id}`, driverCookie, "PUT", { status: "InProgress" }, 1, key);
  assert.equal(replay.status, 200); assert.equal(replay.body.version, 2);
  assert.equal((await request(`v1/driver/trips/${trips[0].id}`, driverCookie, "PUT", { status: "Scheduled" }, 2)).status, 409);
  assert.equal((await request(`v1/driver/trips/${trips[0].id}`, driverCookie, "PUT", { status: "Completed" }, 1)).status, 412);
  const completed = await request(`v1/driver/trips/${trips[0].id}`, driverCookie, "PUT", { status: "Completed" }, 2);
  assert.equal(completed.status, 200); assert.equal(completed.body.status, "Completed");
  const audits = await request("v1/audit-logs?pageSize=100", owner.cookie);
  assert.equal(audits.body.items.filter(row => row.recordId === trips[0].id && row.action === "driver-start").length, 1);
  await request("auth/logout", driverCookie, "POST", {});
  await request("auth/logout", owner.cookie, "POST", {});
});
