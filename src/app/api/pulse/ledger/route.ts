import { NextResponse } from "next/server";
import { backendError, filsToAed, readJson, resolvePartnerContext, sellerUrl } from "../backend";

type BackendLedgerEntry = {
  order_id?: string | null;
  booking_id?: string | null;
  customer_name?: string | null;
  product?: string | null;
  vertical?: string | null;
  paid_amount_fils?: number | null;
  commission_fils?: number | null;
  paid_at?: string | null;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-AE", {
    day: "numeric",
    month: "short",
  }).format(date);
}

function kind(value: string | null | undefined) {
  return String(value ?? "").toLowerCase().includes("peptide") ? "peptide" : "sale";
}

function typeLabel(value: string | null | undefined) {
  const normalized = String(value ?? "").toLowerCase();
  if (normalized.includes("iv")) return "IV sale";
  if (normalized.includes("peptide")) return "Peptide 20%";
  return "Lab sale";
}

function entryToView(entry: BackendLedgerEntry, index: number) {
  const commission = filsToAed(entry.commission_fils);
  const paid = filsToAed(entry.paid_amount_fils);
  const amount = commission || paid;
  return {
    id: entry.booking_id ?? entry.order_id ?? String(index),
    date: formatDate(entry.paid_at),
    desc: entry.product ?? "Product",
    customer: entry.customer_name ?? "Customer",
    type: typeLabel(entry.vertical),
    amount: `+ AED ${amount.toLocaleString()}`,
    kind: kind(entry.vertical),
  };
}

export async function GET(request: Request) {
  const resolved = await resolvePartnerContext(request);
  if ("response" in resolved) return resolved.response;

  const response = await fetch(sellerUrl(resolved.context.seller_id, "/ledger?limit=50&page=1"), {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const payload = (await readJson(response)) as
    | {
        total?: number;
        totals?: { paid_amount_fils?: number; commission_fils?: number };
        items?: BackendLedgerEntry[];
        error?: string;
        detail?: string;
      }
    | null;

  if (!response.ok) {
    return NextResponse.json(
      { error: backendError(payload, `ledger_${response.status}`) },
      { status: response.status },
    );
  }

  const ledger = (payload?.items ?? []).map(entryToView);
  return NextResponse.json({
    ledger,
    total: payload?.total ?? ledger.length,
    totals: {
      paidAed: filsToAed(payload?.totals?.paid_amount_fils),
      commissionAed: filsToAed(payload?.totals?.commission_fils),
    },
  });
}
