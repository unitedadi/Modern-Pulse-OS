const API_BASE = (process.env.PULSE_API_BASE_URL ?? "http://127.0.0.1:4011").replace(
  /\/$/,
  "",
);

export const SELLER_ID = process.env.PULSE_SELLER_ID ?? "seller_dev_seller";

export function sellerUrl(path: string) {
  return `${API_BASE}/ops/sellers/${encodeURIComponent(SELLER_ID)}${path}`;
}

export function backendUrl(path: string) {
  return `${API_BASE}${path}`;
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
