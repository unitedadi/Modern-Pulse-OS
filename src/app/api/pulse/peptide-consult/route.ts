import { NextResponse } from "next/server";
import { backendError, backendUrl, readJson, resolvePartnerContext, sellerUrl } from "../backend";

type QuickConsultDoctor = {
  doctor_id?: string | null;
  name?: string | null;
  track_keys?: string[] | null;
};

type QuickConsultSlot = {
  slot_start?: string | null;
  slot_end?: string | null;
  status?: string | null;
  doctor_id?: string | null;
  doctor_ids?: string[] | null;
  available_doctors?: Array<{ doctor_id?: string | null; doctor_name?: string | null }> | null;
};

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function dubaiTodayYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function doctorCanHandlePeptides(doctor: QuickConsultDoctor) {
  return Array.isArray(doctor.track_keys) && doctor.track_keys.includes("peptides");
}

function choosePeptideDoctor(doctors: QuickConsultDoctor[]) {
  return (
    doctors.find((doctor) => doctorCanHandlePeptides(doctor) && String(doctor.name ?? "").toLowerCase().includes("sami")) ??
    doctors.find(doctorCanHandlePeptides) ??
    null
  );
}

function slotDoctorId(slot: QuickConsultSlot, fallbackDoctorId: string) {
  return (
    stringValue(slot.doctor_id) ||
    stringValue(slot.doctor_ids?.[0]) ||
    stringValue(slot.available_doctors?.[0]?.doctor_id) ||
    fallbackDoctorId
  );
}

async function loadPeptideDoctor() {
  const doctorsResponse = await fetch(backendUrl("/ops/quickwlp/doctors?active=true&limit=200"), {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const doctorsPayload = (await readJson(doctorsResponse)) as
    | { items?: QuickConsultDoctor[]; error?: string; detail?: string }
    | null;

  if (!doctorsResponse.ok) {
    throw new Error(backendError(doctorsPayload, `quick_consult_doctors_${doctorsResponse.status}`));
  }

  return choosePeptideDoctor(doctorsPayload?.items ?? []);
}

async function loadPeptideCommercialConfig(sellerId: string) {
  const response = await fetch(sellerUrl(sellerId, "/catalog"), {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const payload = (await readJson(response)) as
    | {
        peptide_consultation?: {
          commission_bps?: number | null;
          promo_code?: string | null;
        };
        error?: string;
        detail?: string;
      }
    | null;
  if (!response.ok) {
    throw new Error(backendError(payload, `peptide_catalog_${response.status}`));
  }
  return {
    commissionBps: Number(payload?.peptide_consultation?.commission_bps ?? 2000),
    promoCode: stringValue(payload?.peptide_consultation?.promo_code) || null,
  };
}

export async function GET(request: Request) {
  const resolved = await resolvePartnerContext(request);
  if ("response" in resolved) return resolved.response;

  try {
    const doctor = await loadPeptideDoctor();
    const doctorId = stringValue(doctor?.doctor_id);
    if (!doctor || !doctorId) {
      return NextResponse.json({ doctor: null, slots: [] });
    }

    const params = new URLSearchParams({
      doctor_id: doctorId,
      track_key: "peptides",
      start_date: dubaiTodayYmd(),
      days: "14",
    });
    const slotsResponse = await fetch(backendUrl(`/admin/quickwlp/slots?${params}`), {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const slotsPayload = (await readJson(slotsResponse)) as
      | { slots?: QuickConsultSlot[]; error?: string; detail?: string }
      | null;

    if (!slotsResponse.ok) {
      const error = backendError(slotsPayload, `quick_consult_slots_${slotsResponse.status}`);
      if (
        error === "microsoft_graph_not_enabled" ||
        error === "microsoft_graph_not_configured" ||
        error === "microsoft_graph_mailbox_missing"
      ) {
        return NextResponse.json({ doctor, slots: [] });
      }
      return NextResponse.json({ error }, { status: slotsResponse.status });
    }

    const slots = (slotsPayload?.slots ?? []).map((slot) => ({
      ...slot,
      doctor_id: slotDoctorId(slot, doctorId),
    }));
    return NextResponse.json({ doctor, slots });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "quick_consult_slots_failed" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const resolved = await resolvePartnerContext(request);
  if ("response" in resolved) return resolved.response;

  const input = (await request.json().catch(() => null)) as
    | {
        doctorId?: unknown;
        slotStart?: unknown;
        customer?: {
          name?: unknown;
          email?: unknown;
          phone?: unknown;
        };
      }
    | null;

  const doctorId = stringValue(input?.doctorId);
  const slotStart = stringValue(input?.slotStart);
  const customerName = stringValue(input?.customer?.name);
  const customerEmail = stringValue(input?.customer?.email);
  const customerPhone = stringValue(input?.customer?.phone);
  const sellerId = resolved.context.seller_id;
  const sellerName = stringValue(resolved.context.seller?.display_name) || sellerId;

  if (!doctorId || !slotStart || !customerPhone) {
    return NextResponse.json({ error: "peptide_consult_validation_error" }, { status: 400 });
  }

  let commercialConfig: Awaited<ReturnType<typeof loadPeptideCommercialConfig>>;
  try {
    commercialConfig = await loadPeptideCommercialConfig(sellerId);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "peptide_catalog_failed" },
      { status: 502 },
    );
  }

  const response = await fetch(backendUrl("/doctor/quickwlp/admin/consultations"), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      doctor_id: doctorId,
      phone_number: customerPhone,
      name: customerName || undefined,
      email: customerEmail || undefined,
      slot_start: slotStart,
      track_key: "peptides",
      source_tag: sellerName,
      b2b_partner_id: sellerId,
      b2b_partner_name: sellerName,
      b2b_commission_bps: commercialConfig.commissionBps,
      b2b_promo_code: commercialConfig.promoCode,
    }),
  });
  const payload = (await readJson(response)) as
    | { consultation?: unknown; lead?: unknown; error?: string; detail?: string }
    | null;

  if (!response.ok || !payload?.consultation) {
    return NextResponse.json(
      { error: backendError(payload, `peptide_consult_${response.status}`) },
      { status: response.status },
    );
  }

  return NextResponse.json(payload, { status: 201 });
}
