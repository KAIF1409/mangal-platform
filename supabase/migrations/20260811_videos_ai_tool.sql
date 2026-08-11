-- KaTube: Tools filter — which AI video-generation tool the creator used
-- (Sora, Kling, Runway, Pika, Hailuo, Veo, etc). Separate axis from
-- Category/genre. Run once in the Supabase SQL Editor.
alter table videos add column if not exists ai_tool text not null default 'Other';
