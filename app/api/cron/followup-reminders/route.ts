/**
 * Legacy compatibility endpoint.
 *
 * Follow-up due dates are intentionally evaluated on a relevant Brands list
 * refresh, rather than by an autonomous scheduler. Keeping this endpoint
 * harmless means an old deployment schedule cannot create notifications.
 */
function response() {
  return Response.json({
    ok: true,
    mode: "list-refresh",
    processed: 0,
    message: "No scheduled notifications are sent. Refresh Brands to evaluate due work.",
  });
}

export async function POST() {
  return response();
}

export async function GET() {
  return response();
}
