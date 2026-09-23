import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { backendError, backendUrl, readJson, resolvePartnerContext, sellerUrl } from "../backend";

type Gender = "Female" | "Male";

type BackendMember = {
  patient_id?: string | null;
  name?: string | null;
  email?: string | null;
  age?: number | null;
  gender?: string | null;
  date_of_birth?: string | null;
  identity_revision?: string;
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

type PremiseAddress = {
  saved_name?: string | null;
  line1?: string | null;
  address?: string | null;
  building_name?: string | null;
  floor_number?: string | null;
  line2?: string | null;
  detail?: string | null;
  area?: string | null;
  city?: string | null;
  emirate?: string | null;
  country?: string | null;
  latitude?: string | null;
  longitude?: string | null;
};

type PulseProfile = {
  serves_on_premise?: boolean;
  premise_address?: PremiseAddress | null;
};

function backendAdminHeaders(): Record<string, string> {
  const apiKey = String(process.env.PULSE_ADMIN_API_KEY ?? "").trim();
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

function gender(value: unknown) {
  return String(value ?? "").trim().toLowerCase() === "male" ? "Male" : "Female";
}

function normalizePhone(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  let normalized: string;
  if (digits.startsWith("00")) {
    normalized = `+${digits.slice(2)}`;
  } else if (raw.startsWith("+")) {
    normalized = `+${digits}`;
  } else if (digits.startsWith("971")) {
    normalized = `+${digits}`;
  } else if (digits.startsWith("0") && digits.length === 10) {
    normalized = `+971${digits.slice(1)}`;
  } else {
    normalized = `+${digits}`;
  }

  return /^\+[1-9]\d{6,14}$/.test(normalized) ? normalized : null;
}

function customerCreateError(payload: unknown, fallback: string) {
  const error = backendError(payload, fallback);
  if (/e\.?164|phone number/i.test(error)) {
    return "Enter the phone number with country code, for example +971501234567.";
  }
  return error;
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

function ageFromBirthDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  const today = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const age = Number(today.slice(0, 4)) - Number(value.slice(0, 4)) - (today.slice(5) < value.slice(5) ? 1 : 0);
  return value > today || age < 0 || age > 150 ? null : age;
}

async function loadConsultationMembers(customerId: string, phone: string) {
  const params = new URLSearchParams({ phone_number: phone });
  const response = await fetch(backendUrl(`/admin/quickwlp/customer?${params}`), {
    headers: { Accept: "application/json", ...backendAdminHeaders() },
    cache: "no-store",
  });
  const payload = (await readJson(response)) as { customer?: BackendCustomer; patients?: BackendMember[] } | null;
  if (!response.ok) throw new Error(backendError(payload, "member_lookup_failed"));
  if (payload?.customer?.customer_id !== customerId) throw new Error("customer_identity_mismatch");
  return (payload.patients ?? []).filter((member) => member.patient_id);
}

async function hydrateSellerCustomer(sellerId: string, customerId: string) {
  const lookupParams = new URLSearchParams({
    q: customerId,
    limit: "10",
    page: "1",
  });
  const lookupResponse = await fetch(sellerUrl(sellerId, `/customers?${lookupParams}`), {
    headers: { Accept: "application/json", ...backendAdminHeaders() },
    cache: "no-store",
  });
  const lookupPayload = (await readJson(lookupResponse)) as
    | { items?: BackendCustomer[] }
    | null;

  return lookupPayload?.items?.find((customer) => customer.customer_id === customerId) ?? null;
}

async function loadPulseProfile(sellerId: string) {
  const response = await fetch(sellerUrl(sellerId, ""), {
    headers: { Accept: "application/json", ...backendAdminHeaders() },
    cache: "no-store",
  });
  const payload = (await readJson(response)) as
    | { pulse_profile?: PulseProfile; error?: string; detail?: string }
    | null;

  if (!response.ok) return null;
  return payload?.pulse_profile ?? null;
}

async function saveInitialMember(params: {
  customerId: string;
  member?: BackendMember;
  name: string;
  phone: string;
  dateOfBirth: string;
  gender: Gender;
}) {
  // Stable across retries so an uncertain create cannot mint a second member.
  const patientId = params.member?.patient_id ?? `PULSE-${createHash("sha256").update(params.customerId).digest("hex").slice(0, 32)}`;
  const response = await fetch(backendUrl("/admin/quickwlp/member"), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...backendAdminHeaders(),
    },
    body: JSON.stringify({
      name: params.name,
      account_name: params.name,
      phone_number: params.phone,
      patient_id: patientId,
      mode: params.member ? "edit" : "create",
      expected_revision: params.member?.identity_revision,
      date_of_birth: params.dateOfBirth,
      gender: params.gender.toLowerCase(),
    }),
  });
  const payload = (await readJson(response)) as
    | { patient?: BackendMember; error?: string; detail?: string }
    | null;

  if (!response.ok || !payload?.patient?.patient_id) {
    throw new Error(backendError(payload, `member_create_${response.status}`));
  }

  return payload.patient;
}

