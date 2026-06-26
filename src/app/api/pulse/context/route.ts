import { NextResponse } from "next/server";
import { resolvePartnerContext } from "../backend";

export async function GET(request: Request) {
  const resolved = await resolvePartnerContext(request);
  if ("response" in resolved) return resolved.response;

  return NextResponse.json(resolved.context);
}
