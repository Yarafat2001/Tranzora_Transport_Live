import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";

const bases = (
  process.env.TEST_API_URLS ??
  process.env.TEST_API_URL ??
  "http://localhost:5080"
).split(",");
let nextServer = 0;
const password = "Integration-Test-Password-93";
const suffix = randomUUID().slice(0, 8);

async function request(
  path,
  { method = "GET", input, cookie, key, version, csrf = true } = {},
) {
  const response = await fetch(`${bases[nextServer++ % bases.length]}${path}`, {
    method,
    redirect: "manual",
    signal: AbortSignal.timeout(30000),
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(input !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(csrf ? { "X-Tranzora-Request": "1" } : {}),
      ...(key ? { "Idempotency-Key": key } : {}),
      ...(version ? { "If-Match": `"${version}"` } : {}),
    },
    body: input === undefined ? undefined : JSON.stringify(input),
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return {
    status: response.status,
    body,
    headers: response.headers,
    cookie: response.headers
      .getSetCookie()
      .find((value) => value.startsWith("tranzora_session="))
      ?.split(";")[0],
  };
}
async function register(tag) {
  const result = await request("/api/auth/register", {
    method: "POST",
    input: {
      name: `Test ${tag}`,
      email: `${tag}-${suffix}@example.test`,
      company: `Integration ${suffix}`,
      phone: "+8801700000000",
      password,
    },
  });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal(result.body.user.role, "Business Admin", "Sign-up owners must not get Super Admin.");
  assert.ok(result.cookie);
  return result;
}

test(
  "PostgreSQL API workflows and safety guarantees",
  { timeout: 180000 },
  async (t) => {
    assert.equal(
      (await request("/health/ready")).status,
      200,
      "Apply migrations and start the API first.",
    );
    const owner = await register("owner");
    const other = await register("other");
    const cookie = owner.cookie;
    const create = async (resource, input, key = randomUUID()) => {
      const result = await request(`/api/v1/${resource}`, {
        cookie,
        method: "POST",
        input,
        key,
      });
      assert.equal(result.status, 201, JSON.stringify(result.body));
      return result.body;
    };
    let customer, vehicle, driver, booking, trip, invoice;

    await t.test("health diagnostics hide queue counts from anonymous callers", async () => {
      const publicHealth = await request("/health/ready");
      assert.equal(publicHealth.status, 200);
      assert.equal(publicHealth.body.outbox, null);
      const privateHealth = await request("/health/ready", { cookie });
      assert.equal(privateHealth.status, 200);
      assert.equal(typeof privateHealth.body.outbox.pending, "number");
      assert.equal(typeof privateHealth.body.outbox.exhausted, "number");
    });
    await t.test("authentication and CSRF", async () => {
      assert.equal((await request("/api/v1/customers")).status, 401);
      assert.equal(
        (
          await request("/api/auth/login", {
            method: "POST",
            csrf: false,
            input: { email: `owner-${suffix}@example.test`, password },
          })
        ).status,
        403,
      );
      const login = await request("/api/auth/login", {
        method: "POST",
        input: { email: `owner-${suffix}@example.test`, password },
      });
      assert.equal(login.status, 200);
      assert.ok(login.cookie);
      assert.equal(
        (await request("/api/auth/session", { cookie })).body.user
          .organizationId,
        owner.body.user.organizationId,
      );
    });
    await t.test(
      "parallel idempotent creation replays exactly one mutation",
      async () => {
        const key = randomUUID();
        const input = {
          name: "Customer One",
          reference: `CUS-${suffix}`,
          phone: "+8801700000001",
        };
        const results = await Promise.all(
          Array.from({ length: 4 }, () =>
            request("/api/v1/customers", {
              cookie,
              method: "POST",
              key,
              input,
            }),
          ),
        );
        for (const result of results)
          assert.equal(result.status, 201, JSON.stringify(result.body));
        assert.equal(new Set(results.map((result) => result.body.id)).size, 1);
        assert.equal(
          results.filter(
            (result) => result.headers.get("idempotency-replayed") === "true",
          ).length,
          3,
        );
        customer = results[0].body;
        assert.equal(
          (
            await request("/api/v1/customers", {
              cookie,
              method: "POST",
              key,
              input: { ...input, name: "Different" },
            })
          ).status,
          409,
        );
        assert.equal(
          (await request("/api/v1/customers", { cookie })).body.totalCount,
          1,
        );
      },
    );
    await t.test(
      "pagination, sorting, filtering, and index-backed uniqueness",
      async () => {
        await create("customers", {
          name: "Customer Two",
          reference: `CUS2-${suffix}`,
          phone: "+8801700000002",
        });
        const page1 = await request("/api/v1/customers?page=1&pageSize=1", {
          cookie,
        });
        const page2 = await request("/api/v1/customers?page=2&pageSize=1", {
          cookie,
        });
        assert.equal(page1.body.totalCount, 2);
        assert.equal(page1.body.items.length, 1);
        assert.notEqual(page1.body.items[0].id, page2.body.items[0].id);
        assert.equal(
          (await request("/api/v1/customers?search=Customer%20One", { cookie }))
            .body.totalCount,
          1,
        );
        assert.equal(
          (await request("/api/v1/customers?pageSize=101", { cookie })).status,
          400,
        );
        assert.equal(
          (
            await request("/api/v1/customers", {
              cookie,
              method: "POST",
              key: randomUUID(),
              input: {
                name: "Duplicate",
                reference: customer.reference,
                phone: "+8801700000000",
              },
            })
          ).status,
          409,
        );
      },
    );
    await t.test(
      "tenant isolation is enforced on reads and foreign keys",
      async () => {
        assert.equal(
          (await request("/api/v1/customers", { cookie: other.cookie })).body
            .totalCount,
          0,
        );
        assert.equal(
          (
            await request(`/api/v1/customers/${customer.id}`, {
              cookie: other.cookie,
            })
          ).status,
          404,
        );
        assert.equal(
          (
            await request("/api/v1/bookings", {
              cookie: other.cookie,
              method: "POST",
              key: randomUUID(),
              input: {
                name: "Cross tenant",
                reference: "CROSS",
                customerId: customer.id,
                origin: "Dhaka",
                destination: "Sylhet",
                amount: 100,
                scheduledDate: "2027-01-01",
              },
            })
          ).status,
          422,
        );
        assert.equal(
          (await request("/api/v1/bookings", { cookie: other.cookie })).body
            .totalCount,
          0,
        );
      },
    );
    await t.test(
      "optimistic concurrency rejects lost updates and cache revision changes",
      async () => {
        const updated = await request(`/api/v1/customers/${customer.id}`, {
          cookie,
          method: "PUT",
          key: randomUUID(),
          version: customer.version,
          input: { name: "Updated Customer" },
        });
        assert.equal(updated.status, 200, JSON.stringify(updated.body));
        assert.equal(updated.body.version, 2);
        assert.equal(
          (
            await request(`/api/v1/customers/${customer.id}`, {
              cookie,
              method: "PUT",
              key: randomUUID(),
              version: 1,
              input: { name: "Stale edit" },
            })
          ).status,
          412,
        );
        assert.equal(
          (
            await request(`/api/v1/customers/${customer.id}`, {
              cookie,
              method: "PUT",
              key: randomUUID(),
              input: { name: "No version" },
            })
          ).status,
          428,
        );
        assert.equal(
          (await request("/api/v1/customers?search=Updated", { cookie })).body
            .items[0].name,
          "Updated Customer",
        );
        customer = updated.body;
      },
    );
    await t.test(
      "relational trip creation and overlapping assignments",
      async () => {
        vehicle = await create("vehicles", {
          name: "Truck One",
          reference: `V-${suffix}`,
          registrationNumber: `DHA-${suffix}`,
          vehicleType: "Truck",
          capacity: 10,
          odometer: 0,
        });
        driver = await create("drivers", {
          name: "Driver One",
          reference: `D-${suffix}`,
          phone: "+8801700000003",
          licenseNumber: `DL-${suffix}`,
          licenseExpiry: "2030-01-01",
        });
        booking = await create("bookings", {
          name: "Booking One",
          reference: `B-${suffix}`,
          customerId: customer.id,
          origin: "Dhaka",
          destination: "Sylhet",
          amount: 100,
          scheduledDate: "2027-01-01",
        });
        const input = {
          name: "Trip One",
          reference: `T-${suffix}`,
          bookingId: booking.id,
          vehicleId: vehicle.id,
          driverId: driver.id,
          startsAt: "2027-01-01T08:00:00Z",
          endsAt: "2027-01-01T18:00:00Z",
        };
        trip = await create("trips", input);
        assert.equal(
          (
            await request("/api/v1/trips", {
              cookie,
              method: "POST",
              key: randomUUID(),
              input: { ...input, reference: `T2-${suffix}` },
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await request(`/api/v1/vehicles/${vehicle.id}`, {
              cookie,
              method: "DELETE",
              key: randomUUID(),
              version: vehicle.version,
            })
          ).status,
          409,
        );
      },
    );
    await t.test(
      "invoice payments are atomic, bounded, immutable, and included once in totals",
      async () => {
        invoice = await create("invoices", {
          name: "Invoice One",
          reference: `INV-${suffix}`,
          customerId: customer.id,
          tripId: trip.id,
          amount: 100,
          dueDate: "2027-01-10",
          status: "Issued",
        });
        const paymentKey = randomUUID();
        const input = {
          name: "Payment One",
          reference: `PAY-${suffix}`,
          invoiceId: invoice.id,
          amount: 70,
          method: "Bank",
          recordDate: "2027-01-02",
        };
        const first = await request("/api/v1/payments", {
          cookie,
          method: "POST",
          key: paymentKey,
          input,
        });
        assert.equal(first.status, 201, JSON.stringify(first.body));
        const replay = await request("/api/v1/payments", {
          cookie,
          method: "POST",
          key: paymentKey,
          input,
        });
        assert.equal(replay.body.id, first.body.id);
        const racing = await Promise.all(
          [1, 2].map((index) =>
            request("/api/v1/payments", {
              cookie,
              method: "POST",
              key: randomUUID(),
              input: {
                ...input,
                name: `Race ${index}`,
                reference: `RACE-${index}-${suffix}`,
                amount: 20,
              },
            }),
          ),
        );
        assert.deepEqual(
          racing.map((result) => result.status).sort(),
          [201, 409],
        );
        const totals = await request("/api/v1/dashboard", { cookie });
        assert.equal(totals.body.receipts, 90);
        assert.equal(totals.body.outstanding, 10);
        assert.equal(
          (
            await request(`/api/v1/payments/${first.body.id}`, {
              cookie,
              method: "DELETE",
              key: randomUUID(),
              version: 1,
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await request(`/api/v1/invoices/${invoice.id}`, {
              cookie,
              method: "PUT",
              key: randomUUID(),
              version: 1,
              input: { amount: 200 },
            })
          ).status,
          409,
        );
      },
    );
    await t.test(
      "failed requests roll back and audit contains one entry per successful command",
      async () => {
        const audit = await request("/api/v1/audit-logs?pageSize=100", {
          cookie,
        });
        assert.equal(audit.status, 200, JSON.stringify(audit.body));
        assert.equal(
          audit.body.items.filter(
            (row) =>
              row.resource === "customers" &&
              row.recordId === customer.id &&
              row.action === "create",
          ).length,
          1,
        );
        assert.equal(
          (await request("/api/v1/payments", { cookie })).body.totalCount,
          2,
        );
      },
    );
    await t.test(
      "server-side roles reject viewer writes, even with direct API calls",
      async () => {
        await create("users", {
          name: "Viewer",
          email: `viewer-${suffix}@example.test`,
          phone: "",
          role: "Viewer",
          password,
        });
        const login = await request("/api/auth/login", {
          method: "POST",
          input: { email: `viewer-${suffix}@example.test`, password },
        });
        assert.equal(login.status, 200);
        assert.equal(
          (await request("/api/v1/customers", { cookie: login.cookie })).status,
          200,
        );
        assert.equal(
          (
            await request("/api/v1/customers", {
              cookie: login.cookie,
              method: "POST",
              key: randomUUID(),
              input: {
                name: "Forbidden",
                reference: "FORBIDDEN",
                phone: "0123456789",
              },
            })
          ).status,
          403,
        );
        assert.equal(
          (await request("/api/v1/users", { cookie: login.cookie })).status,
          403,
        );
      },
    );
    await t.test("logout invalidates the database session", async () => {
      assert.equal(
        (
          await request("/api/auth/logout", {
            cookie,
            method: "POST",
            input: {},
          })
        ).status,
        200,
      );
      assert.equal(
        (await request("/api/auth/session", { cookie })).status,
        401,
      );
    });
  },
);
