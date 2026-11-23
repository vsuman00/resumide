-- PRIVILEGED MUTATING ROLLBACK-ONLY DRAFT. SQL UNPARSED/UNEXECUTED.
-- A separately admitted DIRECT synthetic target/function owner must supply real
-- publication/claim/deletion fixtures and exact storage-cleanup admission.
-- Settings below select existing fixtures; they are NOT permission to run.
-- No SDK, granted data RPC, clock override, backfill or trigger weakening.
-- The bad-link case is separately admitted privileged corruption metadata;
-- it is not evidence that an ordinary producer can create a malformed link.
begin;
set local statement_timeout='20s';
set local lock_timeout='1s';
set local idle_in_transaction_session_timeout='25s';
set local search_path='';
create function pg_temp.retirement_assert(p_ok boolean,p_label text) returns void
language plpgsql set search_path='' as $$
begin if p_ok is not true then raise exception 'RETIREMENT_FIXTURE_ASSERT: %',p_label using errcode='23514';end if;end;
$$;
do $retirement_cases$
declare probe_owner uuid:=nullif(current_setting('resumide.retirement_probe_owner',true),'')::uuid;
 probe_analysis uuid:=nullif(current_setting('resumide.retirement_probe_analysis',true),'')::uuid;
 deletion_id uuid:=nullif(current_setting('resumide.retirement_deletion_request',true),'')::uuid;
 deletion_worker text:=nullif(current_setting('resumide.retirement_deletion_worker',true),'');
 account_op uuid:=nullif(current_setting('resumide.retirement_account_operation',true),'')::uuid;
 unknown_op uuid:=nullif(current_setting('resumide.retirement_unknown_operation',true),'')::uuid;
 retention_op uuid:=nullif(current_setting('resumide.retirement_source_operation',true),'')::uuid;
 retention_item uuid:=nullif(current_setting('resumide.retirement_retention_item',true),'')::uuid;
 bad_analysis uuid:=nullif(current_setting('resumide.retirement_bad_link_probe_analysis',true),'')::uuid;
 missing_op uuid:=nullif(current_setting('resumide.retirement_missing_proof_operation',true),'')::uuid;
 account private.initial_feedback_operations%rowtype;unknown_value private.initial_feedback_operations%rowtype;
 retained private.initial_feedback_operations%rowtype;attempt_value private.initial_feedback_attempts%rowtype;
 a public.analyses%rowtype;before_value jsonb;after_value jsonb;export_value jsonb;metadata jsonb;ignored jsonb;
 denied boolean;function_owner name;
