-- DRAFT / UNPARSED / UNEXECUTED. Read-only pre-schema emptiness check only.
-- Requires a separately owner-admitted fresh managed project and executor binding.
-- Counts/session settings cannot prove project identity or exclusive use.
-- Refuse a nonempty or drifted target; never reset, delete, drop or repair it.
begin transaction isolation level repeatable read read only;
set local statement_timeout='15s';
set local lock_timeout='1s';
set local idle_in_transaction_session_timeout='20s';
set local search_path='';
-- A filtered RLS view must fail rather than masquerade as empty. This is not a bypass grant.
set local row_security=off;

do $empty_target$
declare history_rows bigint;
begin
  if current_setting('server_version_num')::integer not between 170000 and 179999 then
    raise exception 'EMPTY_TARGET_POSTGRES_MAJOR_MISMATCH' using errcode='23514';
  end if;
  if to_regclass('auth.users') is null or to_regclass('storage.objects') is null
    or to_regclass('storage.buckets') is null then
    raise exception 'EMPTY_TARGET_REQUIRED_MANAGED_TABLE_MISSING' using errcode='23514';
  end if;
  if (select count(*) from pg_catalog.pg_class p
    where p.oid in (to_regclass('auth.users'),to_regclass('storage.objects'),to_regclass('storage.buckets'))
      and p.relkind='r')<>3 then
    raise exception 'EMPTY_TARGET_MANAGED_RELATION_KIND_MISMATCH' using errcode='23514';
  end if;
  if (select count(*) from auth.users)<>0 then
    raise exception 'EMPTY_TARGET_AUTH_USERS_PRESENT' using errcode='23514';
  end if;
  if (select count(*) from storage.objects)<>0 then
    raise exception 'EMPTY_TARGET_STORAGE_OBJECTS_PRESENT' using errcode='23514';
  end if;
  if (select count(*) from storage.buckets)<>0 then
    raise exception 'EMPTY_TARGET_STORAGE_BUCKETS_PRESENT' using errcode='23514';
  end if;
  if exists(select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','private') and c.relkind in ('r','p','f','m')) then
    raise exception 'EMPTY_TARGET_APPLICATION_RELATIONS_PRESENT' using errcode='23514';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    if exists(select 1 from pg_catalog.pg_class p
      where p.oid=to_regclass('supabase_migrations.schema_migrations') and p.relkind<>'r') then
      raise exception 'EMPTY_TARGET_MIGRATION_HISTORY_KIND_MISMATCH' using errcode='23514';
    end if;
    -- Fixed literal only: presence is checked before resolving this optional table.
    execute 'select count(*) from supabase_migrations.schema_migrations' into history_rows;
    if history_rows<>0 then
      raise exception 'EMPTY_TARGET_MIGRATION_HISTORY_PRESENT' using errcode='23514';
    end if;
  end if;
end;
$empty_target$;

-- Reached only after every aggregate/metadata guard succeeds in this snapshot.
select jsonb_build_object(
  'schemaVersion','empty-supabase-target-preflight/1.0.0',
  'status','empty',
  'postgresMajor',17,
  'counts',jsonb_build_object('authUsers',0,'storageObjects',0,'storageBuckets',0,
    'applicationRelations',0,'migrationHistoryRows',0),
  'externalIsolationProved',false
) as target_preflight;
rollback;
