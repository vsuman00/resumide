-- DRAFT / NOT RUN. Read-only catalog verification, not behavioral acceptance.
-- Match only the separately approved exact target/bridge packet. No migration
-- replay, job claim, candidate fixture, provider action or index DDL belongs here.
-- Expected bridge: 20261110101800, a54196112e51a5109ccc143ac20887568bec2e7021dd98328312ba615d69d418.
begin read only;
set local statement_timeout = '10s';
set local lock_timeout = '1s';
set local idle_in_transaction_session_timeout = '15s';
set local search_path = '';

with expected(signature,argument_names,result_type,body_sha256) as (values
  ('public.transition_analysis(uuid,text,text,uuid,text,text)',
    array['p_analysis_id','p_expected_status','p_next_status','p_actor_id','p_process_id','p_request_id'],
    'boolean'::regtype,'eefd6814879dabe72de6dc15f355edcc57fd37c1271e0a162621479754b59ffd'),
  ('public.release_analysis_job(uuid,text,integer,text)',
    array['p_analysis_id','p_worker_id','p_retry_delay_seconds','p_error_code'],
    'boolean'::regtype,'750798339f61230201c162a824f4b858a0d189dbd9cc03afbf2528a5d4edd190'),
  ('public.cancel_analysis(uuid,uuid,text)',
    array['p_analysis_id','p_user_id','p_request_id'],
    'text'::regtype,'777e7bd2ccb838e3764104b85ba8f9ed9491da9750a746c2c36545ea72ed379b')
), routine_facts as (
  select e.signature,e.body_sha256,p.oid is not null as present,
    encode(extensions.digest(convert_to(p.prosrc,'UTF8'),'sha256'),'hex') as actual_body_sha256,
    coalesce(p.prokind='f' and not p.proretset and p.prorettype=e.result_type
      and p.proargnames is not distinct from e.argument_names and p.proargmodes is null
      and p.pronargdefaults=0 and p.provariadic=0 and p.prosecdef and p.provolatile='v'
      and cardinality(p.proconfig)=1
      and exists(select 1 from pg_options_to_table(p.proconfig) where option_name='search_path' and option_value in ('','""'))
      and not exists(select 1 from pg_catalog.pg_proc other where other.pronamespace=p.pronamespace and other.proname=p.proname and other.oid<>p.oid)
      and has_function_privilege('service_role',p.oid,'EXECUTE')
      and not has_function_privilege('anon',p.oid,'EXECUTE')
      and not has_function_privilege('authenticated',p.oid,'EXECUTE')
      and not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        where a.privilege_type='EXECUTE' and (a.grantee not in (p.proowner,(select oid from pg_catalog.pg_roles where rolname='service_role'))
          or (a.grantee=(select oid from pg_catalog.pg_roles where rolname='service_role') and a.is_grantable))),false) as attributes_match
  from expected e left join pg_catalog.pg_proc p on p.oid=to_regprocedure(e.signature)
), run_indexes as (
  select i.*,c.relname,c.relkind,c.reloptions,c.relispartition,am.amname,
    array(select a.attname::text from unnest(i.indkey::smallint[]) with ordinality k(attnum,n)
      join pg_catalog.pg_attribute a on a.attrelid=i.indrelid and a.attnum=k.attnum
      where k.n<=i.indnkeyatts order by k.n) as key_columns,
    exists(select 1 from pg_catalog.pg_constraint where conindid=i.indexrelid) as constraint_backed,
    encode(extensions.digest(convert_to(pg_get_indexdef(i.indexrelid,0,false),'UTF8'),'sha256'),'hex') as definition_sha256
  from pg_catalog.pg_index i join pg_catalog.pg_class c on c.oid=i.indexrelid
    join pg_catalog.pg_am am on am.oid=c.relam
  where i.indrelid=to_regclass('public.analysis_ai_runs')
), identity_facts as (
  select
    exists(select 1 from run_indexes where indisprimary and indisvalid and indisready and indislive
      and indnkeyatts=1 and indnatts=1 and key_columns=array['id']
      and exists(select 1 from pg_catalog.pg_attribute where attrelid=indrelid and attname='id' and atttypid='uuid'::regtype and attnotnull)) as run_id_primary_key,
    not exists(select 1 from run_indexes where indisunique and not indisprimary) as no_nonprimary_uniqueness,
    to_regclass('public.analysis_ai_runs_analysis_input_key') is null as historical_name_absent,
    exists(select 1 from run_indexes
      where indexrelid=to_regclass('public.analysis_ai_runs_analysis_input_key')
        and relkind='i' and amname='btree' and reloptions is null and not relispartition
        and indisunique and indisvalid and indisready and indislive and indimmediate
        and not indisprimary and not indisexclusion and not indnullsnotdistinct
        and indnkeyatts=2 and indnatts=2 and indexprs is null and indpred is null
        and key_columns=array['analysis_id','input_hash'] and not constraint_backed
        and definition_sha256='30236673e1cd5e8824e051a7c7e3fbe3ad19d2318cc79115527321a53c3f6968') as exact_historical_shape
)
select jsonb_build_object(
  'schemaVersion','legacy-worker-compatibility/1.0.0',
  'evidenceTier','READ_ONLY_CATALOG_ONLY',
  'postBridgeMetadataMatches',
    (select bool_and(present and attributes_match and actual_body_sha256=body_sha256) from routine_facts)
      and f.run_id_primary_key and f.no_nonprimary_uniqueness and f.historical_name_absent,
  'routines',(select jsonb_agg(jsonb_build_object('signature',signature,'present',present,
    'expectedBodySha256',body_sha256,'actualBodySha256',actual_body_sha256,'attributesMatch',attributes_match) order by signature) from routine_facts),
  'runIdentity',jsonb_build_object('uuidPrimaryKey',f.run_id_primary_key,
    'noNonprimaryUniqueIndex',f.no_nonprimary_uniqueness,'historicalNameAbsent',f.historical_name_absent,
    'knownHistoricalShapeMatches',f.exact_historical_shape,
    'ddlAuthorization','NOT_GRANTED_BY_THIS_REPORT'),
  'runIndexes',(select coalesce(jsonb_agg(jsonb_build_object('name',relname,'primary',indisprimary,
    'unique',indisunique,'valid',indisvalid,'ready',indisready,'keyColumns',key_columns,
    'partial',indpred is not null,'expression',indexprs is not null,'constraintBacked',constraint_backed,
    'definitionSha256',definition_sha256) order by relname),'[]'::jsonb) from run_indexes),
  'behavioralAcceptance','NOT_TESTED',
  'transactionRaceAcceptance','NOT_TESTED'
) as compatibility_metadata
from identity_facts f;

rollback;