begin
 select rolname into function_owner from pg_catalog.pg_roles where oid=(select proowner from pg_catalog.pg_proc
  where oid=to_regprocedure('public.read_initial_feedback_usage(uuid,uuid)'));
 perform pg_temp.retirement_assert(current_user=function_owner and probe_owner is not null and probe_analysis is not null
  and deletion_id is not null and deletion_worker is not null and account_op is not null and unknown_op is not null
  and retention_op is not null and retention_item is not null and bad_analysis is not null and missing_op is not null,
  'separate_direct_target_and_fixture_admission');
 -- Actual CHECK/ACL/catalog reconciliation remains an admission prerequisite.
 metadata:=public.read_owned_ai_retirement_readiness();
 perform pg_temp.retirement_assert(metadata->'schemaReady'='true'::jsonb and metadata->'exportExecutable'='false'::jsonb
  and not has_function_privilege('service_role','public.export_owned_ai_retirement_records(uuid)','EXECUTE'),
  'separate_export_not_existing_exportExecutable');
 select * into strict a from public.analyses where id=probe_analysis and owner_id=probe_owner;
 select * into strict account from private.initial_feedback_operations where operation_id=account_op and state='published';
 select * into strict unknown_value from private.initial_feedback_operations where operation_id=unknown_op and owner_id=account.owner_id and state='published';
 select * into strict retained from private.initial_feedback_operations where operation_id=retention_op and state='published';
 perform pg_temp.retirement_assert(account.owner_id<>probe_owner and retained.owner_id<>account.owner_id
  and account.organization_id=a.organization_id and retained.organization_id=a.organization_id
  and exists(select 1 from private.initial_feedback_publications where id=account.publication_id and state='assessed')
  and exists(select 1 from private.initial_feedback_publications where id=unknown_value.publication_id and state='deterministic_only'),
  'same_org_surviving_probe');
 select * into strict attempt_value from private.initial_feedback_attempts where operation_id=unknown_op and state='held_unknown'
  and claimed_at is not null and usage is null and error_code is not null;
 before_value:=public.read_initial_feedback_usage(probe_owner,probe_analysis);
 perform pg_temp.retirement_assert(attempt_value.claimed_at>=(before_value->>'periodStart')::date::timestamp at time zone 'UTC'
  and attempt_value.claimed_at<(before_value->>'periodEnd')::date::timestamp at time zone 'UTC','actual_current_unknown_claim');
 ignored:=public.prepare_deletion_request(deletion_id,deletion_worker);
 perform pg_temp.retirement_assert(not exists(select 1 from private.initial_feedback_publications where operation_id in (account_op,unknown_op))
  and exists(select 1 from private.initial_feedback_content_retirements where operation_id=account_op and publication_id=account.publication_id)
  and exists(select 1 from private.initial_feedback_content_retirements where operation_id=unknown_op and publication_id=unknown_value.publication_id),
  'real_account_producer_captures_before_cascade');
 after_value:=public.read_initial_feedback_usage(probe_owner,probe_analysis);
 perform pg_temp.retirement_assert(after_value=before_value,'retirement_does_not_change_usage_or_unknown_holds');
 perform public.settle_initial_feedback_attempt(unknown_op,attempt_value.attempt_id,unknown_value.binding_sha256,
  '{"inputTokens":"7","outputTokens":"5"}'::jsonb,attempt_value.error_code);
 after_value:=public.read_initial_feedback_usage(probe_owner,probe_analysis);
 perform pg_temp.retirement_assert((after_value->>'initialFeedbackTokens')::numeric=(before_value->>'initialFeedbackTokens')::numeric+12
  and (after_value->>'unknownClaims')::numeric=(before_value->>'unknownClaims')::numeric-1
  and not exists(select 1 from private.initial_feedback_publications where operation_id=unknown_op),
  'published_unknown_late_fill_after_content_delete');
 before_value:=after_value;
 perform pg_temp.retirement_assert(public.complete_retention_item(retention_item),'actual_retention_item_completed');
 perform pg_temp.retirement_assert(not exists(select 1 from private.initial_feedback_publications where operation_id=retention_op)
  and exists(select 1 from private.initial_feedback_content_retirements where operation_id=retention_op and publication_id=retained.publication_id),
  'real_retention_producer_captures_before_cascade');
 perform pg_temp.retirement_assert(public.read_initial_feedback_usage(probe_owner,probe_analysis)=before_value,'retention_preserves_exact_partition');
 export_value:=public.export_owned_ai_retirement_records(account.owner_id);
 perform pg_temp.retirement_assert(export_value->>'schemaVersion'='owned-ai-retirement-export/1.0.0'
  and exists(select 1 from jsonb_array_elements(export_value->'retirements') x where x->>'operation_id'=account_op::text)
  and not exists(select 1 from jsonb_array_elements(export_value->'retirements') x where x->>'owner_id'<>account.owner_id::text),
  'owner_wide_retirement_export_after_source_membership_delete');
 denied:=false;
 begin
  delete from private.initial_feedback_publications where operation_id=missing_op;
  perform public.read_initial_feedback_usage(probe_owner,probe_analysis);
 exception when sqlstate 'P0C03' then denied:=true;end;
 perform pg_temp.retirement_assert(denied,'no_publication_without_exact_proof');
 -- The previous block's exception rolls back only its deliberate corruption.
 denied:=false;
 begin perform public.read_initial_feedback_usage(probe_owner,bad_analysis);
 exception when sqlstate 'P0C03' then denied:=true;end;
 perform pg_temp.retirement_assert(denied,'full_legacy_run_corruption_refused');
 denied:=false;
 begin update private.initial_feedback_content_retirements set binding_sha256=repeat('0',64) where operation_id=account_op;
 exception when sqlstate 'P0C01' then denied:=true;end;
 perform pg_temp.retirement_assert(denied,'immutable_retirement_cannot_forge_link');
end;
$retirement_cases$;
set constraints all immediate;
rollback;
-- OPEN: actual SQL compilation, CHECK/ACL/roles, two-session nonblocking locks,
-- cascade/rollback and physical artifact removal; no Native success is claimed.
-- Node exportOwned43aff still rejects missing publications until its separately
-- owned paired adapter validates this actual separate proof. No omission fallback.
-- ADR0020 immutable deadline/expiry/Auth/session/restore remain unimplemented.
