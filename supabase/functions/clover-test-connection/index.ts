// Edge function: clover-test-connection
// Verifies the admin-saved Clover creds against Clover's API and stamps
// clover_connection.connected = true on success.

import {
  corsHeaders,
  json,
  requireAdminCaller,
  requireCloverCreds,
  cloverTestConnection,
} from "../_shared/clover.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const { admin, error } = await requireAdminCaller(req);
  if (error) return error;

  try {
    const creds = await requireCloverCreds(admin);
    const merchant = await cloverTestConnection(creds);
    await admin.from("clover_connection").update({ connected: true }).eq("id", true);
    return json({ ok: true, merchant });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message ?? String(e) }, 500);
  }
});
