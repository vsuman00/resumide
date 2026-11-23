-- A12 forward compatibility source only; no native execution or activation.
-- The legacy score/evidence guards remain untouched. Canonical technical run
-- identity and known/null usage stay in the existing private operation ledger.
begin;
set local statement_timeout='10s';
set local lock_timeout='1s';
set local idle_in_transaction_session_timeout='15s';
set local search_path='';

create function public.read_canonical_rewrite_usage(p_user_id uuid,p_analysis_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $cr_usage_read$
declare a public.analyses%rowtype; period_start date; period_end date;
  legacy_tokens numeric; canonical_tokens numeric; unknown_claims bigint; values_valid boolean;
begin
  -- Derive the organization from an owned active source and current membership,
  -- never from a caller-supplied organization, date or claimed support flag.
  a:=private.canonical_rewrite_owner(p_user_id,p_analysis_id);
  if private.canonical_rewrite_ready() is not true then perform private.correction_fail('unavailable'); end if;
  period_start:=date_trunc('month',clock_timestamp() at time zone 'UTC')::date;
  period_end:=(period_start+interval '1 month')::date;
  -- One statement snapshot for both components. Preserve the existing legacy
  -- counter semantics; canonical usage belongs to immutable claimed_at month.
  with legacy as (
    select public.get_organization_ai_tokens_used(a.organization_id,period_start::timestamp at time zone 'UTC')::numeric tokens
  ), canonical as (
    select coalesce(sum(case when x.usage is null then 0 else
        (x.usage->>'inputTokens')::numeric+(x.usage->>'outputTokens')::numeric end),0) tokens,
      count(*) filter(where x.usage is null) unknown_count,
      coalesce(bool_and(case when x.usage is null then true else coalesce(
        private.evidence_keys(x.usage,array['inputTokens','outputTokens'])
        and jsonb_typeof(x.usage->'inputTokens')='string' and jsonb_typeof(x.usage->'outputTokens')='string'
        and (x.usage->>'inputTokens') ~ '^(0|[1-9][0-9]{0,15})$'
        and (x.usage->>'outputTokens') ~ '^(0|[1-9][0-9]{0,15})$'
        and (x.usage->>'inputTokens')::numeric<=9007199254740991
        and (x.usage->>'outputTokens')::numeric<=9007199254740991,false) end),true) valid
    from private.canonical_rewrite_operations x
    where x.organization_id=a.organization_id and x.claimed_at>=period_start::timestamp at time zone 'UTC'
      and x.claimed_at<period_end::timestamp at time zone 'UTC'
  ) select legacy.tokens,canonical.tokens,canonical.unknown_count,canonical.valid
    into legacy_tokens,canonical_tokens,unknown_claims,values_valid from legacy cross join canonical;
  if values_valid is not true or legacy_tokens is null or legacy_tokens<0 or legacy_tokens<>trunc(legacy_tokens)
    or canonical_tokens<0 or canonical_tokens<>trunc(canonical_tokens) then perform private.correction_fail('unavailable'); end if;
  return jsonb_build_object('schemaVersion','canonical-rewrite-usage/1.0.0','profileVersion','canonical-rewrite-readiness-profile/1.0.1',
    'usageSha256',(select private.typed_authoring_sha256(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure('public.read_canonical_rewrite_usage(uuid,uuid)')),
    'ownerId',p_user_id,'organizationId',a.organization_id,'analysisId',p_analysis_id,
    'periodStart',to_char(period_start,'YYYY-MM-DD'),'periodEnd',to_char(period_end,'YYYY-MM-DD'),
    'legacyTokens',legacy_tokens::text,'canonicalTokens',canonical_tokens::text,'totalTokens',(legacy_tokens+canonical_tokens)::text,'unknownClaims',unknown_claims::text);
end;
$cr_usage_read$;
revoke all on function public.read_canonical_rewrite_usage(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.read_canonical_rewrite_usage(uuid,uuid) to service_role;

-- Guard all three exact preimages and every replacement before any rewrite.
-- This is fixed migration-time text transformation, never runtime dispatch.
do $compatibility$
declare manifest jsonb:=$patches$[
  {
    "signature": "public.finish_canonical_rewrite(uuid,uuid,uuid,text,jsonb,jsonb,text)",
    "before": "fa8caa7e6818545b495bf35f7b085a02a8e1f3d08e10f87ee33cacd68dcf38ed",
    "after": "cb7a256fbacd55d494fb72196308e6c06e8c7faabb40c18a9ea2bba97a3c5828",
    "changes": [
      {
        "old": "  insert into public.analysis_ai_runs(id,analysis_id,organization_id,owner_id,provider,model_id,prompt_version,input_hash,input_tokens,output_tokens,output,completed_at)\n    values(op.run_id,p_analysis_id,a.organization_id,p_user_id,'openai',op.policy->>'model',op.policy->>'promptVersion',p_binding_sha256,\n      (p_usage->>'inputTokens')::integer,(p_usage->>'outputTokens')::integer,jsonb_build_object('state','canonical_bound_proposals','publication',jsonb_build_object('result',result_value,'receipt',receipt_value)),clock_timestamp());\n",
        "new": "",
        "count": 1
      }
    ]
  },
  {
    "signature": "public.read_canonical_rewrite_readiness()",
    "before": "acedde01a4395048f4fc63be4745a956738dcc2db2c678d398b762309d0daad4",
    "after": "5893270fa1d8e45f41a4f383b3b4ce6ced7e2edce41ab65e9ad017507d740011",
    "changes": [
      {
        "old": "canonical-rewrite-readiness-profile/1.0.0",
        "new": "canonical-rewrite-readiness-profile/1.0.1",
        "count": 1
      },
      {
        "old": "    'settleSha256',(select private.typed_authoring_sha256(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure('public.settle_canonical_rewrite_attempt(uuid,uuid,uuid,text,jsonb,text)')));\nend;\n",
        "new": "    'settleSha256',(select private.typed_authoring_sha256(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure('public.settle_canonical_rewrite_attempt(uuid,uuid,uuid,text,jsonb,text)')),\n    'usageSha256',(select private.typed_authoring_sha256(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure('public.read_canonical_rewrite_usage(uuid,uuid)')));\nend;\n",
        "count": 1
      }
    ]
  },
  {
    "signature": "private.canonical_rewrite_ready()",
    "before": "99b9446c08605d6bf1dd201ebe11f0b96e0efbec9c5474bdff584b71b0567cff",
    "after": "e98f6ec0de0a09ec002a85d97d007cb71a49c261bbcba746d82c688a7281251b",
    "changes": [
      {
        "old": "[\n  {\n    \"signature\": \"private.canonical_rewrite_immutable()\",\n    \"sha256\": \"c9112879a49deae16f5714cd898b7ab7a960e532a126f0227d443f4fecebfb1d\",\n    \"definer\": false,\n    \"volatility\": \"v\",\n    \"resultType\": \"trigger\",\n    \"language\": \"plpgsql\",\n    \"acl\": \"owner_only\"\n  },\n  {\n    \"signature\": \"private.canonical_rewrite_policy(jsonb)\",\n    \"sha256\": \"0794d56ad1efb60d9ed5d3466f84c158abc3875a9b717955c28642158e493580\",\n    \"definer\": false,\n    \"volatility\": \"i\",\n    \"resultType\": \"void\",\n    \"language\": \"plpgsql\",\n    \"acl\": \"owner_only\"\n  },\n  {\n    \"signature\": \"private.canonical_rewrite_request(jsonb)\",\n    \"sha256\": \"6d2d62ed6dc312ae6a0d881a13b78189b9c35e3ffba40b6238209ec4221a562a\",\n    \"definer\": false,\n    \"volatility\": \"i\",\n    \"resultType\": \"void\",\n    \"language\": \"plpgsql\",\n    \"acl\": \"owner_only\"\n  },\n  {\n    \"signature\": \"private.canonical_rewrite_usage(jsonb)\",\n    \"sha256\": \"3b2800b6509d3da376ad3b8bd6436e084165bb0c0b9bb00d504828a78de880ea\",\n    \"definer\": false,\n    \"volatility\": \"i\",\n    \"resultType\": \"void\",\n    \"language\": \"plpgsql\",\n    \"acl\": \"owner_only\"\n  },\n  {\n    \"signature\": \"private.canonical_rewrite_owner(uuid,uuid)\",\n    \"sha256\": \"cd4efcafe71b9c270ee709dd10009da352ce25382d1ce2b821aa7d23923b5b5b\",\n    \"definer\": true,\n    \"volatility\": \"v\",\n    \"resultType\": \"public.analyses\",\n    \"language\": \"plpgsql\",\n    \"acl\": \"owner_only\"\n  },\n  {\n    \"signature\": \"private.canonical_rewrite_effective_clauses(jsonb)\",\n    \"sha256\": \"496fa9ad2020184db532e5b1b5c55ae5cbaabc882ff0c7354b14a2419c1fa6c3\",\n    \"definer\": false,\n    \"volatility\": \"i\",\n    \"resultType\": \"jsonb\",\n    \"language\": \"plpgsql\",\n    \"acl\": \"owner_only\"\n  },\n  {\n    \"signature\": \"private.canonical_rewrite_sources(jsonb)\",\n    \"sha256\": \"3587bb71fee3161cf900894e789fbba8586718b7735ff51c0915c4164388f571\",\n    \"definer\": false,\n    \"volatility\": \"i\",\n    \"resultType\": \"jsonb\",\n    \"language\": \"plpgsql\",\n    \"acl\": \"owner_only\"\n  },\n  {\n    \"signature\": \"private.canonical_rewrite_binding(jsonb,jsonb,jsonb)\",\n    \"sha256\": \"ec425c3ccc6e527c8dd64ac4af0d1c99512e6ff57293120e8c12baef0ad3c6bc\",\n    \"definer\": false,\n    \"volatility\": \"i\",\n    \"resultType\": \"jsonb\",\n    \"language\": \"sql\",\n    \"acl\": \"owner_only\"\n  },\n  {\n    \"signature\": \"private.canonical_rewrite_projection(jsonb)\",\n    \"sha256\": \"b7048d1c479c473a9f9d521df53f544cd7ef393c0f78a90332eafdad231cc357\",\n    \"definer\": false,\n    \"volatility\": \"i\",\n    \"resultType\": \"void\",\n    \"language\": \"plpgsql\",\n    \"acl\": \"owner_only\"\n  },\n  {\n    \"signature\": \"private.canonical_rewrite_consent(uuid,uuid)\",\n    \"sha256\": \"7ef2efd29fb36e4537ddc2f2813090ca1c661cb61fa80253c7414d6adc461b16\",\n    \"definer\": false,\n    \"volatility\": \"v\",\n    \"resultType\": \"void\",\n    \"language\": \"plpgsql\",\n    \"acl\": \"owner_only\"\n  },\n  {\n    \"signature\": \"private.canonical_rewrite_operation(private.canonical_rewrite_operations,boolean)\",\n    \"sha256\": \"0f717d3e282cef81f755d07e4bddcc45f7be66fa3d6ecb58a883092e71bd1fe8\",\n    \"definer\": false,\n    \"volatility\": \"s\",\n    \"resultType\": \"jsonb\",\n    \"language\": \"plpgsql\",\n    \"acl\": \"owner_only\"\n  },\n  {\n    \"signature\": \"public.read_canonical_rewrite_context(uuid,uuid,jsonb,jsonb)\",\n    \"sha256\": \"fbe6a2167174a33a8fe9541a781623e595444206d0fe121971b87f1b14089707\",\n    \"definer\": true,\n    \"volatility\": \"v\",\n    \"resultType\": \"jsonb\",\n    \"language\": \"plpgsql\",\n    \"acl\": \"service_only\"\n  },\n  {\n    \"signature\": \"public.prepare_canonical_rewrite(uuid,uuid,jsonb,text)\",\n    \"sha256\": \"3ba48ee775c9ce62aa3df976d2011b6cc202acd16c62dd60abe4e36c9f65aef9\",\n    \"definer\": true,\n    \"volatility\": \"v\",\n    \"resultType\": \"jsonb\",\n    \"language\": \"plpgsql\",\n    \"acl\": \"optional_service\"\n  },\n  {\n    \"signature\": \"public.claim_canonical_rewrite_dispatch(uuid,uuid,uuid,text,jsonb)\",\n    \"sha256\": \"d5d3428a1ee680f870b2988e6be4fa2f8344bd4e6785e3d1d065feab65b202f6\",\n    \"definer\": true,\n    \"volatility\": \"v\",\n    \"resultType\": \"jsonb\",\n    \"language\": \"plpgsql\",\n    \"acl\": \"optional_service\"\n  },\n  {\n    \"signature\": \"public.settle_canonical_rewrite_attempt(uuid,uuid,uuid,text,jsonb,text)\",\n    \"sha256\": \"7bf6d0a1fc731d650716c7ce3ccd204d5529f74cc12e69d0c830b1ac4a69ed28\",\n    \"definer\": true,\n    \"volatility\": \"v\",\n    \"resultType\": \"jsonb\",\n    \"language\": \"plpgsql\",\n    \"acl\": \"optional_service\"\n  },\n  {\n    \"signature\": \"private.canonical_rewrite_item(jsonb,jsonb,jsonb)\",\n    \"sha256\": \"6ff0dc76c02cf79ac2d399a85d792ec37b13a857a9800883056f4a12bd43c229\",\n    \"definer\": false,\n    \"volatility\": \"i\",\n    \"resultType\": \"jsonb\",\n    \"language\": \"plpgsql\",\n    \"acl\": \"owner_only\"\n  },\n  {\n    \"signature\": \"public.finish_canonical_rewrite(uuid,uuid,uuid,text,jsonb,jsonb,text)\",\n    \"sha256\": \"fa8caa7e6818545b495bf35f7b085a02a8e1f3d08e10f87ee33cacd68dcf38ed\",\n    \"definer\": true,\n    \"volatility\": \"v\",\n    \"resultType\": \"jsonb\",\n    \"language\": \"plpgsql\",\n    \"acl\": \"optional_service\"\n  },\n  {\n    \"signature\": \"public.export_canonical_rewrite_records(uuid)\",\n    \"sha256\": \"575ba48091f2444893dafa42788a1f8becfef5058533ecffefac245ec8eb5738\",\n    \"definer\": true,\n    \"volatility\": \"s\",\n    \"resultType\": \"jsonb\",\n    \"language\": \"plpgsql\",\n    \"acl\": \"service_only\"\n  },\n  {\n    \"signature\": \"private.canonical_rewrite_content_barrier()\",\n    \"sha256\": \"9c9a1640542afa030cbc86c90750c9cd4579076d819534d38553a3224ceaf9df\",\n    \"definer\": true,\n    \"volatility\": \"v\",\n    \"resultType\": \"trigger\",\n    \"language\": \"plpgsql\",\n    \"acl\": \"owner_only\"\n  },\n  {\n    \"signature\": \"public.read_canonical_rewrite_readiness()\",\n    \"sha256\": \"acedde01a4395048f4fc63be4745a956738dcc2db2c678d398b762309d0daad4\",\n    \"definer\": true,\n    \"volatility\": \"s\",\n    \"resultType\": \"jsonb\",\n    \"language\": \"plpgsql\",\n    \"acl\": \"service_only\"\n  }\n]",
        "new": "[\n  {\n    \"signature\": \"private.canonical_rewrite_immutable()\",\n    \"sha256\": \"c9112879a49deae16f5714cd898b7ab7a960e532a126f0227d443f4fecebfb1d\",\n    \"definer\": false,\n    \"volatility\": \"v\",\n    \"resultType\": \"trigger\",\n    \"language\": \"plpgsql\",\n    \"acl\": \"owner_only\"\n  },\n  {\n    \"signature\": \"private.canonical_rewrite_policy(jsonb)\",\n    \"sha256\": \"0794d56ad1efb60d9ed5d3466f84c158abc3875a9b717955c28642158e493580\",\n    \"definer\": false,\n    \"volatility\": \"i\",\n    \"resultType\": \"void\",\n    \"language\": \"plpgsql\",\n    \"acl\": \"owner_only\"\n  },\n  {\n    \"signature\": \"private.canonical_rewrite_request(jsonb)\",\n    \"sha256\": \"6d2d62ed6dc312ae6a0d881a13b78189b9c35e3ffba40b6238209ec4221a562a\",\n    \"definer\": false,\n    \"volatility\": \"i\",\n    \"resultType\": \"void\",\n    \"language\": \"plpgsql\",\n    \"acl\": \"owner_only\"\n  },\n  {\n    \"signature\": \"private.canonical_rewrite_usage(jsonb)\",\n    \"sha256\": \"3b2800b6509d3da376ad3b8bd6436e084165bb0c0b9bb00d504828a78de880ea\",\n    \"definer\": false,\n    \"volatility\": \"i\",\n    \"resultType\": \"void\",\n    \"language\": \"plpgsql\",\n    \"acl\": \"owner_only\"\n  },\n  {\n    \"signature\": \"private.canonical_rewrite_owner(uuid,uuid)\",\n    \"sha256\": \"cd4efcafe71b9c270ee709dd10009da352ce25382d1ce2b821aa7d23923b5b5b\",\n    \"definer\": true,\n    \"volatility\": \"v\",\n    \"resultType\": \"public.analyses\",\n    \"language\": \"plpgsql\",\n    \"acl\": \"owner_only\"\n  },\n  {\n    \"signature\": \"private.canonical_rewrite_effective_clauses(jsonb)\",\n    \"sha256\": \"496fa9ad2020184db532e5b1b5c55ae5cbaabc882ff0c7354b14a2419c1fa6c3\",\n    \"definer\": false,\n    \"volatility\": \"i\",\n    \"resultType\": \"jsonb\",\n    \"language\": \"plpgsql\",\n    \"acl\": \"owner_only\"\n  },\n  {\n    \"signature\": \"private.canonical_rewrite_sources(jsonb)\",\n    \"sha256\": \"3587bb71fee3161cf900894e789fbba8586718b7735ff51c0915c4164388f571\",\n    \"definer\": false,\n    \"volatility\": \"i\",\n    \"resultType\": \"jsonb\",\n    \"language\": \"plpgsql\",\n    \"acl\": \"owner_only\"\n  },\n  {\n    \"signature\": \"private.canonical_rewrite_binding(jsonb,jsonb,jsonb)\",\n    \"sha256\": \"ec425c3ccc6e527c8dd64ac4af0d1c99512e6ff57293120e8c12baef0ad3c6bc\",\n    \"definer\": false,\n    \"volatility\": \"i\",\n    \"resultType\": \"jsonb\",\n    \"language\": \"sql\",\n    \"acl\": \"owner_only\"\n  },\n  {\n    \"signature\": \"private.canonical_rewrite_projection(jsonb)\",\n    \"sha256\": \"b7048d1c479c473a9f9d521df53f544cd7ef393c0f78a90332eafdad231cc357\",\n    \"definer\": false,\n    \"volatility\": \"i\",\n    \"resultType\": \"void\",\n    \"language\": \"plpgsql\",\n    \"acl\": \"owner_only\"\n  },\n  {\n    \"signature\": \"private.canonical_rewrite_consent(uuid,uuid)\",\n    \"sha256\": \"7ef2efd29fb36e4537ddc2f2813090ca1c661cb61fa80253c7414d6adc461b16\",\n    \"definer\": false,\n    \"volatility\": \"v\",\n    \"resultType\": \"void\",\n    \"language\": \"plpgsql\",\n    \"acl\": \"owner_only\"\n  },\n  {\n    \"signature\": \"private.canonical_rewrite_operation(private.canonical_rewrite_operations,boolean)\",\n    \"sha256\": \"0f717d3e282cef81f755d07e4bddcc45f7be66fa3d6ecb58a883092e71bd1fe8\",\n    \"definer\": false,\n    \"volatility\": \"s\",\n    \"resultType\": \"jsonb\",\n    \"language\": \"plpgsql\",\n    \"acl\": \"owner_only\"\n  },\n  {\n    \"signature\": \"public.read_canonical_rewrite_context(uuid,uuid,jsonb,jsonb)\",\n    \"sha256\": \"fbe6a2167174a33a8fe9541a781623e595444206d0fe121971b87f1b14089707\",\n    \"definer\": true,\n    \"volatility\": \"v\",\n    \"resultType\": \"jsonb\",\n    \"language\": \"plpgsql\",\n    \"acl\": \"service_only\"\n  },\n  {\n    \"signature\": \"public.prepare_canonical_rewrite(uuid,uuid,jsonb,text)\",\n    \"sha256\": \"3ba48ee775c9ce62aa3df976d2011b6cc202acd16c62dd60abe4e36c9f65aef9\",\n    \"definer\": true,\n    \"volatility\": \"v\",\n    \"resultType\": \"jsonb\",\n    \"language\": \"plpgsql\",\n    \"acl\": \"optional_service\"\n  },\n  {\n    \"signature\": \"public.claim_canonical_rewrite_dispatch(uuid,uuid,uuid,text,jsonb)\",\n    \"sha256\": \"d5d3428a1ee680f870b2988e6be4fa2f8344bd4e6785e3d1d065feab65b202f6\",\n    \"definer\": true,\n    \"volatility\": \"v\",\n    \"resultType\": \"jsonb\",\n    \"language\": \"plpgsql\",\n    \"acl\": \"optional_service\"\n  },\n  {\n    \"signature\": \"public.settle_canonical_rewrite_attempt(uuid,uuid,uuid,text,jsonb,text)\",\n    \"sha256\": \"7bf6d0a1fc731d650716c7ce3ccd204d5529f74cc12e69d0c830b1ac4a69ed28\",\n    \"definer\": true,\n    \"volatility\": \"v\",\n    \"resultType\": \"jsonb\",\n    \"language\": \"plpgsql\",\n    \"acl\": \"optional_service\"\n  },\n  {\n    \"signature\": \"private.canonical_rewrite_item(jsonb,jsonb,jsonb)\",\n    \"sha256\": \"6ff0dc76c02cf79ac2d399a85d792ec37b13a857a9800883056f4a12bd43c229\",\n    \"definer\": false,\n    \"volatility\": \"i\",\n    \"resultType\": \"jsonb\",\n    \"language\": \"plpgsql\",\n    \"acl\": \"owner_only\"\n  },\n  {\n    \"signature\": \"public.finish_canonical_rewrite(uuid,uuid,uuid,text,jsonb,jsonb,text)\",\n    \"sha256\": \"cb7a256fbacd55d494fb72196308e6c06e8c7faabb40c18a9ea2bba97a3c5828\",\n    \"definer\": true,\n    \"volatility\": \"v\",\n    \"resultType\": \"jsonb\",\n    \"language\": \"plpgsql\",\n    \"acl\": \"optional_service\"\n  },\n  {\n    \"signature\": \"public.export_canonical_rewrite_records(uuid)\",\n    \"sha256\": \"575ba48091f2444893dafa42788a1f8becfef5058533ecffefac245ec8eb5738\",\n    \"definer\": true,\n    \"volatility\": \"s\",\n    \"resultType\": \"jsonb\",\n    \"language\": \"plpgsql\",\n    \"acl\": \"service_only\"\n  },\n  {\n    \"signature\": \"private.canonical_rewrite_content_barrier()\",\n    \"sha256\": \"9c9a1640542afa030cbc86c90750c9cd4579076d819534d38553a3224ceaf9df\",\n    \"definer\": true,\n    \"volatility\": \"v\",\n    \"resultType\": \"trigger\",\n    \"language\": \"plpgsql\",\n    \"acl\": \"owner_only\"\n  },\n  {\n    \"signature\": \"public.read_canonical_rewrite_readiness()\",\n    \"sha256\": \"5893270fa1d8e45f41a4f383b3b4ce6ced7e2edce41ab65e9ad017507d740011\",\n    \"definer\": true,\n    \"volatility\": \"s\",\n    \"resultType\": \"jsonb\",\n    \"language\": \"plpgsql\",\n    \"acl\": \"service_only\"\n  },\n  {\n    \"signature\": \"public.read_canonical_rewrite_usage(uuid,uuid)\",\n    \"sha256\": \"e58366ed4afd20b587a6d133fd3ad397c139d327fc060fbc0b040b857069f7ca\",\n    \"definer\": true,\n    \"volatility\": \"v\",\n    \"resultType\": \"jsonb\",\n    \"language\": \"plpgsql\",\n    \"acl\": \"service_only\"\n  }\n]",
        "count": 1
      }
    ]
  }
]$patches$::jsonb; item jsonb; change jsonb;
  routine pg_catalog.pg_proc%rowtype; source_value text; next_value text; definition text;
  prepared text[]:='{}'; ddl text;
begin
  for item in select value from jsonb_array_elements(manifest) loop
    select * into strict routine from pg_catalog.pg_proc where oid=to_regprocedure(item->>'signature');
    if routine.prokind<>'f' or routine.proretset or routine.proisstrict
      or routine.prorettype<>to_regtype(case when item->>'signature'='private.canonical_rewrite_ready()' then 'boolean' else 'jsonb' end)
      or routine.prosecdef is distinct from (item->>'signature'<>'private.canonical_rewrite_ready()')
      or routine.provolatile<>case when item->>'signature' like 'public.finish_%' then 'v' else 's' end
      or routine.prolang<>(select oid from pg_catalog.pg_language where lanname='plpgsql')
      or routine.proconfig is distinct from array['search_path=""'] then raise exception 'CANONICAL_REWRITE_COMPATIBILITY_DRIFT' using errcode='23514';end if;
    source_value:=routine.prosrc;
    if private.typed_authoring_sha256(source_value)<>item->>'before' then raise exception 'CANONICAL_REWRITE_COMPATIBILITY_DRIFT' using errcode='23514';end if;
    -- This source upgrade never authorizes a writer or an anonymous/internal helper.
    if exists(select 1 from aclexplode(coalesce(routine.proacl,acldefault('f',routine.proowner))) acl
      where acl.grantee<>routine.proowner and (item->>'signature'<>'public.read_canonical_rewrite_readiness()'
        or acl.grantee<>(select oid from pg_catalog.pg_roles where rolname='service_role') or acl.is_grantable or acl.privilege_type<>'EXECUTE')) then
      raise exception 'CANONICAL_REWRITE_COMPATIBILITY_ACCESS' using errcode='23514';end if;
    next_value:=source_value;
    for change in select value from jsonb_array_elements(item->'changes') loop
      if (length(next_value)-length(replace(next_value,change->>'old','')))/length(change->>'old')<>(change->>'count')::integer then
        raise exception 'CANONICAL_REWRITE_COMPATIBILITY_DRIFT' using errcode='23514';end if;
      next_value:=replace(next_value,change->>'old',change->>'new');
    end loop;
    if private.typed_authoring_sha256(next_value)<>item->>'after' then raise exception 'CANONICAL_REWRITE_COMPATIBILITY_DRIFT' using errcode='23514';end if;
    definition:=pg_get_functiondef(routine.oid);
    if (length(definition)-length(replace(definition,source_value,'')))/length(source_value)<>1 then raise exception 'CANONICAL_REWRITE_COMPATIBILITY_DRIFT' using errcode='23514';end if;
    prepared:=array_append(prepared,replace(definition,source_value,next_value));
  end loop;
  foreach ddl in array prepared loop execute ddl;end loop;
end;
$compatibility$;

-- The four original mutator grants stay DENIED. No old score trigger, base138,
-- typed13, support policy, operation/table/claim signature or export is replaced.
commit;
