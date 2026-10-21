import { NextResponse } from "next/server";
import { backendError, backendUrl, readJson, resolvePartnerContext, sellerUrl } from "../backend";

type CheckoutProduct = {
  productId?: unknown;
  vertical?: unknown;
};

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cartItem(product: CheckoutProduct) {
  const productId = stringValue(product.productId);
  if (!productId) return null;

  if (product.vertical === "Lab") {
    return {
      kind: "PACKAGE",
      product_id: productId,
      addons: [],
    };
  }

  return {
    product_id: productId,
    qty: 1,
  };
}

export async function POST(request: Request) {
  const resolved = await resolvePartnerContext(request);
  if ("response" in resolved) return resolved.response;

  const input = (await request.json().catch(() => null)) as
    | {
        customerId?: unknown;
        products?: CheckoutProduct[];
      }
    | null;

  const customerId = stringValue(input?.customerId);
  const products = Array.isArray(input?.products) ? input.products : [];
  const items = products.map(cartItem).filter((item): item is NonNullable<typeof item> => item !== null);
  const verticals = new Set(products.map((product) => stringValue(product.vertical)).filter(Boolean));

  if (!customerId || !items.length) {
    return NextResponse.json({ error: "checkout_validation_error" }, { status: 400 });
  }

  if (verticals.size > 1) {
    return NextResponse.json({ error: "mixed_vertical_checkout_not_supported" }, { status: 400 });
  }

  const sellerId = resolved.context.seller_id;
  const supplementItems = new Map<string, { product_id: string; qty: number }>();
  if (verticals.has("Supplements")) {
    const catalogResponse = await fetch(sellerUrl(sellerId, "/catalog"), {
      headers: { Accept: "application/json" }, cache: "no-store",
    });
    const catalog = await readJson(catalogResponse) as { products?: { supplements?: Array<{ product_id: string }> } } | null;
    if (!catalogResponse.ok) {
      return NextResponse.json({ error: "supplement_catalog_unavailable" }, { status: 502 });
    }
    const allowed = new Set((catalog?.products?.supplements ?? []).map((product) => product.product_id));
    if (products.some((product) => !allowed.has(stringValue(product.productId)))) {
      return NextResponse.json({ error: "supplement_not_available_for_seller" }, { status: 400 });
    }
    for (const product of products) {
      const id = stringValue(product.productId);
      supplementItems.set(id, { product_id: id, qty: (supplementItems.get(id)?.qty ?? 0) + 1 });
    }
  }
  const response = await fetch(backendUrl("/checkout/intents"), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      seller_id: sellerId,
      platform: "b2b",
      customer_id: customerId,
      checkout_mode: "ASSISTED_CHECKOUT",
      checkout_surface: "ASSISTED_FLOW",
      start_step: verticals.has("Supplements") ? "addresses" : "members",
      cart: { items: verticals.has("Supplements") ? [...supplementItems.values()] : items },
      edit_policy: {
        members: "editable",
        addresses: "editable",
        timeslot: "editable",
        promo: "editable",
      },
      metadata: {
        source: "pulse_os",
        seller_id: sellerId,
        b2b_partner_name: resolved.context.seller?.display_name ?? sellerId,
      },
    }),
  });
  const payload = (await readJson(response)) as
    | {
        checkout_intent_id?: string;
        checkout_url?: string;
        expires_at?: string;
        error?: string;
        detail?: string;
      }
    | null;

  if (!response.ok || !payload?.checkout_url) {
    return NextResponse.json(
      { error: backendError(payload, `checkout_intent_${response.status}`) },
      { status: response.status },
    );
  }

  return NextResponse.json({
    checkoutIntentId: payload.checkout_intent_id,
    checkoutUrl: payload.checkout_url,
    expiresAt: payload.expires_at,
  });
}
