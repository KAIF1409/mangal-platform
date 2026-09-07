-- Run ONLY in a disposable/staging Supabase database after the staged migration.
-- Example: psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -f <this file>
-- Requires an administrative test connection. All fixtures roll back.
begin;
insert into auth.users(id) values
  ('b0010000-0000-4000-8000-000000000001'),
  ('b0010000-0000-4000-8000-000000000002');
insert into public.books(id, author_id, title, file_url, file_type, status, publish_at) values
  ('b0020000-0000-4000-8000-000000000001', 'b0010000-0000-4000-8000-000000000001', 'Library released fixture', 'books/files/test.epub', 'epub', 'published', null),
  ('b0020000-0000-4000-8000-000000000002', 'b0010000-0000-4000-8000-000000000001', 'Library draft fixture', 'books/files/test.epub', 'epub', 'draft', null),
  ('b0020000-0000-4000-8000-000000000003', 'b0010000-0000-4000-8000-000000000001', 'Library scheduled fixture', 'books/files/test.epub', 'epub', 'published', now() + interval '1 day');
insert into public.book_vibes(book_id, vibe) values
  ('b0020000-0000-4000-8000-000000000001', 'cozy-rainy-day'),
  ('b0020000-0000-4000-8000-000000000002', 'cozy-rainy-day'),
  ('b0020000-0000-4000-8000-000000000003', 'cozy-rainy-day');

set local role anon;
do $$ begin
  if (select count(*) from public.book_vibes where book_id::text like 'b0020000-%') <> 1 then
    raise exception 'FAIL: unreleased vibes exposed';
  end if;
  begin
    perform public.save_book_reading_queue('{}', 0);
    raise exception 'FAIL: anonymous queue write allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.book_reading_queues;
    raise exception 'FAIL: anonymous queue read allowed';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0010000-0000-4000-8000-000000000001', true);
do $$ begin
  if public.save_book_reading_queue(array['b0020000-0000-4000-8000-000000000001']::uuid[], 0) <> 1 then
    raise exception 'FAIL: revision did not advance';
  end if;
  begin
    perform public.save_book_reading_queue('{}', 0);
    raise exception 'FAIL: stale revision accepted';
  exception when serialization_failure then null; end;
  begin
    perform public.save_book_reading_queue(array['b0020000-0000-4000-8000-000000000002']::uuid[], 1);
    raise exception 'FAIL: draft added';
  exception when insufficient_privilege then null; end;
  begin
    perform public.save_book_reading_queue(array['b0020000-0000-4000-8000-000000000003']::uuid[], 1);
    raise exception 'FAIL: scheduled book added';
  exception when insufficient_privilege then null; end;
  begin
    perform public.save_book_reading_queue(array[null::uuid]::uuid[], 1);
    raise exception 'FAIL: null queue element accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.save_book_reading_queue(array['b0020000-0000-4000-8000-000000000001', 'b0020000-0000-4000-8000-000000000001']::uuid[], 1);
    raise exception 'FAIL: duplicate queue accepted';
  exception when invalid_parameter_value then null; end;
  begin
    update public.book_reading_queues set revision = 99;
    raise exception 'FAIL: direct client writes allowed';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub', 'b0010000-0000-4000-8000-000000000002', true);
do $$ begin
  if exists(select 1 from public.book_reading_queues) then raise exception 'FAIL: another reader queue exposed'; end if;
  perform public.save_book_reading_queue('{}', 0);
  if (select count(*) from public.book_reading_queues) <> 1 then raise exception 'FAIL: own queue not visible'; end if;
end $$;
reset role;
rollback;