-- §0/Phase 1 "Unique for Mangal" — extend mangal_ideas for the 3-source
-- design (WebMangal story-demand, Kalpana Circle audience idea, company).
--
-- NOTE: this was applied live via Supabase MCP in an earlier session but
-- never committed as a migration file — adding it now so the repo matches
-- the live DB (checked against the live schema before writing this file).

alter table mangal_ideas drop constraint if exists mangal_ideas_type_check;
alter table mangal_ideas add constraint mangal_ideas_type_check
  check (type in ('company', 'story_demand', 'audience'));

alter table mangal_ideas add column if not exists source_post_id uuid references kcircle_posts(id) on delete cascade;
alter table mangal_ideas add column if not exists link_url text;

-- audience rows must carry their source post (the "connection link" target);
-- story_demand rows already require series_id via the existing constraint.
alter table mangal_ideas drop constraint if exists mangal_ideas_audience_has_post;
alter table mangal_ideas add constraint mangal_ideas_audience_has_post
  check (type <> 'audience' or source_post_id is not null);

create index if not exists mangal_ideas_source_post_idx on mangal_ideas(source_post_id);
