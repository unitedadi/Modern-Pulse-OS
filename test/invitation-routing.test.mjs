import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/app/accept-invite/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const route = {};
runInNewContext(compiled, { exports: route, URL, URLSearchParams, Response });

function resolve(query = "") {
  return route.GET(new Request(`https://www.pulsehealthuae.com/accept-invite${query}`));
}

for (const [status, path] of [["sign_up", "/sign-up"], ["sign_in", "/sign-in"]]) {
  test(`${status} preserves the invitation ticket and routes to the existing Clerk page`, () => {
    const ticket = "synthetic.jwt+with/characters=";
    const query = new URLSearchParams({ __clerk_status: status, __clerk_ticket: ticket });
    const response = resolve(`?${query}`);
    assert.equal(response.status, 303);
    const location = new URL(response.headers.get("location"), "https://www.pulsehealthuae.com");
    assert.equal(location.pathname, path);
    assert.equal(location.searchParams.get("__clerk_ticket"), ticket);
    assert.equal(location.searchParams.get("__clerk_status"), status);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  });
}

test("completed invitations go to the protected app without leaking the ticket", () => {
  assert.equal(resolve("?__clerk_status=complete&__clerk_ticket=synthetic").headers.get("location"), "/");
});

for (const query of ["", "?__clerk_status=sign_up", "?__clerk_status=sign_in&__clerk_ticket=", "?__clerk_ticket=synthetic", "?__clerk_status=unknown&__clerk_ticket=synthetic"]) {
  test(`incomplete invitation safely falls back to sign-in: ${query}`, () => {
    assert.equal(resolve(query).headers.get("location"), "/sign-in");
  });
}

test("untrusted redirect parameters cannot override the same-site destination", () => {
  const response = resolve("?__clerk_status=sign_up&__clerk_ticket=synthetic&redirect_url=https://evil.invalid&after_sign_up_url=https://evil.invalid&__clerk_redirect_url=https://evil.invalid");
  assert.equal(response.headers.get("location"), "/sign-up?__clerk_status=sign_up&__clerk_ticket=synthetic");
});

test("the invite route stays public while all other application routes retain authentication", () => {
  const proxy = readFileSync(new URL("../src/proxy.ts", import.meta.url), "utf8");
  assert.ok(proxy.includes('"/accept-invite(.*)"'));
  assert.ok(proxy.includes("if (!isPublicRoute(request))"));
  assert.ok(proxy.includes("await auth.protect("));
});
