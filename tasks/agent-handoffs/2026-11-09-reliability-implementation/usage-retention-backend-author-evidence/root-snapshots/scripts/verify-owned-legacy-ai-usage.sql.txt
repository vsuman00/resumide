-- PRIVILEGED MUTATING ROLLBACK-ONLY DRAFT. SQL UNPARSED/UNEXECUTED.
-- Separately admitted disposable synthetic fixture and function owner required.
-- No storage/provider call. Completion simulates an independently verified
-- removal receipt and does not prove actual object erasure or Native races.
-- resumide.usage_fixture JSON: ownerId,organizationId,retiringRootId,
-- keptAnalysisId,cutoff,since,withinRunSince. Retiring root has one version and
-- two unlinked runs with distinct IDs, identical input_hash, 50 known tokens
-- EACH in the actual current UTC month; withinRunSince includes exactly one.
begin;
set local statement_timeout='30s';set local lock_timeout='1s';set local idle_in_transaction_session_timeout='35s';set local search_path='';
create function pg_temp.usage_assert(ok boolean,label text) returns void language plpgsql set search_path='' as $$
begin if ok is not true then raise exception 'USAGE_FIXTURE_ASSERT: %',label using errcode='23514';end if;end;
$$;
do $usage_cases$
declare f jsonb:=nullif(current_setting('resumide.usage_fixture',true),'')::jsonb;owner_value uuid;org_value uuid;root_value uuid;function_owner name;
 reply jsonb;before_total bigint;after_total bigint;first_clock timestamptz;first_copies jsonb;work record;item_value uuid;n integer:=0;
begin
 select rolname into function_owner from pg_catalog.pg_roles where oid=(select proowner from pg_catalog.pg_proc where oid=to_regprocedure('public.get_organization_ai_tokens_used(uuid,timestamp with time zone)'));
 perform pg_temp.usage_assert(current_user=function_owner and f is not null,'separate_disposable_fixture_admission');
 owner_value:=(f->>'ownerId')::uuid;org_value:=(f->>'organizationId')::uuid;root_value:=(f->>'retiringRootId')::uuid;
 reply:=public.read_owned_legacy_ai_usage_readiness();perform pg_temp.usage_assert(reply->'schemaReady'='true'::jsonb and reply->'exportExecutable'='false'::jsonb,'actual_schema_data_export_still_denied');
 perform pg_temp.usage_assert((select count(*) from public.analysis_ai_runs r join public.analyses a on a.id=r.analysis_id join public.resume_versions v on v.id=a.resume_version_id where v.resume_id=root_value)=2,'two_actual_run_ids');
 perform pg_temp.usage_assert((select count(distinct r.input_hash) from public.analysis_ai_runs r join public.analyses a on a.id=r.analysis_id join public.resume_versions v on v.id=a.resume_version_id where v.resume_id=root_value)=1,'same_hash_different_runs_fixture');
 before_total:=public.get_organization_ai_tokens_used(org_value,(f->>'since')::timestamptz);perform pg_temp.usage_assert(before_total=100,'known_100_before_erase');
 perform pg_temp.usage_assert(public.get_organization_ai_tokens_used(org_value,(f->>'withinRunSince')::timestamptz)=50,'arbitrary_since_selects_one_actual_creation');
 reply:=public.read_initial_feedback_usage(owner_value,(f->>'keptAnalysisId')::uuid);perform pg_temp.usage_assert(reply->>'legacyUnlinkedTokens'='100' and reply->>'unknownClaims'='0','shared_before_current_month_100');
 -- Fixture admission must ensure only the retiring root is eligible at cutoff.
 perform pg_temp.usage_assert(not exists(select 1 from public.resumes r where r.id<>root_value and (r.status='deleted' or r.created_at<(f->>'cutoff')::timestamptz)),'no_other_eligible_roots');
 for work in select * from public.claim_expired_resume_objects((f->>'cutoff')::timestamptz,1) loop
  n:=n+1;perform pg_temp.usage_assert(work.resume_id=root_value,'exact_fixture_root');item_value:=work.item_id;
 end loop;
 perform pg_temp.usage_assert(n=1,'one_exact_storage_item');select min(created_at) into first_clock from private.retention_items where resume_id=root_value;
 perform pg_temp.usage_assert(public.complete_retention_item(item_value),'simulated_confirmed_storage_receipt');
 perform pg_temp.usage_assert(not exists(select 1 from public.resumes where id=root_value),'actual_final_root_delete');
 perform pg_temp.usage_assert((select count(*) from private.owned_legacy_ai_usage_retirements where resume_id=root_value)=2,'both_actual_run_id_contributions_captured');
 perform pg_temp.usage_assert(not exists(select 1 from private.owned_legacy_ai_usage_retirements where resume_id=root_value and (prepared_at<>first_clock or expires_at<>first_clock+interval '720 hours')),'first_clock_not_completion_time');
 after_total:=public.get_organization_ai_tokens_used(org_value,(f->>'since')::timestamptz);perform pg_temp.usage_assert(after_total=before_total,'known_100_conserved_after_erase');
 perform pg_temp.usage_assert(public.get_organization_ai_tokens_used(org_value,(f->>'withinRunSince')::timestamptz)=50,'arbitrary_since_preserved_after_erase');
 reply:=public.read_initial_feedback_usage(owner_value,(f->>'keptAnalysisId')::uuid);perform pg_temp.usage_assert(reply->>'legacyUnlinkedTokens'='100' and reply->>'unknownClaims'='0','shared_after_current_month_100');
 select jsonb_agg(to_jsonb(t) order by run_id) into first_copies from private.owned_legacy_ai_usage_retirements t where resume_id=root_value;
 perform pg_temp.usage_assert(public.complete_retention_item(item_value),'terminal_completion_idempotent');
 perform pg_temp.usage_assert((select jsonb_agg(to_jsonb(t) order by run_id) from private.owned_legacy_ai_usage_retirements t where resume_id=root_value)=first_copies,'no_redebit_or_clock_rewrite');
 reply:=public.export_owned_legacy_ai_usage_records(owner_value);perform pg_temp.usage_assert(jsonb_array_length(reply->'records')=2,'mandatory_owner_records_present');
 -- Remaining separately admitted Native cases: account prepare/cascade; A12/A13
 -- compatibility (Oct claim/Nov run), removed A13 publication and exact surviving
 -- retirement proof; missing typed usage; live/retained owner/org/time/counter
 -- drift; two-session late child INSERT/FK locks; eligible due row on day31;
 -- role/catalogue corruption, atomic rollback and real physical object cleanup.
end;
$usage_cases$;
rollback;
