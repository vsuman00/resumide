-- PRIVILEGED MUTATING ROLLBACK-ONLY DRAFT. SQL UNPARSED/UNEXECUTED.
-- Requires a separately admitted DIRECT disposable synthetic target/function
-- owner, exact fixture inventory and cleanup. No service/provider/storage call.
-- Fixture selectors below are not authorization. No clock override or trigger
-- weakening. This does not prove concurrent transactions, Auth removal or purge.
begin;
set local statement_timeout='20s';
set local lock_timeout='1s';
set local idle_in_transaction_session_timeout='25s';
set local search_path='';
create function pg_temp.disposition_assert(p_ok boolean,p_label text) returns void
language plpgsql set search_path='' as $$
begin if p_ok is not true then raise exception 'DISPOSITION_FIXTURE_ASSERT: %',p_label using errcode='23514';end if;end;
$$;
do $disposition_cases$
declare owner_value uuid:=nullif(current_setting('resumide.disposition_owner',true),'')::uuid;
 request_value uuid:=nullif(current_setting('resumide.disposition_request',true),'')::uuid;
 worker_value text:=nullif(current_setting('resumide.disposition_worker',true),'');
 root_owner uuid:=nullif(current_setting('resumide.disposition_root_owner',true),'')::uuid;
 root_value uuid:=nullif(current_setting('resumide.disposition_root',true),'')::uuid;
 cutoff_value timestamptz:=nullif(current_setting('resumide.disposition_cutoff',true),'')::timestamptz;
 function_owner name;metadata jsonb;before_budget jsonb;after_budget jsonb;before_clock jsonb;after_clock jsonb;
 ignored jsonb;access_value jsonb;export_value jsonb;item record;denied boolean;n integer;expected integer;
