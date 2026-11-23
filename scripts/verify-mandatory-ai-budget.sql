-- PRIVILEGED, MUTATING, ROLLBACK-ONLY DRAFT. UNEXECUTED.
-- Requires the complete disposable migrated database. Never run against hosted/user data.
-- This verifies exact installed pins and checker drift, not provider execution or null-claim fixture behavior.
-- Actual replay/null-budget/late-accounting Native transaction fixtures remain separate acceptance.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';
do $mandatory_budget_verify$
declare item jsonb;p pg_catalog.pg_proc%rowtype;ddl text;
 manifest jsonb:=$mandatory_budget_expected$[{"signature":"public.claim_canonical_rewrite_dispatch(uuid,uuid,uuid,text,jsonb)","after":"08c3eedd3979e2a3287d5ab8dac9da876daa7c18ad5fdd848661c54949f1aa66"},{"signature":"public.claim_initial_feedback_dispatch(uuid,jsonb,uuid,uuid,text,jsonb)","after":"f7b45e9f59df53aa5324c6a62b2d800201c2d27b29eac5f76b3bc5a59c3f50a5"},{"signature":"private.canonical_rewrite_ready()","after":"b8f2c321599054fc5a05bdccdd15ebd8b3bd3bbdc8e7cf233c99cc01b205ffed"},{"signature":"private.canonical_rewrite_workspace_ready()","after":"bebf3463501e80ef81bf3cdd0bc95a9c263e5354f3fb38fdd8cac9589e098a4e"},{"signature":"private.initial_feedback_operation_ready()","after":"906f829eaa3b72c08ea64e4bf848d176118b10cbd7560c9517f5e415fde36579"},{"signature":"private.initial_feedback_ready()","after":"8172bbcf76eb371d34e34002d7bf485568f0ca6632446da50ba63a8787c578d7"},{"signature":"private.owned_legacy_ai_usage_ready()","after":"bf104476ada3f7425aa65a1c12a8023f5c43166dac2c27314905d7c7d8749c43"},{"signature":"private.ai_budget_source_ready()","after":"8ea2b83fbd6804a631d75e2e21816a0e3907bc7f9c09b30dc536c4b39e0b804e"},{"signature":"private.owned_ai_disposition_ready()","after":"342d370615d1c6076fe7e16c06e13ecfa45b428e971b56c860e6fd0f5a425bf5"}]$mandatory_budget_expected$::jsonb;
begin
 for item in select value from jsonb_array_elements(manifest) loop
  select * into strict p from pg_catalog.pg_proc where oid=to_regprocedure(item->>'signature');
  if private.ifo_sha(p.prosrc) is distinct from item->>'after' then raise exception 'MANDATORY_BUDGET_PIN_MISMATCH';end if;
 end loop;
 if private.canonical_rewrite_ready() is not true or private.canonical_rewrite_workspace_ready() is not true
  or private.initial_feedback_operation_ready() is not true or private.initial_feedback_ready() is not true
  or private.owned_legacy_ai_usage_ready() is not true or private.ai_budget_source_ready() is not true
  or private.owned_ai_disposition_ready() is not true then raise exception 'MANDATORY_BUDGET_NOT_READY';end if;
 -- Nested exception rolls back the deliberate function-only mutation before final pin recheck.
 begin
  select * into strict p from pg_catalog.pg_proc where oid=to_regprocedure('public.claim_canonical_rewrite_dispatch(uuid,uuid,uuid,text,jsonb)');
  ddl:=replace(pg_get_functiondef(p.oid),p.prosrc,p.prosrc||E'\n-- synthetic checker drift\n');execute ddl;
  if private.canonical_rewrite_ready() is not false then raise exception 'MANDATORY_BUDGET_DRIFT_ACCEPTED';end if;
  raise exception 'MANDATORY_BUDGET_ROLLBACK_FIXTURE' using errcode='P0B01';
 exception when sqlstate 'P0B01' then null;
 end;
 for item in select value from jsonb_array_elements(manifest) loop
  if (select private.ifo_sha(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure(item->>'signature')) is distinct from item->>'after'
   then raise exception 'MANDATORY_BUDGET_FIXTURE_NOT_RESTORED';end if;
 end loop;
end;
$mandatory_budget_verify$;
rollback;
