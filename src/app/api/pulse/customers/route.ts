import { NextResponse } from "next/server";
import { backendError, readJson, sellerUrl } from "../backend";

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

function gender(value: unknown) {
  return value === "Male" ? "Male" : "Female";
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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = new URLSearchParams({
    page: url.searchParams.get("page") ?? "1",
    limit: url.searchParams.get("limit") ?? "50",
  });
  const query = url.searchParams.get("q")?.trim();
  if (query) params.set("q", query);

  const response = await fetch(sellerUrl(`/customers?${params}`), {
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

  const response = await fetch(sellerUrl("/customers"), {
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
    | { customer?: BackendCustomer; attached_existing?: boolean; error?: string; detail?: string }
    | null;

  if (!response.ok || !payload?.customer) {
    return NextResponse.json(
      { error: backendError(payload, `customer_create_${response.status}`) },
      { status: response.status },
    );
  }

  const lookupParams = new URLSearchParams({
    q: payload.customer.customer_id,
    limit: "10",
    page: "1",
  });
  const lookupResponse = await fetch(sellerUrl(`/customers?${lookupParams}`), {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const lookupPayload = (await readJson(lookupResponse)) as
    | { items?: BackendCustomer[] }
    | null;
  const hydratedCustomer = lookupPayload?.items?.find(
    (customer) => customer.customer_id === payload.customer?.customer_id,
  );

  return NextResponse.json(
    {
      customer: customerToView(hydratedCustomer ?? payload.customer),
      attachedExisting: Boolean(payload.attached_existing),
    },
    { status: payload.attached_existing ? 200 : 201 },
  );
}
