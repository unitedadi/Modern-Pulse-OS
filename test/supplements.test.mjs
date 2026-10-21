import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function fixture(route, { supplements = [], signedIn = true, catalogStatus = 200, bookings = [] } = {}) {
  const calls = [];
  const exports = {};
  const source = readFileSync(new URL(`../src/app/api/pulse/${route}/route.ts`, import.meta.url), "utf8");
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports,
    require: (name) => {
      if (name === "next/server") return { NextResponse: Response };
      if (name === "../backend") return {
        resolvePartnerContext: async () => signedIn ? { context: { seller_id: "blaura", seller: { display_name: "Blaura" } } } : { response: Response.json({}, { status: 401 }) },
        sellerUrl: (seller, path) => `https://backend.invalid/ops/sellers/${seller}${path}`,
        backendUrl: (path) => `https://backend.invalid${path}`,
        readJson: (response) => response.json(), filsToAed: (value) => Math.round(Number(value ?? 0) / 100),
        backendError: (payload, fallback) => payload?.error ?? fallback,
      };
      throw new Error(name);
    },
    fetch: async (url, init) => {
      calls.push({ url, body: init.body && JSON.parse(init.body), cache: init.cache });
      if (url.endsWith("/catalog")) return Response.json({ products: { supplements } }, { status: catalogStatus });
      if (url.includes("/bookings?")) return Response.json({ items: bookings });
      if (url.includes("/ledger?")) return Response.json({ items: [{ product: "Jalupro Drink", vertical: "shipments", attribution_source: "pulse_supplement", commission_fils: 9505 }], totals: { commission_fils: 9505 } });
      assert.ok(url.endsWith("/checkout/intents"));
      return Response.json({ checkout_url: "https://checkout.invalid/test", checkout_intent_id: "intent-test" });
    },
  });
  return { calls, ...exports };
}
const products = [{ product_id: "jalupro", vertical_id: "shipments", name: "Jalupro Drink", price_aed_fils: 49900, commission_fils: 9505, attributes_json: { skin: { size: "30 sachets", subheadline: "Daily supplement" } } }];
const body = { customerId: "customer", products: [{ productId: "jalupro", vertical: "Supplements" }] };
const req = (value = body) => new Request("https://pulse.invalid/api/pulse/checkout", { method: "POST", body: JSON.stringify(value) });

test("catalog maps the seller's supplements and server-calculated commission", async () => {
  const f = fixture("catalog", { supplements: products });
  const result = await (await f.GET(new Request("https://pulse.invalid/api/pulse/catalog"))).json();
  assert.deepEqual(result.supplementProducts, [{ productId: "jalupro", backendVerticalId: "shipments", name: "Jalupro Drink", desc: "30 sachets", overview: "Daily supplement", price: 499, commission: 95.05, vertical: "Supplements" }]);
});
test("other sellers have no supplement products by default", async () => {
  const f = fixture("catalog");
  assert.deepEqual((await (await f.GET(new Request("https://pulse.invalid"))).json()).supplementProducts, []);
});
test("supplement checkout checks seller catalog and opens address selection, without trusting client price or commission", async () => {
  const f = fixture("checkout", { supplements: products });
  assert.equal((await f.POST(req({ ...body, seller_id: "other", commission: 999, price: 1 }))).status, 200);
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[0].cache, "no-store");
  assert.equal(f.calls[1].body.seller_id, "blaura");
  assert.equal(f.calls[1].body.start_step, "addresses");
  assert.deepEqual(f.calls[1].body.cart, { items: [{ product_id: "jalupro", qty: 1 }] });
  assert.equal(f.calls[1].body.metadata.b2b_commission_bps, undefined);
});
test("unconfigured, mixed, and unavailable catalogs cannot produce supplement links", async () => {
  for (const [options, input, expected] of [
    [{}, body, 400],
    [{ supplements: products }, { ...body, products: [...body.products, { productId: "lab", vertical: "Lab" }] }, 400],
    [{ catalogStatus: 503 }, body, 502],
    [{ signedIn: false }, body, 401],
  ]) {
    const f = fixture("checkout", options);
    assert.equal((await f.POST(req(input))).status, expected);
    assert.equal(f.calls.filter((call) => call.url.endsWith("/checkout/intents")).length, 0);
  }
});
test("adding the same supplement twice produces one checkout item with quantity two", async () => {
  const f = fixture("checkout", { supplements: products });
  assert.equal((await f.POST(req({ ...body, products: [...body.products, ...body.products] }))).status, 200);
  assert.deepEqual(f.calls[1].body.cart.items, [{ product_id: "jalupro", qty: 2 }]);
});
test("existing Lab and IV flows still start at member selection", async () => {
  for (const vertical of ["Lab", "IV"]) {
    const f = fixture("checkout");
    assert.equal((await f.POST(req({ ...body, products: [{ productId: "existing", vertical }] }))).status, 200);
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].body.start_step, "members");
  }
});
test("supplement orders and peptide medication orders retain distinct booking labels", async () => {
  const f = fixture("bookings", { bookings: [
    { order_id: "supplement", type: "supplement_order", vertical: "shipments", status: "PAID", amount_fils: 49900 },
    { order_id: "peptide", type: "peptide_medication_order", vertical: "shipments", status: "PAID", amount_fils: 99900 },
  ] });
  assert.deepEqual((await (await f.GET(new Request("https://pulse.invalid"))).json()).bookings.map((b) => b.vertical), ["Supplements", "Peptides"]);
});
test("revenue shows Supplement sale and preserves fils", async () => {
  const f = fixture("ledger");
  const result = await (await f.GET(new Request("https://pulse.invalid"))).json();
  assert.equal(result.ledger[0].type, "Supplement sale");
  assert.equal(result.ledger[0].amount, "+ AED 95.05");
  assert.equal(result.totals.commissionAed, 95.05);
});
