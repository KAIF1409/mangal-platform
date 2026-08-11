-- KaTube: Categories filter — genre-topic chip row (matches YouTube's
-- topic-pill row / DramaBox's "Categories" tab, per founder reference
-- screenshots). Run once in the Supabase SQL Editor.
alter table videos add column if not exists category text not null default 'Trailers';
