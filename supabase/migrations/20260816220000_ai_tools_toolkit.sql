-- §41 — Affiliate "AI Toolkit" page for creators, trimmed scope: only the
-- two categories that already had affiliate programs researched
-- (WebMangal art/writing tools, KaTube video/voice tools). The third
-- category from the original idea (Kalpana Circle community/growth tools)
-- is intentionally left out — no tools were researched/confirmed for it,
-- so it stays backlog rather than shipping with fabricated or unresearched
-- entries. Add a 'kcircle' row later once that research is actually done;
-- the `product` column already accepts it, no migration needed to add it.
--
-- 1. ai_tools — curated list, data-driven (not hardcoded in a component)
-- so a new deal/tool can be added with an insert, no code push. Per §41's
-- own plan item 1.

create table if not exists ai_tools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  product text not null check (product in ('webmangal', 'katube', 'kcircle')),
  category text not null, -- e.g. 'Video generation', 'Voice/dubbing', 'Writing assistant'
  description text not null,
  affiliate_url text,      -- null = list it free/unmonetized rather than skip it (e.g. Midjourney)
  is_affiliate boolean not null default false, -- drives the "Sponsored" label — only true when affiliate_url actually earns commission
  icon text,                -- lucide-react icon name, resolved client-side
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists ai_tools_product_idx on ai_tools(product) where active;

-- Public read (this is a browse/reference list, same shape as `tags`), no
-- public write — only curated server-side/admin inserts, same reasoning as
-- `tags_authenticated_insert` being restricted: don't let arbitrary rows
-- get added from the client.
alter table ai_tools enable row level security;

drop policy if exists "ai_tools_public_read" on ai_tools;
create policy "ai_tools_public_read" on ai_tools
  for select using (active);

-- 2. tool_clicks — §41 plan item 2, internal-only analytics (which tool,
-- which user, when) separate from whatever tracking the affiliate network
-- itself does, so we can see real usage before negotiating the next batch
-- of deals. Insert-only from the client (logs a click as it happens); no
-- select policy on purpose — this isn't surfaced in-app yet, read via the
-- Supabase dashboard/SQL directly, same as most other "internal reporting"
-- needs on this project so far. Revisit with a developer-role-gated read
-- policy if/when this needs a UI.

create table if not exists tool_clicks (
  id uuid primary key default gen_random_uuid(),
  tool_id uuid not null references ai_tools(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  clicked_at timestamptz not null default now()
);

create index if not exists tool_clicks_tool_id_idx on tool_clicks(tool_id);

alter table tool_clicks enable row level security;

drop policy if exists "tool_clicks_authenticated_insert" on tool_clicks;
create policy "tool_clicks_authenticated_insert" on tool_clicks
  for insert to authenticated with check (user_id = auth.uid());

-- 3. Seed data — only the tools §41's research actually confirmed. Rates/
-- program status are as of that research pass; re-verify before relying on
-- them for a real payout, affiliate terms change. No fabricated links —
-- affiliate_url is left null (is_affiliate = false) until the real
-- referral link is generated after applying to each program (§41 plan
-- item 3), so nothing here goes live pointing at a fake/generic URL.

insert into ai_tools (name, product, category, description, affiliate_url, is_affiliate, icon, sort_order) values
  ('ElevenLabs', 'katube', 'Voice / dubbing', 'AI voice generation and dubbing for anime-style video narration. Recurring commission program (22% for 12 months) once you have a real referral link.', null, true, 'AudioLines', 10),
  ('Murf', 'katube', 'Voice / dubbing', 'AI voiceover tool, longest recurring commission window researched (20% for 24 months) once you have a real referral link.', null, true, 'Mic', 20),
  ('Descript', 'katube', 'Video editing', 'AI-assisted video/audio editing with an affiliate program confirmed available.', null, true, 'Scissors', 30),
  ('InVideo', 'katube', 'Video generation', 'AI video generation tool with a confirmed affiliate program.', null, true, 'Clapperboard', 40),
  ('Veed', 'katube', 'Video editing', 'AI-assisted video editing/subtitling with a confirmed affiliate program.', null, true, 'Video', 50),
  ('HeyGen', 'katube', 'Video generation', 'AI avatar/video generation tool with a confirmed affiliate program.', null, true, 'Video', 60),
  ('Synthesia', 'katube', 'Video generation', 'AI video generation with a confirmed affiliate program.', null, true, 'Video', 70),
  ('Runway', 'katube', 'Video generation', 'AI video generation — paid affiliate rate is behind a login, but has a public in-app referral option.', null, true, 'Film', 80),
  ('Midjourney', 'webmangal', 'Art / illustration', 'AI image generation for covers and panels. No public affiliate program as of research — listed as a free useful tool, not a revenue link.', null, false, 'Image', 10),
  ('Canva', 'webmangal', 'Art / illustration', 'Design tool useful for covers/thumbnails. Affiliate program currently closed to new applicants — listed as a free useful tool, not a revenue link.', null, false, 'PenTool', 20)
on conflict do nothing;
