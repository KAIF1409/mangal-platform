-- K Circle: "Dreamer of the week" trigger fix — applied live as its own
-- migration in an earlier session. The working trigger this fix produced
-- is already included in full in 20260812182159_kcircle_dreamer_of_week.sql
-- (the pre-fix buggy version wasn't recoverable from the live project, only
-- the current function body), so this file is a no-op placeholder that
-- exists solely to keep this repo's migration version history aligned with
-- what `list_migrations` shows as applied on the live project.
select 1;
