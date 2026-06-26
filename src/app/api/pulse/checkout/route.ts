import { NextResponse } from "next/server";
import { backendError, backendUrl, readJson, resolvePartnerContext } from "../backend";

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
      start_step: "members",
      cart: { items },
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
