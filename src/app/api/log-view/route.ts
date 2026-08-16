import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Server-only client. Uses the anon key (same permissions the browser had) —
// increment_series_views is SECURITY DEFINER so it can update series.views
// and insert into view_events regardless. Running this on the server (not
// the browser) is what lets us read Vercel's edge geo header below.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { seriesId } = await req.json();
    if (!seriesId || typeof seriesId !== 'string') {
      return NextResponse.json({ error: 'seriesId required' }, { status: 400 });
    }

    // Vercel sets this header at the edge for every request — no IP address
    // is ever read or stored, just the two-letter country it resolved to.
    const countryCode = req.headers.get('x-vercel-ip-country') || null;

    const { error } = await supabase.rpc('increment_series_views', {
      series_id_input: seriesId,
      country_input: countryCode,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
