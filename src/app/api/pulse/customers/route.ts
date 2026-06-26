import { NextResponse } from "next/server";
import { backendError, backendUrl, readJson, resolvePartnerContext, sellerUrl } from "../backend";

type Gender = "Female" | "Male";

type BackendMember = {
  patient_id?: string | null;
  name?: string | null;
  email?: string | null;
  age?: number | null;
  gender?: string | null;
};

type BackendCustomer = {
  customer_id: string;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  member_count?: number | null;
  members?: BackendMember[] | null;
};

type CustomerCreatePayload = {
  customer?: BackendCustomer;
  member?: BackendMember | null;
  attached_existing?: boolean;
  error?: string;
  detail?: string;
};

function gender(value: unknown) {
  return String(value ?? "").trim().toLowerCase() === "male" ? "Male" : "Female";
}

function customerToView(customer: BackendCustomer) {
  const member = customer.members?.[0] ?? null;
  return {
    id: customer.customer_id,
    customerId: customer.customer_id,
    name: customer.full_name ?? member?.name ?? "",
    email: customer.email ?? member?.email ?? "",
    phone: customer.phone ?? "",
    gender: gender(member?.gender),
    age: member?.age ?? null,
    memberCount: customer.member_count ?? customer.members?.length ?? 0,
    member,
  };
}

function customerWithMember(customer: BackendCustomer, member: BackendMember | null | undefined) {
  if (!member) return customer;
  const members = customer.members?.length ? customer.members : [member];
  return {
    ...customer,
    members,
    member_count: Math.max(customer.member_count ?? 0, members.length),
  };
}

async function hydrateSellerCustomer(sellerId: string, customerId: string) {
  const lookupParams = new URLSearchParams({
    q: customerId,
    limit: "10",
    page: "1",
  });
  const lookupResponse = await fetch(sellerUrl(sellerId, `/customers?${lookupParams}`), {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const lookupPayload = (await readJson(lookupResponse)) as
    | { items?: BackendCustomer[] }
    | null;

  return lookupPayload?.items?.find((customer) => customer.customer_id === customerId) ?? null;
}

async function createInitialMember(params: {
  customerId: string;
  name: string;
  email: string;
  phone: string;
  age: number;
  gender: Gender;
}) {
  const response = await fetch(backendUrl(`/customers/${encodeURIComponent(params.customerId)}/patients`), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: params.name,
      email: params.email || undefined,
      phone: params.phone,
      age: params.age,
      gender: params.gender,
    }),
  });
  const payload = (await readJson(response)) as
    | { patient?: BackendMember; error?: string; detail?: string }
    | null;

  if (!response.ok || !payload?.patient) {
    throw new Error(backendError(payload, `member_create_${response.status}`));
  }

  return payload.patient;
}

export async function GET(request: Request) {
  const resolved = await resolvePartnerContext(request);
  if ("response" in resolved) return resolved.response;

  const url = new URL(request.url);
  const params = new URLSearchParams({
    page: url.searchParams.get("page") ?? "1",
    limit: url.searchParams.get("limit") ?? "50",
  });
  const query = url.searchParams.get("q")?.trim();
  if (query) params.set("q", query);

  const response = await fetch(sellerUrl(resolved.context.seller_id, `/customers?${params}`), {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const payload = (await readJson(response)) as
    | { total?: number; items?: BackendCustomer[]; error?: string; detail?: string }
    | null;

  if (!response.ok) {
    return NextResponse.json(
      { error: backendError(payload, `customers_${response.status}`) },
      { status: response.status },
    );
  }

  const customers = (payload?.items ?? []).map(customerToView);
  return NextResponse.json({ customers, total: payload?.total ?? customers.length });
}

export async function POST(request: Request) {
  const resolved = await resolvePartnerContext(request);
  if ("response" in resolved) return resolved.response;

  const input = (await request.json().catch(() => null)) as {
    name?: unknown;
    email?: unknown;
    phone?: unknown;
    age?: unknown;
    gender?: unknown;
  } | null;

  const name = String(input?.name ?? "").trim();
  const email = String(input?.email ?? "").trim();
  const phone = String(input?.phone ?? "").trim();
  const age = Number(input?.age);
  const genderValue = gender(input?.gender);

  if (!name || !phone || !email || !Number.isInteger(age) || age < 0 || age > 150) {
    return NextResponse.json({ error: "validation_error" }, { status: 400 });
  }

  const response = await fetch(sellerUrl(resolved.context.seller_id, "/customers"), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      email,
      phone,
      age,
      gender: genderValue,
      member_name: name,
      member_email: email,
    }),
  });
  const payload = (await readJson(response)) as
    | CustomerCreatePayload
    | null;

  if (!response.ok || !payload?.customer) {
    return NextResponse.json(
      { error: backendError(payload, `customer_create_${response.status}`) },
      { status: response.status },
    );
  }

  const customerId = payload.customer.customer_id;
  let member = payload.member ?? null;
  let hydratedCustomer = await hydrateSellerCustomer(resolved.context.seller_id, customerId);
  const memberCount = hydratedCustomer?.member_count ?? hydratedCustomer?.members?.length ?? 0;

  if (!member && memberCount === 0) {
    try {
      member = await createInitialMember({
        customerId,
        name,
        email,
        phone,
        age,
        gender: genderValue,
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "member_create_failed" },
        { status: 502 },
      );
    }
    hydratedCustomer = await hydrateSellerCustomer(resolved.context.seller_id, customerId);
  }

  return NextResponse.json(
    {
      customer: customerToView(customerWithMember(hydratedCustomer ?? payload.customer, member)),
      attachedExisting: Boolean(payload.attached_existing),
    },
    { status: payload.attached_existing ? 200 : 201 },
  );
}
