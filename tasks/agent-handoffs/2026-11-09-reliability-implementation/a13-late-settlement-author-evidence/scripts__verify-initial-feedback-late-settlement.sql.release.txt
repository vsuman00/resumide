-- PRIVILEGED MUTATING ROLLBACK-ONLY. SQL UNPARSED/UNEXECUTED.
-- Requires separately admitted isolated DIRECT synthetic target/function owner,
-- exact95258 source/profile pins and a real factory-created deterministic-only
-- publication whose actual claimed attempt is held_unknown with a fixed error.
-- Settings select that owned fixture; they do not authorize execution. No SDK,
-- synthetic table injection, app grants, broad account purge or hold refund.
-- This tests a real parent cascade, not the entire privacy worker/ADR0020 expiry.
begin;
set local statement_timeout='15s';
set local lock_timeout='1s';
set local idle_in_transaction_session_timeout='20s';
set local search_path='';
create function pg_temp.late_assert(p_ok boolean,p_label text) returns void
language plpgsql set search_path='' as $$
begin if p_ok is not true then raise exception 'INITIAL_FEEDBACK_LATE_FIXTURE_ASSERT: %',p_label using errcode='23514';end if;end;
$$;
do $late_cases$
declare owner_value uuid:=nullif(current_setting('resumide.late_settlement_owner',true),'')::uuid;
 analysis_value uuid:=nullif(current_setting('resumide.late_settlement_analysis',true),'')::uuid;
 op private.initial_feedback_operations%rowtype;att private.initial_feedback_attempts%rowtype;pub private.initial_feedback_publications%rowtype;
 before_op jsonb;before_claim jsonb;known_usage jsonb:='{"inputTokens":"13","outputTokens":"2"}';reply jsonb;again jsonb;
 denied boolean;function_owner name;metadata jsonb;
begin
 select rolname into function_owner from pg_catalog.pg_roles where oid=(select proowner from pg_catalog.pg_proc
  where oid=to_regprocedure('public.settle_initial_feedback_attempt(uuid,uuid,text,jsonb,text)'));
 perform pg_temp.late_assert(current_user=function_owner and owner_value is not null and analysis_value is not null,'isolated_owner_fixture_required');
 metadata:=public.read_initial_feedback_readiness();
 perform pg_temp.late_assert(metadata->'schemaReady'='true'::jsonb and metadata->'settleExecutable'='false'::jsonb
  and metadata->'claimExecutable'='false'::jsonb,'staged_exact_source_not_activation');
 select * into strict op from private.initial_feedback_operations where analysis_id=analysis_value and owner_id=owner_value for update;
 select * into strict pub from private.initial_feedback_publications where operation_id=op.operation_id and id=op.publication_id
  and analysis_id=analysis_value and owner_id=owner_value and organization_id=op.organization_id and state='deterministic_only' for key share;
 select * into strict att from private.initial_feedback_attempts where operation_id=op.operation_id and attempt_id=pub.attempt_id for update;
 perform pg_temp.late_assert(op.state='published' and att.state='held_unknown' and att.usage is null and att.error_code is not null
  and att.claimed_at is not null and private.legacy_scoring_lease(att.claim_lease)
  and exists(select 1 from public.analyses where id=analysis_value and owner_id=owner_value and organization_id=op.organization_id and status='partial'),
  'actual_published_unknown_partial_required');
 before_op:=to_jsonb(op);before_claim:=to_jsonb(att)-array['usage','state'];
 -- The actual FK cascade removes candidate result/empty writer/input/publication.
 -- Technical operation/attempt metadata must remain; no private publication DELETE.
 delete from public.analyses where id=analysis_value and owner_id=owner_value;
 perform pg_temp.late_assert(not exists(select 1 from private.initial_feedback_publications where id=pub.id)
  and not exists(select 1 from private.analysis_scoring_inputs where analysis_id=analysis_value)
  and not exists(select 1 from public.writer_drafts where analysis_id=analysis_value)
  and exists(select 1 from private.initial_feedback_operations where operation_id=op.operation_id)
  and exists(select 1 from private.initial_feedback_attempts where attempt_id=att.attempt_id),'actual_content_cascade_metadata_survives');
 reply:=public.settle_initial_feedback_attempt(op.operation_id,att.attempt_id,op.binding_sha256,known_usage,att.error_code);
 perform pg_temp.late_assert(reply->>'state'='failed' and reply->'usage'=known_usage and reply->>'errorCode'=att.error_code
  and reply->'replayed'='false'::jsonb and (select to_jsonb(o)=before_op from private.initial_feedback_operations o where operation_id=op.operation_id)
  and (select to_jsonb(t)-array['usage','state']=before_claim from private.initial_feedback_attempts t where attempt_id=att.attempt_id)
  and not exists(select 1 from private.initial_feedback_publications where id=pub.id),'late_known_after_content_cascade');
 again:=public.settle_initial_feedback_attempt(op.operation_id,att.attempt_id,op.binding_sha256,known_usage,att.error_code);
 perform pg_temp.late_assert(again->'replayed'='true'::jsonb and again->'usage'=known_usage,'exact_known_replay_no_second_accounting');
 again:=public.settle_initial_feedback_attempt(op.operation_id,att.attempt_id,op.binding_sha256,null,null);
 perform pg_temp.late_assert(again->'replayed'='true'::jsonb and again->'usage'=known_usage,'null_cannot_clear_known');
 denied:=false;
 begin perform public.settle_initial_feedback_attempt(op.operation_id,att.attempt_id,op.binding_sha256,'{"inputTokens":"14","outputTokens":"2"}',att.error_code);
 exception when sqlstate 'P0C01' then denied:=true;end;
 perform pg_temp.late_assert(denied,'changed_known_denied');
 denied:=false;
 begin perform public.settle_initial_feedback_attempt(op.operation_id,att.attempt_id,op.binding_sha256,known_usage,
  case when att.error_code='cancelled' then 'provider_failed' else 'cancelled' end);
 exception when sqlstate 'P0C01' then denied:=true;end;
 perform pg_temp.late_assert(denied,'changed_error_denied');
 denied:=false;
 begin perform public.claim_initial_feedback_dispatch(analysis_value,att.claim_lease,op.operation_id,att.attempt_id,op.binding_sha256,null);
 exception when sqlstate '42501' or sqlstate 'P0C01' then denied:=true;end;
 perform pg_temp.late_assert(denied,'no_redispatch_after_cascade');
 -- No R03 settle is called by the mirror. A held R03 unknown attempt still
 -- needs its separately admitted reconciliation; no null→zero or expiry refund.
end;
$late_cases$;
-- OPEN: actual role/lock/worker-deletion/race behavior, counter retirement,
-- bounded30-day expiry, linked R03/account/export/Auth/session/restore adoption.
set constraints all immediate;
rollback;
