from pathlib import Path
import re
w=Path('/Users/vaibhavsuman/.codex/worktrees/reliability-20261109-backend/resume_ats');p=w/'supabase/migrations/20261115081345_initial_feedback_publications.sql'
s=p.read_text().replace("'status','legacy_unbound','analysisId',a.id)","'status','legacy_unbound','analysisId',a.id,'reason','original_input_or_publication_missing')")
s=s.replace("'status','published','currentness',ctx->>'currentness'","'status','available','currentness',ctx->>'currentness'")
s=s.replace("or p_completion->>'reason' not in", "or jsonb_typeof(p_completion->'reason') is distinct from 'string' or p_completion->>'reason' not in")
s=s.replace("or failure->>'reason' not in", "or jsonb_typeof(failure->'reason') is distinct from 'string' or failure->>'reason' not in")
s=s.replace("and claimed_at is not null and claim_lease is not null));", "and claimed_at is not null and private.legacy_scoring_lease(claim_lease) is true));")
# Make summary absence Boolean correlation explicit, including null capture.
a=s.index(" if (summary<>'null'::jsonb) is distinct")
b=s.index(" if summary<>'null'::jsonb and",a)
s=s[:a]+" if (summary<>'null'::jsonb) is distinct from coalesce(observed_summary->>'state'='supported',false) then perform private.ifo_fail('invalid');end if;\n"+s[b:]
old=(w/'supabase/migrations/20261115072701_initial_feedback_operations.sql').read_text()
def fn(name):
 m=re.search(r'create function '+re.escape(name)+r'\([\s\S]*?\n\$(ifo_\d+)\$;',old);return m[0]
prepare=fn('public.prepare_initial_feedback').replace('create function','create or replace function',1)
prepare=prepare.replace('replayed_attempt private.initial_feedback_attempts%rowtype;','pub private.initial_feedback_publications%rowtype;replayed_attempt private.initial_feedback_attempts%rowtype;')
needle="    if private.legacy_scoring_static_job(a.id,p_lease) is not true and not exists"
idx=prepare.index(needle)
prepare=prepare[:idx]+'''    if op.state='published' then
      select * into pub from private.initial_feedback_publications where id=op.publication_id and operation_id=op.operation_id for key share skip locked;
      if not found then perform private.ifo_fail('unavailable');end if;
      if private.legacy_scoring_static_job(a.id,p_lease) is not true and pub.finish_lease is distinct from p_lease
        and not exists(select 1 from private.initial_feedback_attempts where operation_id=op.operation_id and claim_lease=p_lease)
        then perform private.ifo_fail('not_found');end if;
      if p_retry_after_attempt_id is not null and not exists(select 1 from private.initial_feedback_attempts where operation_id=op.operation_id and attempt_id=p_retry_after_attempt_id)
        then perform private.ifo_fail('stale');end if;
      return jsonb_build_object('schemaVersion','initial-feedback-prepare/1.0.0','status','published','operation',private.ifo_operation_json(op),
        'publication',private.ifpub_json(pub,true),'context',null,'dispatchAllowed',false,'replayed',true);
    end if;
'''+prepare[idx:]
settle=fn('public.settle_initial_feedback_attempt').replace('create function','create or replace function',1)
needle="  replayed:=(actual is null"
idx=settle.index(needle)
settle=settle[:idx]+'''  if att.state='published' then
    -- Saved assessed output cannot be converted into a technical failure.
    if p_error_code is not null then perform private.ifo_fail('stale');end if;
    return jsonb_build_object('schemaVersion','initial-feedback-settlement/1.0.0','operationId',op.operation_id,'attemptId',att.attempt_id,
      'bindingSha256',op.binding_sha256,'state','known','usage',att.usage,'errorCode',null,'replayed',true);
  end if;
  if op.state='published' and att.usage is null and att.error_code is null then perform private.ifo_fail('stale');end if;
'''+settle[idx:]
s+='\n-- Published replay is admitted before fresh lease/JD/consent/selection.\n'+prepare+'\n'+settle+'\n'
p.write_text(s)
