-- Honk goes national: adding schools to a database that already has rows in it.
--
-- `npm run db:push` diffs the schema straight onto the database, which is the
-- right tool for a change that only adds columns. It is the wrong tool for this
-- one, because two of these columns are NOT NULL with no sensible default and
-- one unique constraint has to be rebuilt around a value that must be computed
-- from the data already there. Push would either fail or, worse, drop the old
-- constraint and leave nothing enforcing section identity.
--
-- So: run this once, then `npm run db:push` to confirm it reports no diff.
-- Idempotent — running it twice is a no-op.
--
--   psql "$DATABASE_URL" -f scripts/migrate-schools.sql
--
-- On a fresh database, skip it entirely; `db:push` builds the right shape.

begin;

-- ---------------------------------------------------------------------------
-- 1. Everything already in here is Waterloo.
-- ---------------------------------------------------------------------------

alter table users    add column if not exists school_id text not null default 'waterloo';
alter table courses  add column if not exists school_id text not null default 'waterloo';
alter table sections add column if not exists school_id text not null default 'waterloo';

-- ---------------------------------------------------------------------------
-- 2. Section identity moves from a class number to a text key.
--
-- Quest's class number is still the key where there is one, so every existing
-- row keeps exactly the identity it had and nobody's classmates change.
-- ---------------------------------------------------------------------------

alter table sections add column if not exists section_key text;

update sections
   set section_key = class_number::text
 where section_key is null
   and class_number is not null;

-- A row with neither is impossible before this migration (class_number was NOT
-- NULL), but a partial re-run could produce one and a NOT NULL below would then
-- fail with nothing explaining why.
delete from sections where section_key is null;

alter table sections alter column section_key  set not null;
alter table sections alter column class_number drop not null;

-- ---------------------------------------------------------------------------
-- 3. Swap the unique constraints for their school-scoped versions.
-- ---------------------------------------------------------------------------

alter table courses  drop constraint if exists courses_subject_catalog_key;
alter table sections drop constraint if exists sections_term_class_key;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'courses_school_subject_catalog_key') then
    alter table courses add constraint courses_school_subject_catalog_key
      unique (school_id, subject, catalog);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sections_school_term_key') then
    alter table sections add constraint sections_school_term_key
      unique (school_id, term_code, section_key);
  end if;
end $$;

commit;

-- ---------------------------------------------------------------------------
-- Rolling back
--
-- Only safe while every row is still Waterloo. Once a second school has pasted
-- anything, `class_number` is null for its sections and the old constraint
-- cannot be rebuilt — restore from a Neon branch instead.
-- ---------------------------------------------------------------------------
