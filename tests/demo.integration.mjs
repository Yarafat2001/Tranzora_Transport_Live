import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";

const base = process.env.TEST_API_URL ?? "http://localhost:5080";
const password = process.env.DEMO_TEST_PASSWORD ?? "TranzoraDemo2026!";
const accounts = [
  ["Super Admin", "superadmin"],
  ["Business Admin", "admin"],
  ["Manager", "manager"],
  ["Accountant", "accountant"],
  ["Dispatcher", "dispatcher"],
  ["Driver", "driver"],
  ["Support Staff", "support"],
  ["Viewer", "viewer"],
];
const expected = {
  customers: 12,
  suppliers: 4,
  drivers: 6,
  vehicles: 8,
  bookings: 18,
  trips: 12,
  invoices: 10,
  payments: 8,
  fuel: 12,
  expenses: 12,
  income: 6,
  maintenance: 6,
  documents: 10,
  notifications: 12,
  support: 4,
};

async function request(path, cookie, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    signal: AbortSignal.timeout(20000),
    headers: {
      "Content-Type": "application/json",
      "X-Tranzora-Request": "1",
      ...(cookie ? { Cookie: cookie } : {}),
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => null);
  return { response, body };
}

test(
  "seeded demo accounts and operational data",
  { timeout: 120000 },
  async (t) => {
    const cookies = new Map();
    for (const [role, local] of accounts) {
      await t.test(`${role} can sign in with the correct role`, async () => {
        const result = await request("/api/auth/login", null, {
          method: "POST",
          body: JSON.stringify({
            email: `${local}@demo.tranzora.test`,
            password,
          }),
        });
        assert.equal(result.response.status, 200, JSON.stringify(result.body));
        assert.equal(result.body.user.role, role);
        const cookie = result.response.headers
          .getSetCookie()
          .find((value) => value.startsWith("tranzora_session="))
          ?.split(";")[0];
        assert.ok(cookie);
        cookies.set(role, cookie);
        const session = await request("/api/auth/session", cookie);
        assert.equal(
          session.body.user.organizationId,
          "d368724b-c112-4b79-b865-a5b45cfb6982",
        );
        assert.equal(
          (await request("/api/v1/profile", cookie)).response.status,
          200,
        );
      });
    }
    const owner = cookies.get("Super Admin");
    const rows = new Map();
    await t.test(
      "every supported module has persistent demo records",
      async () => {
        for (const [resource, count] of Object.entries(expected)) {
          const result = await request(
            `/api/v1/${resource}?pageSize=100`,
            owner,
          );
          assert.equal(
            result.response.status,
            200,
            `${resource}: ${JSON.stringify(result.body)}`,
          );
          assert.equal(result.body.totalCount, count, resource);
          assert.equal(result.body.items.length, count, resource);
          assert.equal(
            new Set(result.body.items.map((row) => row.reference)).size,
            count,
            resource,
          );
          rows.set(resource, result.body.items);
        }
        const users = await request("/api/v1/users?pageSize=100", owner);
        assert.equal(users.body.totalCount, 8);
        assert.equal(
          new Set(users.body.items.map((user) => user.role)).size,
          8,
        );
        assert.ok(users.body.items.every((user) => !("passwordHash" in user)));
      },
    );
    await t.test(
      "trip, customer, vehicle and invoice relationships are consistent",
      () => {
        for (const trip of rows.get("trips")) {
          assert.ok(
            rows.get("bookings").some((row) => row.id === trip.bookingId),
          );
          assert.ok(
            rows.get("vehicles").some((row) => row.id === trip.vehicleId),
          );
          assert.ok(
            rows.get("drivers").some((row) => row.id === trip.driverId),
          );
        }
        for (const invoice of rows.get("invoices")) {
          const trip = rows
            .get("trips")
            .find((row) => row.id === invoice.tripId);
          assert.ok(trip);
          assert.equal(
            rows.get("bookings").find((row) => row.id === trip.bookingId)
              .customerId,
            invoice.customerId,
          );
          const paid = rows
            .get("payments")
            .filter((row) => row.invoiceId === invoice.id)
            .reduce((sum, row) => sum + row.amount, 0);
          assert.ok(paid <= invoice.amount);
        }
      },
    );
    await t.test(
      "dashboard totals match the seeded financial records",
      async () => {
        const result = await request("/api/v1/dashboard", owner);
        assert.equal(result.response.status, 200);
        assert.deepEqual(result.body, {
          currency: "BDT",
          receipts: 160250,
          expenses: 104390,
          cashSurplus: 55860,
          outstanding: 82500,
          vehicles: 8,
          drivers: 6,
          customers: 12,
          bookings: 18,
          activeTrips: rows.get("trips").filter(row => row.status === "InProgress").length,
          completedTrips: rows.get("trips").filter(row => row.status === "Completed").length,
        });
      },
    );
    await t.test("role permissions apply to demo users", async () => {
      assert.equal(
        (await request("/api/v1/customers", cookies.get("Viewer"))).response
          .status,
        200,
      );
      assert.equal(
        (await request("/api/v1/users", cookies.get("Manager"))).response
          .status,
        403,
      );
      assert.equal(
        (await request("/api/v1/invoices", cookies.get("Accountant"))).response
          .status,
        200,
      );
      assert.equal(
        (await request("/api/v1/bookings", cookies.get("Dispatcher"))).response
          .status,
        200,
      );
      assert.equal(
        (await request("/api/v1/support", cookies.get("Support Staff")))
          .response.status,
        200,
      );
      assert.equal(
        (await request("/api/v1/users", cookies.get("Driver"))).response.status,
        403,
      );
      const forbidden = await request(
        "/api/v1/customers",
        cookies.get("Viewer"),
        {
          method: "POST",
          headers: { "Idempotency-Key": randomUUID() },
          body: JSON.stringify({
            name: "Forbidden demo mutation",
            reference: "FORBIDDEN-DEMO",
            phone: "+8801700000000",
          }),
        },
      );
      assert.equal(forbidden.response.status, 403);
    });
    for (const cookie of cookies.values())
      await request("/api/auth/logout", cookie, { method: "POST", body: "{}" });
  },
);
