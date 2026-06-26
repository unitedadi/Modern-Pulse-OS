import { NextResponse } from "next/server";

const API_BASE = (process.env.PULSE_API_BASE_URL ?? "http://127.0.0.1:4011").replace(/\/$/, "");

export type PulsePartnerContext = {
  seller_id: string;
  customer_id: string;
  address_id?: string | null;
  seller?: {
    seller_id?: string;
    display_name?: string | null;
    status?: string;
  };
  workspace_id?: number;
  resolved_by?: string | null;
};

export function sellerUrl(sellerId: string, path: string) {
  return `${API_BASE}/ops/sellers/${encodeURIComponent(sellerId)}${path}`;
}

export function backendUrl(path: string) {
  return `${API_BASE}${path}`;
}

export function requestAuthorization(request: Request) {
  return request.headers.get("authorization") ?? "";
}

export async function resolvePartnerContext(request: Request) {
  const authorization = requestAuthorization(request);
  if (!authorization) {
    return {
      response: NextResponse.json({ error: "missing_clerk_token" }, { status: 401 }),
    };
  }

  const response = await fetch(backendUrl("/partners/me/context"), {
    headers: {
      Accept: "application/json",
      Authorization: authorization,
    },
    cache: "no-store",
  });
  const payload = (await readJson(response)) as
    | (PulsePartnerContext & { error?: string; detail?: string })
    | null;

  if (!response.ok || !payload?.seller_id) {
    return {
      response: NextResponse.json(
        { error: backendError(payload, `partner_context_${response.status}`) },
        { status: response.status },
      ),
    };
  }

  return { context: payload };
}

export async function readJson(response: Response) {
  return (await response.json().catch(() => null)) as unknown;
}

export function backendError(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object") {
    const error = "error" in payload ? payload.error : undefined;
    const detail = "detail" in payload ? payload.detail : undefined;
    if (typeof detail === "string" && detail) return detail;
    if (typeof error === "string" && error) return error;
  }
  return fallback;
}

export function filsToAed(value: unknown) {
  const fils = Number(value ?? 0);
  if (!Number.isFinite(fils) || fils <= 0) return 0;
  return Math.round(fils / 100);
}
