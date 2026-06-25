// supabase/functions/purge-cold-storage/index.ts
//
// Step 19 — completes the 180-day retention split. The delete-account route
// writes rows into deletion_cold_storage with a purge_after timestamp 180
// days out; this function runs on a schedule and deletes anything past that
// date, so the retention window is actually enforced rather than just
// documented in the privacy policy.
//
// DEPLOY:
//   supabase functions deploy purge-cold-storage --no-verify-jwt
//
// NOTE: --no-verify-jwt is required because this function is called with
// the new sb_secret_... key format, not a legacy JWT. Supabase's platform
// gateway only understands legacy JWTs for its built-in auth check, so
// without this flag every request gets rejected before this code even
// runs. Auth is instead handled manually below, by comparing the bearer
// token against SUPABASE_SERVICE_ROLE_KEY (auto-injected by the platform).
//
// SCHEDULE (run daily — Supabase Cron via pg_cron, or an external scheduler
// hitting this function's URL):
//   select cron.schedule(
//     'purge-cold-storage-daily',
//     '0 3 * * *',  -- 3am daily
//     $$
//     select net.http_post(
//       url := 'https://<your-project-ref>.supabase.co/functions/v1/purge-cold-storage',
//       headers := jsonb_build_object('Authorization', 'Bearer <service-role-key>')
//     );
//     $$
//   );

import { createClient } from 'jsr:@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  // Require the service role key as a bearer token so this can't be
  // triggered by an arbitrary public request.
  const authHeader = req.headers.get('Authorization');
  const expected = `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`;
  if (authHeader !== expected) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data: expired, error: selectError } = await supabase
    .from('deletion_cold_storage')
    .select('id')
    .lte('purge_after', new Date().toISOString());

  if (selectError) {
    return new Response(JSON.stringify({ error: selectError.message }), { status: 500 });
  }

  if (!expired || expired.length === 0) {
    return new Response(JSON.stringify({ purged: 0 }), { status: 200 });
  }

  const ids = expired.map((row: { id: string }) => row.id);
  const { error: deleteError } = await supabase
    .from('deletion_cold_storage')
    .delete()
    .in('id', ids);

  if (deleteError) {
    return new Response(JSON.stringify({ error: deleteError.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ purged: ids.length }), { status: 200 });
});