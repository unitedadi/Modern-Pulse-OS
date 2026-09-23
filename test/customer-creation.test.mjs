import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../src/app/api/pulse/customers/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const input = { name: "New Member", email: "test@example.com", phone: "0501234567", dateOfBirth: "1990-02-15", gender: "Male" };
const customer = { customer_id: "customer", full_name: "Account", phone: "+971501234567" };

function fixture({ existing = false, members = [], key = "server-secret", signedIn = true, lookupFails = false, mismatch = false, saveFails = false, verifyFails = false } = {}) {
  const calls = [];
  const exports = {};
  let directory = structuredClone(members);
  let created = existing;
  runInNewContext(compiled, {
    exports, URL, URLSearchParams,
    process: { env: { PULSE_ADMIN_API_KEY: key } },
    require: (name) => {
      if (name === "node:crypto") return require(name);
      if (name === "next/server") return { NextResponse: Response };
      if (name === "../backend") return {
        resolvePartnerContext: async () => signedIn ? { context: { seller_id: "partner" } } : { response: Response.json({ error: "missing_clerk_token" }, { status: 401 }) },
        backendUrl: (path) => `https://backend.invalid${path}`,
        sellerUrl: (seller, path) => `https://backend.invalid/ops/sellers/${seller}${path}`,
        readJson: (response) => response.json(),
        backendError: (body, fallback) => body?.error ?? fallback,
      };
      throw new Error(`Unexpected import: ${name}`);
    },
    fetch: async (url, init) => {
      assert.equal(init.headers.Authorization, "Bearer server-secret");
      const body = init.body ? JSON.parse(init.body) : null;
      calls.push({ url, method: init.method ?? "GET", body });
      if (url.endsWith("/customers") && init.method === "POST") {
        if (created) return Response.json({ customer, attached_existing: true });
        created = true;
        const member = { patient_id: "backend_created_member", name: input.name, gender: input.gender, age: 36 };
        directory.push(member);
        return Response.json({ customer, member }, { status: 201 });
      }
      if (url.includes("/quickwlp/customer?")) return lookupFails
        ? Response.json({ error: "member_store_unavailable" }, { status: 503 })
        : Response.json({ customer: { ...customer, customer_id: mismatch ? "another_customer" : customer.customer_id }, patients: directory });
      if (url.endsWith("/quickwlp/member")) {
        if (saveFails) return Response.json({ error: "member_save_failed" }, { status: 503 });
        const patient = { patient_id: body.patient_id, name: body.name, date_of_birth: body.date_of_birth, gender: body.gender };
        if (!verifyFails) directory = [...directory.filter((member) => member.patient_id !== patient.patient_id), patient];
        return Response.json({ patient });
      }
      // Deliberately stale seller mirror: it must not decide whether to create a member.
      if (url.includes("/customers?")) return Response.json({ items: [{ ...customer, member_count: 0, members: [] }] });
      if (url.endsWith("/ops/sellers/partner")) return Response.json({ pulse_profile: { serves_on_premise: false } });
      throw new Error(`Unexpected request: ${url}`);
    },
  });
  const create = (body = input) => exports.POST(new Request("https://pulse.invalid/api/pulse/customers", {
    method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" },
  }));
  return { calls, create };
}

test("a new customer receives one verified member with DOB and gender; retry does not duplicate it", async () => {
  const { create, calls } = fixture();
  const response = await create();
  assert.equal(response.status, 201);
  const { customer: result } = await response.json();
  assert.equal(result.memberCount, 1);
  assert.equal(result.member.patient_id, "backend_created_member");
  assert.equal(result.member.date_of_birth, input.dateOfBirth);
  assert.equal(result.member.gender, "male");
  const save = calls.find((call) => call.url.endsWith("/quickwlp/member"));
  assert.equal(save.body.mode, "edit");
  assert.equal(save.body.patient_id, "backend_created_member");
  assert.equal((await create()).status, 200);
  assert.equal(calls.filter((call) => call.url.endsWith("/quickwlp/member")).length, 1);
});

test("an existing account with no members receives a stable initial member", async () => {
  const { create, calls } = fixture({ existing: true });
  const response = await create();
  assert.equal(response.status, 200);
  const member = (await response.json()).customer.member;
  assert.match(member.patient_id, /^PULSE-[a-f0-9]{32}$/);
  assert.equal(calls.find((call) => call.url.endsWith("/quickwlp/member")).body.mode, "create");
  await create();
  assert.equal(calls.filter((call) => call.url.endsWith("/quickwlp/member")).length, 1);
});

test("directory-only existing members are reused without overwriting family details", async () => {
  const member = { patient_id: "directory_only", name: "Family Member", date_of_birth: "1980-04-03", gender: "female" };
  const { create, calls } = fixture({ existing: true, members: [member] });
  const response = await create();
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).customer.member, member);
  assert.equal(calls.filter((call) => call.url.endsWith("/quickwlp/member")).length, 0);
});

for (const option of ["lookupFails", "mismatch", "saveFails", "verifyFails"]) {
  test(`${option} does not report successful customer-and-member creation`, async () => {
    const { create, calls } = fixture({ existing: true, [option]: true });
    const response = await create();
    assert.equal(response.status, 502);
    assert.equal((await response.json()).customer, undefined);
    if (["lookupFails", "mismatch"].includes(option)) assert.equal(calls.length, 2);
  });
}

for (const dateOfBirth of ["", "1990-02-30", "2999-01-01", "1800-01-01"]) {
  test(`invalid DOB ${JSON.stringify(dateOfBirth)} is rejected before customer creation`, async () => {
    const { create, calls } = fixture();
    assert.equal((await create({ ...input, dateOfBirth })).status, 400);
    assert.equal(calls.length, 0);
  });
}

for (const [options, expected] of [[{ signedIn: false }, 401], [{ key: "" }, 503]]) {
  test(`unauthorized or unconfigured creation fails closed (${expected})`, async () => {
    const { create, calls } = fixture(options);
    assert.equal((await create()).status, expected);
    assert.equal(calls.length, 0);
  });
}
