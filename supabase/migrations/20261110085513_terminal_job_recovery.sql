-- R11 FORWARD source only: safe terminal metadata recovery, not AI retry.
-- Global recovery/claim must never be exercised on a shared verification target.
begin;
create function public.recover_terminal_analysis_jobs_v2(p_limit integer)
returns integer language plpgsql volatile security definer set search_path='' as $$
declare candidate record; a public.analyses%rowtype; j public.analysis_jobs%rowtype;
  checked_at timestamptz; recovered integer:=0;
begin
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'Invalid recovery limit' using errcode='22023'; end if;
  for candidate in
    select a.id from public.analyses a join public.analysis_jobs j on j.analysis_id=a.id
    where j.dead_lettered_at is null and ((j.lease_owner is null and j.lease_expires_at is null) or j.lease_expires_at<=clock_timestamp())
      and (a.status in ('completed','partial','rejected','failed')
        or (a.status in ('quarantined','queued','extracting','needs_ocr','scoring','qualitative_review')
          and private.analysis_job_v2_review_handoff(a.id)))
      and not private.candidate_write_blocked(a.owner_id)
      and exists(select 1 from public.memberships m where m.organization_id=a.organization_id and m.user_id=a.owner_id and m.role in ('owner','admin','member'))
      and exists(select 1 from public.resume_versions v join public.resumes r on r.id=v.resume_id
        where v.id=a.resume_version_id and v.organization_id=a.organization_id and v.owner_id=a.owner_id
          and r.organization_id=a.organization_id and r.owner_id=a.owner_id and r.status='active')
    order by j.run_after,a.id limit p_limit for update of a skip locked
  loop
    select * into a from public.analyses where id=candidate.id;
    select * into j from public.analysis_jobs where analysis_id=a.id for update skip locked;
    if not found then continue; end if;
    if not private.analysis_job_v2_owner_eligible(a.id) then continue; end if;
    checked_at:=clock_timestamp();
    if j.dead_lettered_at is not null or (j.lease_expires_at is null and j.lease_owner is not null)
      or (j.lease_expires_at is not null and j.lease_expires_at>checked_at) then continue; end if;
    if a.status='failed' then
      -- Preserve attempt/error/fence history. No retry, deletion or status rewrite.
      update public.analysis_jobs set lease_owner=null,lease_expires_at=null,dead_lettered_at=checked_at,
        last_error_code=coalesce(last_error_code,'TERMINAL_FAILURE') where analysis_id=a.id;
      recovered:=recovered+1;
    elsif a.status in ('completed','partial','rejected')
      or (a.status in ('quarantined','queued','extracting','needs_ocr','scoring','qualitative_review')
        and private.analysis_job_v2_review_handoff(a.id)) then
      -- NULL-fence legacy leftovers are eligible; live/uncertain leases never are.
      delete from public.analysis_jobs where analysis_id=a.id;
      recovered:=recovered+1;
    end if;
  end loop;
  return recovered;
end;
$$;
revoke all on function public.recover_terminal_analysis_jobs_v2(integer) from public,anon,authenticated,service_role;
grant execute on function public.recover_terminal_analysis_jobs_v2(integer) to service_role;

-- Bind the exact R19-transformed v2 claim body; retain signature, attributes,
-- grants, fences and retry semantics. Recovery runs only on the opt-in v2 path.
do $patch$
declare function_oid regprocedure:=to_regprocedure('public.claim_analysis_job_v2(text,integer)');
  body text; definition text;
  old_text text:=$old$  -- Both the expired sweep and candidate selection acquire analysis first.$old$;
  new_text text:=$new$  perform public.recover_terminal_analysis_jobs_v2(100);
  -- Both the expired sweep and candidate selection acquire analysis first.$new$;
begin
  if function_oid is null then raise exception 'RECOVERY_FUNCTION_DRIFT' using errcode='23514'; end if;
  select p.prosrc into body from pg_catalog.pg_proc p where p.oid=function_oid;
  if encode(extensions.digest(convert_to(body,'UTF8'),'sha256'),'hex')<>'6e9b3adef2af8a0b1272041699aab6e2ce11733afee24263d6d758d6d01ac8e8'
    or (length(body)-length(replace(body,old_text,'')))/length(old_text)<>1 then
    raise exception 'RECOVERY_FUNCTION_DRIFT' using errcode='23514'; end if;
  definition:=pg_get_functiondef(function_oid);
  if (length(definition)-length(replace(definition,body,'')))/length(body)<>1 then
    raise exception 'RECOVERY_FUNCTION_DRIFT' using errcode='23514'; end if;
  execute replace(definition,body,replace(body,old_text,new_text));
end;
$patch$;
commit;
