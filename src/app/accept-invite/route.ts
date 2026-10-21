// Keep previously emailed invitation URLs working. Clerk's existing components
// validate and redeem the ticket; this route only selects the appropriate page.
export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const status = params.get("__clerk_status");
  const ticket = params.get("__clerk_ticket");
  let location = "/sign-in";

  if (status === "complete") {
    location = "/";
  } else if (ticket && (status === "sign_up" || status === "sign_in")) {
    const query = new URLSearchParams({
      __clerk_status: status,
      __clerk_ticket: ticket,
    });
    location = `${status === "sign_up" ? "/sign-up" : "/sign-in"}?${query}`;
  }

  return new Response(null, {
    status: 303,
    headers: {
      Location: location,
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
