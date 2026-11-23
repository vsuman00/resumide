-- Existing authority schema must not be learned from drift during the new seal bootstrap.
lock table public.data_requests in access exclusive mode;
do $generation_preflight$
declare field jsonb;k record;owner_oid oid;
 expected jsonb:=$generation_old_columns$[
 ["id","uuid",true,true],["organization_id","uuid",true,false],["user_id","uuid",true,false],["kind","text",true,false],["status","text",true,true],
 ["created_at","timestamp with time zone",true,true],["updated_at","timestamp with time zone",true,true],["attempt_count","integer",true,true],
 ["next_attempt_at","timestamp with time zone",true,true],["lease_owner","text",false,false],["lease_expires_at","timestamp with time zone",false,false],
 ["last_error_code","text",false,false],["result_manifest","jsonb",false,false],["completed_at","timestamp with time zone",false,false]
 ]$generation_old_columns$::jsonb;
begin
 select proowner into owner_oid from pg_catalog.pg_proc where oid=to_regprocedure('public.persist_deterministic_analysis(uuid,text,jsonb,text,jsonb,text,text,text,text,jsonb,text,integer,text)');
 if owner_oid is null or not exists(select 1 from pg_catalog.pg_class where oid='public.data_requests'::regclass and relowner=owner_oid and relkind='r' and relrowsecurity)
  or (select count(*) from pg_catalog.pg_attribute where attrelid='public.data_requests'::regclass and attnum>0 and not attisdropped)<>14
  then raise exception 'PRIVACY_GENERATION_SCHEMA_PREIMAGE' using errcode='23514';end if;
 for field in select value from jsonb_array_elements(expected) loop
  if not exists(select 1 from pg_catalog.pg_attribute a where a.attrelid='public.data_requests'::regclass and a.attname=field->>0
   and a.atttypid=to_regtype(field->>1) and a.attnotnull=(field->>2)::boolean and a.atthasdef=(field->>3)::boolean and not a.attisdropped
   and a.attidentity='' and a.attgenerated='') then raise exception 'PRIVACY_GENERATION_COLUMN_PREIMAGE' using errcode='23514';end if;
 end loop;
 if (select pg_get_expr(d.adbin,d.adrelid) from pg_catalog.pg_attrdef d join pg_catalog.pg_attribute a on a.attrelid=d.adrelid and a.attnum=d.adnum
  where a.attrelid='public.data_requests'::regclass and a.attname='attempt_count') is distinct from '0'
  or (select count(*) from pg_catalog.pg_constraint where conrelid='public.data_requests'::regclass)<>6
  then raise exception 'PRIVACY_GENERATION_CONSTRAINT_PREIMAGE' using errcode='23514';end if;
 if exists(select 1 from pg_catalog.pg_constraint where conrelid='public.data_requests'::regclass and (not convalidated or condeferrable or condeferred))
  then raise exception 'PRIVACY_GENERATION_CONSTRAINT_PREIMAGE' using errcode='23514';end if;
 if not exists(select 1 from pg_catalog.pg_constraint c where c.conrelid='public.data_requests'::regclass and c.contype='p'
  and (select array_agg(a.attname::text order by v.ord) from unnest(c.conkey) with ordinality v(n,ord) join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=v.n)=array['id'])
  then raise exception 'PRIVACY_GENERATION_KEY_PREIMAGE' using errcode='23514';end if;
 for k in select * from (values ('organization_id','public.organizations'),('user_id','auth.users')) links(column_name,parent) loop
  if not exists(select 1 from pg_catalog.pg_constraint c where c.conrelid='public.data_requests'::regclass and c.contype='f' and c.confrelid=to_regclass(k.parent)
   and c.confdeltype='c' and c.confupdtype='a'
   and (select array_agg(a.attname::text order by v.ord) from unnest(c.conkey) with ordinality v(n,ord) join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=v.n)=array[k.column_name]
   and (select array_agg(a.attname::text order by v.ord) from unnest(c.confkey) with ordinality v(n,ord) join pg_catalog.pg_attribute a on a.attrelid=c.confrelid and a.attnum=v.n)=array['id'])
   then raise exception 'PRIVACY_GENERATION_FOREIGN_KEY_PREIMAGE' using errcode='23514';end if;
 end loop;
 -- Finite source-authored normalized forms; actual Native forms remain unverified until an authorized apply.
 if not exists(select 1 from pg_catalog.pg_constraint c where c.conrelid='public.data_requests'::regclass and c.contype='c'
   and translate(pg_get_expr(c.conbin,c.conrelid),E' ()\n\r\t','')='attempt_count>=0')
  or not exists(select 1 from pg_catalog.pg_constraint c where c.conrelid='public.data_requests'::regclass and c.contype='c'
   and translate(pg_get_expr(c.conbin,c.conrelid),E' ()\n\r\t','')=$generation_kind_form$kind=ANYARRAY['export'::text,'deletion'::text]$generation_kind_form$)
  or not exists(select 1 from pg_catalog.pg_constraint c where c.conrelid='public.data_requests'::regclass and c.contype='c'
   and translate(pg_get_expr(c.conbin,c.conrelid),E' ()\n\r\t','')=$generation_status_form$status=ANYARRAY['queued'::text,'processing'::text,'completed'::text,'failed'::text,'cancelled'::text]$generation_status_form$)
  then raise exception 'PRIVACY_GENERATION_CHECK_PREIMAGE' using errcode='23514';end if;
 for k in select * from (values ('serialize_deletion_request','private.serialize_deletion_request()',23),
  ('data_requests_set_updated_at','private.set_updated_at()',19),('initialize_privacy_request_steps','private.initialize_privacy_request_steps()',5)) triggers(name,signature,kind) loop
  if not exists(select 1 from pg_catalog.pg_trigger g where g.tgrelid='public.data_requests'::regclass and g.tgname=k.name and g.tgfoid=to_regprocedure(k.signature)
   and g.tgtype=k.kind and g.tgenabled='O' and not g.tgisinternal and not g.tgdeferrable and not g.tginitdeferred and g.tgnargs=0
   and g.tgargs=''::bytea and g.tgqual is null and g.tgoldtable is null and g.tgnewtable is null)
   then raise exception 'PRIVACY_GENERATION_TRIGGER_PREIMAGE' using errcode='23514';end if;
 end loop;
 if (select count(*) from pg_catalog.pg_trigger where tgrelid='public.data_requests'::regclass and not tgisinternal)<>3
  then raise exception 'PRIVACY_GENERATION_TRIGGER_PREIMAGE' using errcode='23514';end if;
end;
$generation_preflight$;
