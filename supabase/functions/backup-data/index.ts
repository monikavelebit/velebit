// Weekly automated backup — reads every key in kv_store, bundles it into
// one JSON file (same shape as the manual "Export data" button in Settings),
// and uploads it to a private Storage bucket called "backups".
//
// Runs on a schedule via pg_cron (see backup_schedule.sql) — nothing needs
// to be open in the browser for this to happen.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "backups";
const KEEP_LAST = 12; // retain the most recent 12 weekly backups (~3 months), then quietly prune older ones

// Needed so the browser (the portal's "Backup now" button) is allowed to
// call this function directly — the weekly cron call doesn't go through a
// browser, so it never needed this, which is why it worked before while
// the button didn't.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Browsers send a preflight OPTIONS request before the real one — must
  // answer it or the browser blocks the actual call from ever going out.
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Pull every velebit:* key currently in the table
    const { data: rows, error: readErr } = await supabase
      .from("kv_store")
      .select("key, value");
    if (readErr) throw readErr;

    const bundle = {};
    for (const row of rows || []) bundle[row.key] = row.value;
    bundle["exportedAt"] = new Date().toISOString();
    bundle["exportType"] = "automatic-weekly-backup";

    const filename = `backup-${new Date().toISOString().slice(0, 10)}-${Date.now()}.json`;
    const json = JSON.stringify(bundle, null, 2);

    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(filename, new Blob([json], { type: "application/json" }), {
        contentType: "application/json",
        upsert: false,
      });
    if (uploadErr) throw uploadErr;

    // Prune old backups beyond the retention window, oldest first
    const { data: existing, error: listErr } = await supabase.storage
      .from(BUCKET)
      .list("", { sortBy: { column: "created_at", order: "asc" } });
    if (!listErr && existing && existing.length > KEEP_LAST) {
      const toDelete = existing.slice(0, existing.length - KEEP_LAST).map((f) => f.name);
      if (toDelete.length) await supabase.storage.from(BUCKET).remove(toDelete);
    }

    return new Response(JSON.stringify({ ok: true, filename }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
