import { NextResponse } from "next/server";
import { backendError, filsToAed, readJson, resolvePartnerContext, sellerUrl } from "../backend";

type BackendBooking = {
  order_id?: string | null;
  booking_id?: string | null;
  customer_name?: string | null;
  product_name?: string | null;
  vertical?: string | null;
  status?: string | null;
  amount_fils?: number | null;
  occurred_at?: string | null;
  paid_at?: string | null;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "Scheduling";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Scheduling";
  return new Intl.DateTimeFormat("en-AE", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function vertical(value: string | null | undefined) {
  const normalized = String(value ?? "").toLowerCase();
  if (normalized.includes("iv")) return "IV";
  if (normalized.includes("peptide")) return "Peptides";
  return "Lab";
}

function status(value: string | null | undefined) {
  const normalized = String(value ?? "").toUpperCase();
  if (["FULFILLED", "COMPLETED", "COMPLETE", "PAID"].includes(normalized)) return "Completed";
  if (["CONFIRMED", "BOOKED", "ACTIVE", "ASSIGNED"].includes(normalized)) return "Confirmed";
  return "Pending";
}

function bookingToView(booking: BackendBooking, index: number) {
  const amount = filsToAed(booking.amount_fils);
  return {
    id: booking.booking_id ?? booking.order_id ?? String(index),
    customer: booking.customer_name ?? "Customer",
    service: booking.product_name ?? "Service",
    vertical: vertical(booking.vertical),
    date: formatDate(booking.occurred_at ?? booking.paid_at),
    status: status(booking.status),
    amount: amount > 0 ? `AED ${amount.toLocaleString()}` : "Consult",
  };
}

export async function GET(request: Request) {
  const resolved = await resolvePartnerContext(request);
  if ("response" in resolved) return resolved.response;

  const response = await fetch(sellerUrl(resolved.context.seller_id, "/bookings?limit=50&page=1"), {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const payload = (await readJson(response)) as
    | { total?: number; items?: BackendBooking[]; error?: string; detail?: string }
    | null;

  if (!response.ok) {
    return NextResponse.json(
      { error: backendError(payload, `bookings_${response.status}`) },
      { status: response.status },
    );
  }

  const bookings = (payload?.items ?? []).map(bookingToView);
  return NextResponse.json({ bookings, total: payload?.total ?? bookings.length });
}
