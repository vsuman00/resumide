-- PRIVILEGED MUTATING ROLLBACK-ONLY DRAFT. SQL UNPARSED/UNEXECUTED.
-- Separate DIRECT disposable synthetic fixture admission/function owner required.
-- Requires one eligible root with exactly 1001 synthetic canonical-key versions;
-- this fixed verifier fixture is NOT a supported-history limit. No storage,
-- provider, Auth, HTTP or real-object deletion call occurs. DB completion here
-- simulates a trusted removal receipt and does not prove physical cleanup.
begin;
set local statement_timeout='30s';
set local lock_timeout='1s';
set local idle_in_transaction_session_timeout='35s';
set local search_path='';
create function pg_temp.r17_assert(p_ok boolean,p_label text) returns void
language plpgsql set search_path='' as $$
begin if p_ok is not true then raise exception 'R17_FIXTURE_ASSERT: %',p_label using errcode='23514';end if;end;
$$;
create temporary table r17_work(item_id uuid primary key,resume_id uuid not null,storage_key text not null unique) on commit drop;
do $r17_cases$
declare owner_value uuid:=nullif(current_setting('resumide.r17_owner',true),'')::uuid;
 root_value uuid:=nullif(current_setting('resumide.r17_root',true),'')::uuid;
 cutoff_value timestamptz:=nullif(current_setting('resumide.r17_cutoff',true),'')::timestamptz;
 repair_root uuid:=nullif(current_setting('resumide.r17_repair_root',true),'')::uuid;
 function_owner name;root_row public.resumes%rowtype;version_row public.resume_versions%rowtype;
 first_item private.retention_items%rowtype;reply record;claimed_count integer;denied boolean;before_clocks jsonb;after_clocks jsonb;first_time timestamptz;first_completed_at timestamptz;metadata jsonb;
