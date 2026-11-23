-- Privacy producer generation/claim fence. SOURCE ONLY, SQL UNPARSED/UNEXECUTED.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';
set local search_path='';
alter table public.data_requests add column privacy_generation bigint check(privacy_generation>=0);
create table private.privacy_export_generation(singleton boolean primary key check(singleton),generation bigint not null check(generation>=0));
alter table private.privacy_export_generation enable row level security;
revoke all on private.privacy_export_generation from public,anon,authenticated,service_role;
-- This initializes a new owner-free protocol only; no old request receives an epoch.
insert into private.privacy_export_generation values(true,0);

create function private.privacy_generation_current() returns bigint
language plpgsql volatile set search_path='' as $generation_current$
declare value bigint;
begin
 if current_setting('transaction_isolation')<>'read committed'
  or not pg_try_advisory_xact_lock_shared(('x'||substr(private.ifo_sha('resumide:owned-ai-expiry-global:v1'),1,16))::bit(64)::bigint)
  then raise exception 'PRIVACY_GENERATION_RETRY' using errcode='55P03';end if;
 -- Separate VOLATILE post-lock command, never the caller's stale snapshot.
 select generation into value from private.privacy_export_generation where singleton;
 if value is null then raise exception 'PRIVACY_GENERATION_UNAVAILABLE' using errcode='P0P01';end if;
 return value;
end;
$generation_current$;

create function private.privacy_generation_advance(p_owner uuid) returns void
language plpgsql volatile set search_path='' as $generation_advance$
begin
 if private.privacy_generation_ready() is not true or p_owner is null
  or not (exists(select 1 from private.owned_ai_deletion_dispositions where owner_id=p_owner)
   or exists(select 1 from private.owned_ai_expiry_work where transaction_id=txid_current() and owner_id=p_owner))
  then raise exception 'PRIVACY_GENERATION_AUTHORITY' using errcode='23514';end if;
 if not pg_try_advisory_xact_lock(('x'||substr(private.ifo_sha('resumide:owned-ai-expiry-global:v1'),1,16))::bit(64)::bigint)
  then raise exception 'PRIVACY_GENERATION_RETRY' using errcode='55P03';end if;
 perform 1 from private.privacy_export_generation where singleton for update nowait;
 if not found then raise exception 'PRIVACY_GENERATION_UNAVAILABLE' using errcode='P0P01';end if;
 -- Do not wait in reverse order for a cancellation/completion holding one of these rows.
 perform 1 from public.data_requests where user_id=p_owner and kind='export' and result_manifest is not null order by id for update nowait;
 update private.privacy_export_generation set generation=generation+1 where singleton;
 update public.data_requests set result_manifest=null where user_id=p_owner and kind='export' and result_manifest is not null;
end;
$generation_advance$;

create function private.privacy_generation_claim(p_request uuid,p_worker text,p_attempt integer) returns public.data_requests
language plpgsql volatile set search_path='' as $generation_claim$
declare claimed public.data_requests%rowtype;
begin
 if p_attempt is null or p_attempt<1 or p_worker is null or btrim(p_worker)='' then return null;end if;
 select * into claimed from public.data_requests where id=p_request and status='processing' and lease_owner=p_worker
  and attempt_count=p_attempt and lease_expires_at>clock_timestamp() and privacy_generation is not null for update nowait;
 if not found then return null;end if;
 return claimed;
end;
$generation_claim$;

create function public.complete_privacy_request(p_request_id uuid,p_worker_id text,p_attempt integer,p_manifest jsonb) returns boolean
language plpgsql volatile security definer set search_path='' as $generation_complete$
declare claimed public.data_requests%rowtype;generation_now bigint;
begin
 if private.privacy_generation_ready() is not true then raise exception 'PRIVACY_GENERATION_UNAVAILABLE' using errcode='P0P01';end if;
 generation_now:=private.privacy_generation_current();
 claimed:=private.privacy_generation_claim(p_request_id,p_worker_id,p_attempt);
 if claimed.id is null then return false;end if;
 if claimed.kind='export' then
  if claimed.privacy_generation<>generation_now or p_manifest is null or jsonb_typeof(p_manifest)<>'object' then return false;end if;
 elsif p_manifest is distinct from jsonb_build_object('deleted',true) then return false;
 end if;
 update public.data_requests set status='completed',completed_at=clock_timestamp(),result_manifest=p_manifest,
  lease_owner=null,lease_expires_at=null,last_error_code=null where id=claimed.id;
 update public.privacy_request_steps set status='completed',completed_at=clock_timestamp() where request_id=claimed.id;
 delete from private.privacy_deletion_plans where request_id=claimed.id;
 return true;
