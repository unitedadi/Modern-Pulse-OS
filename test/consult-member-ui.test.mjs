import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function find(element, name) {
  if (!element || typeof element !== "object") return;
  if (element.type?.name === name) return element;
  for (const child of [element.props?.children].flat(Infinity)) {
    const match = find(child, name);
    if (match) return match;
  }
}

// Exercise the page's real event handlers with isolated hook state and no network writes.
function fixture(members) {
  const state = [];
  const requests = [];
  let cursor = 0;
  let loadMembers;
  const exports = {};
  runInNewContext(compiled, {
    exports, Headers, URLSearchParams,
    window: { setTimeout() {} },
    require: (name) => {
      if (name === "react") return {
        useState: (initial) => {
          const index = cursor++;
          if (!(index in state)) state[index] = initial;
          return [state[index], (value) => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
        },
        useCallback: (fn) => fn,
        useMemo: (fn) => fn(),
        useEffect: (fn, deps) => { if (deps?.includes("peptides")) loadMembers = fn; },
      };
      if (name === "@clerk/nextjs") return {
        useAuth: () => ({ getToken: async () => "test-token", isLoaded: true, isSignedIn: true }),
        useClerk: () => ({ signOut() {} }),
      };
      return require(name);
    },
    fetch: async (url, init) => {
      if (!init.body) return Response.json({ members, slots: [] });
      requests.push({ url, body: JSON.parse(init.body) });
      return Response.json({ error: "slot_no_longer_available" }, { status: 409 });
    },
  });
  const render = () => { cursor = 0; return exports.default(); };
  const openPeptides = async () => {
    find(render(), "OrderModal").props.onTabChange("peptides");
    render();
    loadMembers();
    await new Promise(setImmediate);
  };
  return { render, requests, openPeptides };
}

const customer = { id: "customer", name: "Account Holder", phone: "+971500000001", email: "test@example.com" };
const first = { patient_id: "existing_member", name: "First Member", date_of_birth: "1990-01-01", gender: "male" };
const second = { patient_id: "second_member", name: "Second Member", date_of_birth: "1992-01-01", gender: "female" };

test("a sole existing member is selected and sent by the UI", async () => {
  const { render, requests, openPeptides } = fixture([first]);
  find(render(), "CustomersView").props.onOpenCustomer(customer);
  await openPeptides();
  let modal = find(render(), "OrderModal").props;
  assert.equal(modal.consultPatientId, first.patient_id);
  modal.onSelectPeptideSlot({ doctor_id: "doctor", slot_start: "2026-10-01T10:00:00+04:00" });
  modal = find(render(), "OrderModal").props;
  await modal.onBookConsult();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].body.patientId, first.patient_id);
});

test("multiple members require an explicit choice and changing customers clears it", async () => {
  const { render, requests, openPeptides } = fixture([first, second]);
  find(render(), "CustomersView").props.onOpenCustomer(customer);
  await openPeptides();
  let modal = find(render(), "OrderModal").props;
  assert.equal(modal.consultPatientId, "");
  modal.onSelectPeptideSlot({ doctor_id: "doctor", slot_start: "2026-10-01T10:00:00+04:00" });
  await find(render(), "OrderModal").props.onBookConsult();
  assert.equal(requests.length, 0);
  find(render(), "OrderModal").props.onSelectConsultPatient(second.patient_id);
  await find(render(), "OrderModal").props.onBookConsult();
  assert.equal(requests[0].body.patientId, second.patient_id);
  find(render(), "CustomersView").props.onOpenCustomer({ ...customer, id: "another_customer" });
  modal = find(render(), "OrderModal").props;
  assert.equal(modal.consultPatientId, "");
});

test("incomplete member demographics block submission without inventing missing details", async () => {
  const { render, requests, openPeptides } = fixture([{ ...first, date_of_birth: null, gender: null }]);
  find(render(), "CustomersView").props.onOpenCustomer(customer);
  await openPeptides();
  find(render(), "OrderModal").props.onSelectPeptideSlot({ doctor_id: "doctor", slot_start: "2026-10-01T10:00:00+04:00" });
  await find(render(), "OrderModal").props.onBookConsult();
  assert.equal(requests.length, 0);
});

test("new-customer form sends the entered birth date, not an inferred date from age", async () => {
  const { render, requests } = fixture([]);
  find(render(), "CustomersView").props.onNewCustomer();
  const modal = find(render(), "NewCustomerModal").props;
  modal.onChange({ name: "Member", email: "test@example.com", phone: "+971500000001", dateOfBirth: "1990-02-15", gender: "Male" });
  await find(render(), "NewCustomerModal").props.onCreate();
  assert.equal(requests[0].url, "/api/pulse/customers");
  assert.equal(requests[0].body.dateOfBirth, "1990-02-15");
  assert.equal(requests[0].body.age, undefined);
});
