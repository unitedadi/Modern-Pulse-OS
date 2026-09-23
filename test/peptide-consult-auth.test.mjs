import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Exercise the real route without Next's server or live booking side effects.
const source = readFileSync(new URL("../src/app/api/pulse/peptide-consult/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture({ key = "server-secret", signedIn = true, bookingStatus = 201, bookingError = "slot_no_longer_available", ownedCustomer = true, lookupCustomerId = "customer", members = [{ patient_id: "existing_member", name: "Member" }] } = {}) {
  const calls = [];
  const exports = {};
  const backend = {
    resolvePartnerContext: async () => signedIn
      ? { context: { seller_id: "seller_partner", seller: { display_name: "Partner" } } }
      : { response: Response.json({ error: "missing_clerk_token" }, { status: 401 }) },
    backendUrl: (path) => `https://backend.invalid${path}`,
    sellerUrl: (seller, path) => `https://backend.invalid/ops/sellers/${seller}${path}`,
    readJson: (response) => response.json(),
    backendError: (payload, fallback) => payload?.error ?? fallback,
  };
  runInNewContext(compiled, {
    exports, URL, URLSearchParams,
    process: { env: { PULSE_ADMIN_API_KEY: key } },
    require: (name) => {
      if (name === "next/server") return { NextResponse: Response };
      if (name === "../backend") return backend;
      throw new Error(`Unexpected import: ${name}`);
    },
    fetch: async (url, init) => {
      calls.push({ url, ...init });
      if (url.includes("/customers?")) return Response.json({ items: ownedCustomer ? [{ customer_id: "customer", phone: "+971500000001" }] : [] });
      if (url.includes("/quickwlp/customer?")) return Response.json({ customer: { customer_id: lookupCustomerId }, patients: members });
      if (url.includes("/doctors?")) return Response.json({ items: [{ doctor_id: "doctor_peptide", track_keys: ["peptides"] }] });
      if (url.includes("/slots?")) return Response.json({ slots: [{ slot_start: "2026-10-01T10:00:00+04:00" }] });
      if (url.endsWith("/catalog")) return Response.json({ peptide_consultation: { commission_bps: 1500, promo_code: "PARTNER" } });
      if (url.endsWith("/consultations")) return Response.json(
        bookingStatus === 201 ? { consultation: { consultation_id: "synthetic" } } : { error: bookingError },
        { status: bookingStatus },
      );
      throw new Error(`Unexpected fetch: ${url}`);
    },
  });
  return { route: exports, calls };
}

function bookingRequest(patientId = "existing_member") {
  return new Request("https://pulse.invalid/api/pulse/peptide-consult", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer partner-token" },
    body: JSON.stringify({
      doctorId: "doctor_peptide", slotStart: "2026-10-01T10:00:00+04:00",
      patientId,
      customer: { name: "Test Member", email: "test@example.com", phone: "+971500000001" },
      sellerId: "untrusted_seller",
    }),
  });
}

test("doctor and slot reads carry the server credential", async () => {
  const { route, calls } = fixture();
  const response = await route.GET(new Request("https://pulse.invalid/api/pulse/peptide-consult?customerId=customer"));
  assert.equal(response.status, 200);
  assert.equal(calls.length, 4);
  for (const call of calls) assert.equal(call.headers.Authorization, "Bearer server-secret");
  assert.equal((await response.json()).slots[0].doctor_id, "doctor_peptide");
});

test("member choices come from the consultation directory, including members absent from the seller list", async () => {
  const members = [{ patient_id: "legacy_directory_member", name: "Existing Member" }];
  const { route } = fixture({ members });
  const response = await route.GET(new Request("https://pulse.invalid/api/pulse/peptide-consult?customerId=customer"));
  assert.deepEqual((await response.json()).members, members);
});

test("member lookup rejects customers outside the authenticated partner", async () => {
  const { route, calls } = fixture({ ownedCustomer: false });
  assert.equal((await route.GET(new Request("https://pulse.invalid/api/pulse/peptide-consult?customerId=other"))).status, 404);
  assert.equal(calls.length, 1);
});

test("member lookup fails closed when the phone resolves to a different customer", async () => {
  const { route, calls } = fixture({ lookupCustomerId: "other" });
  const response = await route.GET(new Request("https://pulse.invalid/api/pulse/peptide-consult?customerId=customer"));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, "customer_identity_mismatch");
  assert.equal(calls.length, 2);
});

test("member lookup requires a customer before any backend request", async () => {
  const { route, calls } = fixture();
  assert.equal((await route.GET(new Request("https://pulse.invalid/api/pulse/peptide-consult"))).status, 400);
  assert.equal(calls.length, 0);
});

test("booking authenticates and preserves server-resolved partner attribution and promo", async () => {
  const { route, calls } = fixture();
  const response = await route.POST(bookingRequest());
  assert.equal(response.status, 201);
  assert.equal(calls.length, 2);
  for (const call of calls) assert.equal(call.headers.Authorization, "Bearer server-secret");
  assert.equal(calls[1].url, "https://backend.invalid/doctor/quickwlp/admin/consultations");
  const body = JSON.parse(calls[1].body);
  assert.equal(body.b2b_partner_id, "seller_partner");
  assert.equal(body.b2b_commission_bps, 1500);
  assert.equal(body.b2b_promo_code, "PARTNER");
  assert.equal(body.track_key, "peptides");
  assert.equal(body.patient_id, "existing_member");
  assert.ok(!(await response.text()).includes("server-secret"));
});

test("the selected family member is sent instead of inferring a patient from customer details", async () => {
  const { route, calls } = fixture();
  assert.equal((await route.POST(bookingRequest("second_member"))).status, 201);
  assert.equal(JSON.parse(calls[1].body).patient_id, "second_member");
});

for (const patientId of ["", " ", null, 42]) {
  test(`missing or invalid member selection (${JSON.stringify(patientId)}) never starts a booking`, async () => {
    const { route, calls } = fixture();
    const response = await route.POST(bookingRequest(patientId));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, "patient_selection_required");
    assert.equal(calls.length, 0);
  });
}

test("backend patient ownership rejection is preserved without retry or creating another member", async () => {
  const { route, calls } = fixture({ bookingStatus: 409, bookingError: "patient_not_found" });
  const response = await route.POST(bookingRequest("unrelated_member"));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, "patient_not_found");
  assert.equal(calls.filter((call) => call.method === "POST").length, 1);
});

for (const method of ["GET", "POST"]) {
  test(`${method} rejects signed-out callers before using the server credential`, async () => {
    const { route, calls } = fixture({ signedIn: false });
    assert.equal((await route[method](bookingRequest())).status, 401);
    assert.equal(calls.length, 0);
  });

  test(`${method} fails closed when the server credential is missing`, async () => {
    const { route, calls } = fixture({ key: " " });
    const response = await route[method](bookingRequest());
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, "peptide_consult_auth_not_configured");
    assert.equal(calls.length, 0);
  });
}

test("booking conflicts remain conflicts and are not retried", async () => {
  const { route, calls } = fixture({ bookingStatus: 409 });
  const response = await route.POST(bookingRequest());
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, "slot_no_longer_available");
  assert.equal(calls.filter((call) => call.method === "POST").length, 1);
});