end;
$generation_complete$;

create function public.fail_privacy_request(p_request_id uuid,p_worker_id text,p_attempt integer,p_error_code text,p_max_attempts integer) returns boolean
language plpgsql volatile security definer set search_path='' as $generation_fail$
declare claimed public.data_requests%rowtype;next_status text;
begin
 if private.privacy_generation_ready() is not true then raise exception 'PRIVACY_GENERATION_UNAVAILABLE' using errcode='P0P01';end if;
 if p_error_code is null or btrim(p_error_code)='' or p_max_attempts is null or p_max_attempts not between 1 and 10 then return false;end if;
 claimed:=private.privacy_generation_claim(p_request_id,p_worker_id,p_attempt);
 if claimed.id is null then return false;end if;
 next_status:=case when claimed.attempt_count>=p_max_attempts then 'failed' else 'queued' end;
 -- An old epoch may fail/rebuild its current claim, but cannot restamp it or save the old manifest.
 update public.data_requests set status=next_status,next_attempt_at=case when next_status='queued'
   then clock_timestamp()+make_interval(secs=>least(300,10*greatest(attempt_count,1))) else next_attempt_at end,
  lease_owner=null,lease_expires_at=null,last_error_code=p_error_code where id=claimed.id;
 update public.privacy_request_steps set status=case when next_status='failed' then 'failed' else 'queued' end,
  last_error_code=p_error_code,attempt_count=attempt_count+1 where request_id=claimed.id and status<>'completed';
 return true;
end;
$generation_fail$;

-- Close broad table AND explicit column write authority; RLS does not constrain service_role.
revoke insert,update,delete,truncate,references,trigger on public.data_requests from public,anon,authenticated,service_role;
do $generation_column_acl$
declare column_row record;
begin
 for column_row in select attname from pg_catalog.pg_attribute where attrelid='public.data_requests'::regclass and attnum>0 and not attisdropped loop
  execute format('revoke insert(%1$I),update(%1$I),references(%1$I) on public.data_requests from public,anon,authenticated,service_role',column_row.attname);
 end loop;
end;
$generation_column_acl$;
grant select on public.data_requests to service_role;
grant insert(id,organization_id,user_id,kind,status),update(status) on public.data_requests to service_role;

create function private.privacy_generation_counter_guard() returns trigger
language plpgsql volatile set search_path='' as $generation_counter_guard$
begin
 if tg_op<>'UPDATE' or new.singleton is distinct from old.singleton or new.generation is distinct from old.generation+1
  then raise exception 'PRIVACY_GENERATION_MONOTONIC' using errcode='23514';end if;
 return new;
end;
$generation_counter_guard$;
create trigger privacy_generation_counter_guard before insert or update or delete on private.privacy_export_generation for each row execute function private.privacy_generation_counter_guard();

create function private.privacy_generation_status_guard() returns trigger
language plpgsql volatile set search_path='' as $generation_status_guard$
declare trusted_owner oid;caller oid;
begin
 select relowner into trusted_owner from pg_catalog.pg_class where oid=tg_relid;
 select oid into caller from pg_catalog.pg_roles where rolname=current_user;
 -- SECURITY INVOKER distinguishes the fixed definer producers from direct service DML.
 if caller=trusted_owner then return new;end if;
 if tg_op='INSERT' then
  if new.status='queued' and new.attempt_count=0 and new.lease_owner is null and new.lease_expires_at is null
   and new.privacy_generation is null and new.result_manifest is null and new.completed_at is null then return new;end if;
 elsif old.status='queued' and new.status='cancelled'
  and (to_jsonb(new)-'status'-'updated_at') is not distinct from (to_jsonb(old)-'status'-'updated_at') then return new;
 end if;
 raise exception 'PRIVACY_REQUEST_DIRECT_WRITE' using errcode='42501';
end;
$generation_status_guard$;
create trigger privacy_generation_status_guard before insert or update on public.data_requests for each row execute function private.privacy_generation_status_guard();

create table private.privacy_generation_catalogue_seal(singleton boolean primary key check(singleton),catalogue_sha256 text not null check(catalogue_sha256 collate "C" ~ '^[a-f0-9]{64}$'));
alter table private.privacy_generation_catalogue_seal enable row level security;
revoke all on private.privacy_generation_catalogue_seal from public,anon,authenticated,service_role;
create function private.privacy_generation_seal_closed() returns trigger
language plpgsql volatile set search_path='' as $generation_seal_closed$
begin raise exception 'PRIVACY_GENERATION_SEAL_CLOSED' using errcode='23514';end;
$generation_seal_closed$;