begin
 select rolname into function_owner from pg_catalog.pg_roles where oid=(select proowner from pg_catalog.pg_proc where oid=to_regprocedure('public.claim_expired_resume_objects(timestamp with time zone,integer)'));
 perform pg_temp.r17_assert(current_user=function_owner and owner_value is not null and root_value is not null and cutoff_value is not null and repair_root is not null
  and root_value<>repair_root,'separately_admitted_disposable_fixtures');
 metadata:=public.read_owned_ai_disposition_readiness();
 perform pg_temp.r17_assert(metadata->'schemaReady'='true'::jsonb and metadata->'exportExecutable'='false'::jsonb and metadata->'accessExecutable'='false'::jsonb,'current_exact_source_not_data_activation');
 select * into strict root_row from public.resumes where id=root_value and owner_id=owner_value and status='active';
 perform pg_temp.r17_assert((select count(*) from public.resume_versions where resume_id=root_value)=1001
  and not exists(select 1 from private.retention_items where resume_id=root_value),'actual_1001_version_unenrolled_root_required');
 perform pg_temp.r17_assert(not exists(select 1 from public.resumes r where r.id not in (root_value,repair_root)
  and ((r.status='active' and r.created_at<cutoff_value) or (r.status='deleted' and exists(select 1 from public.resume_versions v where v.resume_id=r.id)))),
  'no_unrelated_eligible_roots');
 -- repair_root is registered separately but not eligible until this block ends.
 perform pg_temp.r17_assert(exists(select 1 from public.resumes where id=repair_root and owner_id=owner_value and status='active' and created_at>=cutoff_value)
  and exists(select 1 from public.resume_versions where resume_id=repair_root)
  and not exists(select 1 from private.retention_items where resume_id=repair_root),'separate_future_historical_repair_fixture');
 select * into strict version_row from public.resume_versions where resume_id=root_value order by id limit 1;
 -- Active-source page_count remains a legitimate mutable diagnostic field.
 update public.resume_versions set page_count=coalesce(page_count,1) where id=version_row.id;
 denied:=false;
 begin update public.resume_versions set bytes=bytes+1 where id=version_row.id;
 exception when sqlstate '23514' then denied:=SQLERRM='RETENTION_VERSION_IDENTITY';end;
 perform pg_temp.r17_assert(denied,'immutable_version_file_binding');
 insert into pg_temp.r17_work select * from public.claim_expired_resume_objects(cutoff_value,1);
 perform pg_temp.r17_assert((select count(*) from pg_temp.r17_work)=1 and (select count(*) from private.retention_items where resume_id=root_value)=1,'one_key_enrollment_and_delivery_bound');
 select t.* into strict first_item from private.retention_items t join pg_temp.r17_work w on w.item_id=t.id;
 first_time:=first_item.created_at;
 select coalesce(jsonb_agg(to_jsonb(d) order by kind,analysis_id,operation_id),'[]'::jsonb) into before_clocks from private.owned_ai_operation_dispositions d where owner_id=owner_value and resume_id=root_value;
 perform pg_temp.r17_assert(public.complete_retention_item(first_item.id),'first_item_acknowledged');
 select completed_at into strict first_completed_at from private.retention_items where id=first_item.id;
 perform pg_temp.r17_assert(first_completed_at is not null,'actual_first_completion_timestamp');
 perform pg_temp.r17_assert(exists(select 1 from public.resumes where id=root_value and status='deleted')
  and (select count(*) from public.resume_versions where resume_id=root_value)=1001,'unenrolled_tail_prevents_parent_cascade');
 denied:=false;
 begin update public.resume_versions set page_count=coalesce(page_count,1) where id=version_row.id;
 exception when sqlstate '55P03' then denied:=SQLERRM='RETENTION_SOURCE_INACTIVE_OR_BUSY';end;
 perform pg_temp.r17_assert(denied,'actual_post_tombstone_version_update_denied');
 denied:=false;
 begin insert into public.resume_versions(id,resume_id,organization_id,owner_id,storage_key,checksum,bytes,media_type)
  values(gen_random_uuid(),root_value,root_row.organization_id,owner_value,'no-guessed-object-key',repeat('a',64),1,'application/pdf');
 exception when sqlstate '55P03' then denied:=SQLERRM='RETENTION_SOURCE_INACTIVE_OR_BUSY';end;
 perform pg_temp.r17_assert(denied,'actual_post_tombstone_version_insert_denied');
 denied:=false;
 begin update public.resumes set status='active' where id=root_value;
 exception when sqlstate '23514' then denied:=SQLERRM='RETENTION_ROOT_TOMBSTONE';end;
 perform pg_temp.r17_assert(denied,'existing_root_cannot_revive');
 denied:=false;
 begin update public.resumes set status=null where id=root_value;
 exception when sqlstate '23514' then denied:=SQLERRM='RETENTION_ROOT_TOMBSTONE';end;
 perform pg_temp.r17_assert(denied,'null_does_not_bypass_tombstone');
 delete from pg_temp.r17_work;
 insert into pg_temp.r17_work select * from public.claim_expired_resume_objects(cutoff_value,1000);
 get diagnostics claimed_count=row_count;
 perform pg_temp.r17_assert(claimed_count=1000 and (select count(*) from private.retention_items where resume_id=root_value)=1001
  and (select min(created_at) from private.retention_items where resume_id=root_value)=first_time,'deleted_root_backfills_all_1000_remaining_keys_without_clock_reset');
 select coalesce(jsonb_agg(to_jsonb(d) order by kind,analysis_id,operation_id),'[]'::jsonb) into after_clocks from private.owned_ai_operation_dispositions d where owner_id=owner_value and resume_id=root_value;
 perform pg_temp.r17_assert(after_clocks=before_clocks,'all_original_operation_clocks_unchanged');
 for reply in select * from pg_temp.r17_work order by item_id loop
  perform pg_temp.r17_assert(public.complete_retention_item(reply.item_id),'exact_owned_work_completed');
 end loop;
 perform pg_temp.r17_assert(not exists(select 1 from public.resumes where id=root_value)
  and not exists(select 1 from public.resume_versions where resume_id=root_value),'only_complete_actual_key_coverage_allows_cascade');
 perform pg_temp.r17_assert(public.complete_retention_item(first_item.id)
  and public.fail_retention_item(first_item.id,'STORAGE_DELETE_FAILED') is false
  and (select completed_at from private.retention_items where id=first_item.id) is not distinct from first_completed_at,'terminal_replay_and_late_failure_false');
 update public.resumes set status='deleted' where id=repair_root;
 denied:=false;
 begin perform public.claim_expired_resume_objects(cutoff_value,1);
 exception when sqlstate '23514' then denied:=SQLERRM='RETENTION_FIRST_CLOCK_REPAIR_REQUIRED';end;
 perform pg_temp.r17_assert(denied and not exists(select 1 from private.retention_items where resume_id=repair_root),'missing_historical_first_event_refuses_without_new_clock');
 -- Required separately authorized Native follow-up: real concurrent version
 -- INSERT/status tombstone, stale queued-read/other-complete/root-gone replay,
 -- foreign tenant/root/key collision, lock busy/retry, transaction rollback and
 -- removed-parent repair. This sequential draft is not concurrent/physical proof.
end;
$r17_cases$;
rollback;