begin
 select rolname into function_owner from pg_catalog.pg_roles where oid=(select proowner from pg_catalog.pg_proc
  where oid=to_regprocedure('public.prepare_deletion_request(uuid,text)'));
 perform pg_temp.disposition_assert(current_user=function_owner and owner_value is not null and request_value is not null
   and worker_value is not null and root_owner is not null and root_value is not null and cutoff_value is not null
   and root_owner<>owner_value,'separately_admitted_disposable_owner_fixtures');
 metadata:=public.read_owned_ai_disposition_readiness();
 perform pg_temp.disposition_assert(metadata->'schemaReady'='true'::jsonb and metadata->'exportExecutable'='false'::jsonb
   and metadata->'accessExecutable'='false'::jsonb,'real_source_ready_both_data_capabilities_staged');
 perform pg_temp.disposition_assert(not has_function_privilege('service_role','public.read_candidate_privacy_access(uuid)','EXECUTE')
   and not has_function_privilege('service_role','public.export_owned_ai_disposition_records(uuid)','EXECUTE'),'no_data_activation');
 select jsonb_build_object('operations',(select coalesce(jsonb_agg(to_jsonb(o) order by o.id),'[]'::jsonb)
  from private.ai_budget_operations o where o.user_id=owner_value),'attempts',(select coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]'::jsonb)
  from private.ai_budget_attempts a join private.ai_budget_operations o on o.id=a.operation_id where o.user_id=owner_value)) into before_budget;
 -- The fixture must contain all three surfaces, including unpublished/reserved.
 perform pg_temp.disposition_assert(exists(select 1 from private.ai_budget_operations where user_id=owner_value)
  and exists(select 1 from private.canonical_rewrite_operations where owner_id=owner_value and state='reserved')
  and exists(select 1 from private.initial_feedback_operations where owner_id=owner_value and publication_id is null),
  'actual_owned_reserved_and_unpublished_fixture_required');
 ignored:=public.prepare_deletion_request(request_value,worker_value);
 select to_jsonb(a) into strict before_clock from private.owned_ai_deletion_dispositions a where a.owner_id=owner_value;
 perform pg_temp.disposition_assert((before_clock->>'expires_at')::timestamptz=(before_clock->>'prepared_at')::timestamptz+interval '720 hours'
  and private.candidate_write_blocked(owner_value),'actual_first_preparation_clock_and_barrier');
 ignored:=public.prepare_deletion_request(request_value,worker_value);
 select to_jsonb(a) into strict after_clock from private.owned_ai_deletion_dispositions a where a.owner_id=owner_value;
 perform pg_temp.disposition_assert(after_clock=before_clock,'retry_cannot_move_first_request_or_clock');
 select jsonb_build_object('operations',(select coalesce(jsonb_agg(to_jsonb(o) order by o.id),'[]'::jsonb)
  from private.ai_budget_operations o where o.user_id=owner_value),'attempts',(select coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]'::jsonb)
  from private.ai_budget_attempts a join private.ai_budget_operations o on o.id=a.operation_id where o.user_id=owner_value)) into after_budget;
 perform pg_temp.disposition_assert(after_budget=before_budget,'original_period_usage_unknown_holds_untouched');
 denied:=false;
 begin update public.data_requests set status='cancelled' where id=request_value;
 exception when sqlstate '42501' then denied:=true;end;
 perform pg_temp.disposition_assert(denied,'prepared_cancellation_race_authoritative_trigger');
 update public.data_requests set status='failed',lease_owner=null,lease_expires_at=null where id=request_value;
 access_value:=public.read_candidate_privacy_access(owner_value);
 perform pg_temp.disposition_assert(access_value->'deletionPrepared'='true'::jsonb and private.candidate_write_blocked(owner_value),
  'failed_bookkeeping_does_not_reopen_prepared_subject');
 denied:=false;
 begin update private.owned_ai_deletion_dispositions set expires_at=expires_at+interval '1 microsecond' where owner_id=owner_value;
 exception when sqlstate '23514' then denied:=true;end;
 perform pg_temp.disposition_assert(denied,'first_clock_immutable');
 export_value:=public.export_owned_ai_disposition_records(owner_value);
 perform pg_temp.disposition_assert(export_value->>'ownerId'=owner_value::text and jsonb_array_length(export_value->'accounts')=1
  and exists(select 1 from jsonb_array_elements(export_value->'operations') x where x->>'kind'='a12')
  and exists(select 1 from jsonb_array_elements(export_value->'operations') x where x->>'kind'='a13')
  and exists(select 1 from jsonb_array_elements(export_value->'operations') x where x->>'kind'='r03'),
  'whole_owner_capture_includes_unpublished_and_budget_records');
 -- Exact fixture admission must ensure this is the only eligible root. p_limit
 -- deliberately selects one version while accounting captures ALL root versions.
 select count(distinct r.id) into n from public.resumes r join public.resume_versions v on v.resume_id=r.id
  where r.status='active' and r.created_at<cutoff_value;
 perform pg_temp.disposition_assert(n=1 and exists(select 1 from public.resumes where id=root_value and owner_id=root_owner and status='active')
  and (select count(*) from public.resume_versions where resume_id=root_value and owner_id=root_owner)>=2,
  'one_eligible_multiversion_root_only_no_unrelated_retention');
 select count(*) into expected from private.initial_feedback_operations where owner_id=root_owner and resume_id=root_value;
 perform pg_temp.disposition_assert(expected>=2,'separate_versions_actual_feedback_operations_required');
 select * into strict item from public.claim_expired_resume_objects(cutoff_value,1);
 perform pg_temp.disposition_assert(item.resume_id=root_value and (select count(*) from private.owned_ai_operation_dispositions
   where owner_id=root_owner and kind='a13' and resume_id=root_value)=expected,
  'one_version_claim_captures_all_root_operations_before_storage_completion');
 perform pg_temp.disposition_assert(exists(select 1 from private.owned_ai_operation_dispositions where owner_id=root_owner and kind='a13'
  and resume_id=root_value and first_cause='resume_retirement' and retention_item_id=item.item_id
  and expires_at=prepared_at+interval '720 hours'),'first_root_item_exact_cause_and_720_hours');
 -- Intentionally do not complete the storage item: inherited physical cleanup
 -- coverage for versions omitted by p_limit is a separate R17 repair gate.
 -- Separate Native follow-up MUST exercise real concurrent prepare/claim/settle,
 -- rollback, malformed bindings, held-unknown linkage, late new-account capture,
 -- historical unavailable/repair export, permissions and whole-export bounds.
end;
$disposition_cases$;
rollback;
