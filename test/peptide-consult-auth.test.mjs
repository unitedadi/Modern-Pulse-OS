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

function fixture({ key = "server-secret", signedIn = true, bookingStatus = 201 } = {}) {
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
    exports, URLSearchParams,
    process: { env: { PULSE_ADMIN_API_KEY: key } },
    require: (name) => {
      if (name === "next/server") return { NextResponse: Response };
      if (name === "../backend") return backend;
      throw new Error(`Unexpected import: ${name}`);
    },
    fetch: async (url, init) => {
      calls.push({ url, ...init });
      if (url.includes("/doctors?")) return Response.json({ items: [{ doctor_id: "doctor_peptide", track_keys: ["peptides"] }] });
      if (url.includes("/slots?")) return Response.json({ slots: [{ slot_start: "2026-10-01T10:00:00+04:00" }] });
      if (url.endsWith("/catalog")) return Response.json({ peptide_consultation: { commission_bps: 1500, promo_code: "PARTNER" } });
      if (url.endsWith("/consultations")) return Response.json(
        bookingStatus === 201 ? { consultation: { consultation_id: "synthetic" } } : { error: "slot_no_longer_available" },
        { status: bookingStatus },
      );
      throw new Error(`Unexpected fetch: ${url}`);
    },
  });
  return { route: exports, calls };
}

function bookingRequest() {
  return new Request("https://pulse.invalid/api/pulse/peptide-consult", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer partner-token" },
    body: JSON.stringify({
      doctorId: "doctor_peptide", slotStart: "2026-10-01T10:00:00+04:00",
      customer: { name: "Test Member", email: "test@example.com", phone: "+971500000001" },
      sellerId: "untrusted_seller",
    }),
  });
}

test("doctor and slot reads carry the server credential", async () => {
  const { route, calls } = fixture();
  const response = await route.GET(new Request("https://pulse.invalid/api/pulse/peptide-consult"));
  assert.equal(response.status, 200);
  assert.equal(calls.length, 2);
  for (const call of calls) assert.equal(call.headers.Authorization, "Bearer server-secret");
  assert.equal((await response.json()).slots[0].doctor_id, "doctor_peptide");
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
  assert.ok(!(await response.text()).includes("server-secret"));
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
