import { NextResponse } from "next/server";
import { backendError, readJson, resolvePartnerContext, sellerUrl } from "../backend";

type PulseProfile = {
  serves_on_premise?: boolean;
  premise_address?: unknown;
};

export async function GET(request: Request) {
  const resolved = await resolvePartnerContext(request);
  if ("response" in resolved) return resolved.response;

  const response = await fetch(sellerUrl(resolved.context.seller_id, ""), {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const payload = (await readJson(response)) as
    | { pulse_profile?: PulseProfile; error?: string; detail?: string }
    | null;

  if (!response.ok) {
    return NextResponse.json(
      { error: backendError(payload, `settings_${response.status}`) },
      { status: response.status },
    );
  }

  return NextResponse.json({
    seller_id: resolved.context.seller_id,
    pulseProfile: payload?.pulse_profile ?? {
      serves_on_premise: false,
      premise_address: null,
    },
  });
}

export async function PATCH(request: Request) {
  const resolved = await resolvePartnerContext(request);
  if ("response" in resolved) return resolved.response;

  const input = (await request.json().catch(() => null)) as PulseProfile | null;
  const response = await fetch(sellerUrl(resolved.context.seller_id, "/pulse-profile"), {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      serves_on_premise: Boolean(input?.serves_on_premise),
      premise_address: input?.serves_on_premise ? input.premise_address : null,
    }),
  });
  const payload = (await readJson(response)) as
    | { pulse_profile?: PulseProfile; error?: string; detail?: string }
    | null;

  if (!response.ok || !payload?.pulse_profile) {
    return NextResponse.json(
      { error: backendError(payload, `settings_save_${response.status}`) },
      { status: response.status },
    );
  }

  return NextResponse.json({
    seller_id: resolved.context.seller_id,
    pulseProfile: payload.pulse_profile,
  });
}