async function createPremiseAddress(customerId: string, address: PremiseAddress) {
  const response = await fetch(backendUrl(`/admin/customers/${encodeURIComponent(customerId)}/addresses`), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...backendAdminHeaders(),
    },
    body: JSON.stringify({
      saved_name: address.saved_name ?? "Premise",
      line1: address.line1 ?? address.address,
      building_name: address.building_name ?? undefined,
      floor_number: address.floor_number ?? undefined,
      line2: address.line2 ?? address.detail ?? undefined,
      detail: address.detail ?? address.line2 ?? undefined,
      area: address.area ?? undefined,
      city: address.city ?? undefined,
      emirate: address.emirate ?? undefined,
      country: address.country ?? "UAE",
      latitude: address.latitude ?? undefined,
      longitude: address.longitude ?? undefined,
    }),
  });
  const payload = (await readJson(response)) as
    | { address?: unknown; error?: string; detail?: string }
    | null;

  if (!response.ok || !payload?.address) {
    throw new Error(backendError(payload, `address_create_${response.status}`));
  }
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
    headers: { Accept: "application/json", ...backendAdminHeaders() },
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
  if (!backendAdminHeaders().Authorization) {
    return NextResponse.json({ error: "customer_create_auth_not_configured" }, { status: 503 });
  }

  const input = (await request.json().catch(() => null)) as {
    name?: unknown;
    email?: unknown;
    phone?: unknown;
    dateOfBirth?: unknown;
    gender?: unknown;
  } | null;

  const name = String(input?.name ?? "").trim();
  const email = String(input?.email ?? "").trim();
  const phone = normalizePhone(input?.phone);
  const dateOfBirth = String(input?.dateOfBirth ?? "").trim();
  const age = ageFromBirthDate(dateOfBirth);
  const genderValue = gender(input?.gender);

  if (!name || !phone || !email || age === null || !["Male", "Female"].includes(String(input?.gender))) {
    return NextResponse.json(
      { error: "Enter name, email, a valid date of birth, gender, and a phone number with country code." },
      { status: 400 },
    );
  }

  const response = await fetch(sellerUrl(resolved.context.seller_id, "/customers"), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...backendAdminHeaders(),
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

  if (!response.ok || !payload?.customer?.customer_id) {
    return NextResponse.json(
      { error: customerCreateError(payload, `customer_create_${response.status}`) },
      { status: response.ok ? 502 : response.status },
    );
  }

  const customerId = payload.customer.customer_id;
  let members: BackendMember[];
  try {
    members = await loadConsultationMembers(customerId, phone);
    const createdMember = payload.member?.patient_id
      ? members.find((member) => member.patient_id === payload.member?.patient_id)
      : undefined;
    if (payload.member && !createdMember) throw new Error("member_creation_not_verified");

    // Complete only the member created by this request; never overwrite an existing family's details.
    if (createdMember || members.length === 0) {
      const member = await saveInitialMember({
        customerId,
        member: createdMember,
        name,
        phone,
        dateOfBirth,
        gender: genderValue,
      });
      members = await loadConsultationMembers(customerId, phone);
      const verified = members.find((item) => item.patient_id === member.patient_id);
      if (!verified || verified.date_of_birth !== dateOfBirth || verified.gender?.toLowerCase() !== genderValue.toLowerCase()) {
        throw new Error("member_creation_not_verified");
      }
      if (!createdMember) {
        const pulseProfile = await loadPulseProfile(resolved.context.seller_id);
        if (pulseProfile?.serves_on_premise && pulseProfile.premise_address) {
          await createPremiseAddress(customerId, pulseProfile.premise_address);
        }
      }
    }
  } catch (error) {
    return NextResponse.json(
      { error: customerCreateError(error instanceof Error ? { error: error.message } : null, "member_create_failed") },
      { status: 502 },
    );
  }

  const hydratedCustomer = await hydrateSellerCustomer(resolved.context.seller_id, customerId);
  return NextResponse.json(
    {
      customer: customerToView({ ...(hydratedCustomer ?? payload.customer), members, member_count: members.length }),
      attachedExisting: Boolean(payload.attached_existing),
    },
    { status: payload.attached_existing ? 200 : 201 },
  );
}
