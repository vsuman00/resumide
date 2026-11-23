-- PRIVILEGED MUTATING ROLLBACK-ONLY DRAFT; UNPARSED/UNEXECUTED.
-- Authorized disposable migrated database only. No real privacy/Auth/storage/provider operation.
-- Fenced-positive lease/ABA/generation two-session fixtures remain Native acceptance.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';
do $generation_verify$
declare item jsonb;missing uuid:=gen_random_uuid();claimed public.data_requests%rowtype;
 manifest jsonb:=$generation_expected$[{"signature":"private.privacy_generation_current()","sha256":"270316100304275d19df7bdc3fff15dd5b772e42af1945846107d1b556b6f490"},{"signature":"private.privacy_generation_advance(uuid)","sha256":"9110924e0377a870de0e14b9d5b81d3a3b9860d2d82d9015635bfcffea2d479b"},{"signature":"private.privacy_generation_claim(uuid,text,integer)","sha256":"ffe056954d3e242f1f55da49fe70c5324fb1fa8c0db6acd255d98961d9ef3820"},{"signature":"public.complete_privacy_request(uuid,text,integer,jsonb)","sha256":"4e3337998fc59a30fe9342a6e1e805d5249f7e1c945ca9039af07b50f2f99038"},{"signature":"public.fail_privacy_request(uuid,text,integer,text,integer)","sha256":"81af937d32bb648b43bf7573dcd058e432033a9abac461e6455ac639fdd93f86"},{"signature":"private.privacy_generation_counter_guard()","sha256":"184c406fef1650ab663705525242c5810af381aac5c9671626a3f460e3a2e50d"},{"signature":"private.privacy_generation_status_guard()","sha256":"78cad9550fb64ccc04bac6e888350d5cfb730c1abd50fa2579138d624ee90cba"},{"signature":"private.privacy_generation_seal_closed()","sha256":"bfbd63ee2d3f07bcbd8087b151c4c5b04a5ec523d826115791f32b23f1277812"},{"signature":"public.prepare_deletion_request(uuid,text,integer)","sha256":"d8d3839ccd33d98a3c57fbf1afe60de5d8d0bc1de27d19b43b086b959204040e"},{"signature":"private.privacy_generation_catalogue()","sha256":"7b405eeb3f25dfa176fdbda6592d7a5453bd765d601394eef61d565fb1fdfadb"},{"signature":"private.privacy_generation_ready()","sha256":"222f7d8caad4b1e9e4b1eadb3c00f223bb778ff133da2fba6dc5bc88493af008"},{"signature":"public.claim_privacy_request(text,integer)","sha256":"259c00ab0ad796fc32534b4f02bc8b882a9155441166e949213bc5ac6e44d297"},{"signature":"public.prepare_deletion_request(uuid,text)","sha256":"3ae05d4e63ee90c89c3f5e98a34aded3c7efccff3dafa514f73e53ca3f2a2741"},{"signature":"public.complete_privacy_request(uuid,text,jsonb)","sha256":"2ec658fc4f222f9c0e26bd058cba29074f4f08af6cc358aa5510aaac7c971eff"},{"signature":"public.fail_privacy_request(uuid,text,text,integer)","sha256":"2ec658fc4f222f9c0e26bd058cba29074f4f08af6cc358aa5510aaac7c971eff"},{"signature":"private.expire_owned_ai_disposition(uuid)","sha256":"58b8fb72111661f7dd4f17f25872d86c56e4aa5585f4a3dc8a93707921a58fdd"},{"signature":"private.owned_ai_expiry_safety_ready()","sha256":"49416a397d11c90ed27ef42d4535f29eba23927900b802535858b5d78ddd3432"},{"signature":"private.owned_ai_retirement_ready()","sha256":"92c6ca21cb8f76a989b88f6d0aef1c7e68896478b57bce585f28bbb8f9b8fa6b"},{"signature":"private.initial_feedback_ready()","sha256":"cd6ce6725aecc907f06e7cd47ca79b5c4f862d964a1a3f852e24be6b1e21dc30"},{"signature":"private.owned_legacy_ai_usage_ready()","sha256":"48f1873d29d70e556f2a0963bc225d1131722b1d9b91d98fc30800638de19849"},{"signature":"private.ai_budget_source_ready()","sha256":"29e517d543f3f7fad264dcaff52a1cf949a06e7c476879cb34ecb1256d6106a0"},{"signature":"private.owned_ai_disposition_ready()","sha256":"f0f427402122885a720b951d55dddfe856d6213afe190286c6bcf3ef921323f8"},{"signature":"private.owned_ai_expiry_ready()","sha256":"c227f8fd68b16213cb916f59d1208a5079f7ae16a1f3e44c954b144e5af084d6"}]$generation_expected$::jsonb;
begin
 for item in select value from jsonb_array_elements(manifest) loop
  if (select private.ifo_sha(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure(item->>'signature')) is distinct from item->>'sha256'
   then raise exception 'PRIVACY_GENERATION_VERIFY_PIN';end if;
 end loop;
 if private.privacy_generation_ready() is not true then raise exception 'PRIVACY_GENERATION_VERIFY_READY';end if;
 claimed:=private.privacy_generation_claim(missing,'synthetic-worker',1);
 if claimed.id is not null or public.complete_privacy_request(missing,'synthetic-worker',jsonb_build_object('stale',true)) is distinct from false
  or public.fail_privacy_request(missing,'synthetic-worker','UNKNOWN',3) is distinct from false
  then raise exception 'PRIVACY_GENERATION_VERIFY_LEGACY';end if;
 begin
  execute 'revoke insert(kind) on public.data_requests from service_role';
  if private.privacy_generation_ready() is not false then raise exception 'PRIVACY_GENERATION_VERIFY_MISSING_INSERT_ACCEPTED';end if;
  raise exception 'PRIVACY_GENERATION_VERIFY_ROLLBACK' using errcode='P0P02';
 exception when sqlstate 'P0P02' then null;
 end;
 if private.privacy_generation_ready() is not true then raise exception 'PRIVACY_GENERATION_VERIFY_NOT_RESTORED';end if;
 begin
  update private.privacy_export_generation set generation=generation-1;
  raise exception 'PRIVACY_GENERATION_VERIFY_RESET_ACCEPTED';
 exception when check_violation then null;
 end;
 if has_function_privilege('service_role','public.sweep_owned_ai_expiry(integer)','EXECUTE')
  then raise exception 'PRIVACY_GENERATION_VERIFY_DESTRUCTIVE_GRANT';end if;
end;
$generation_verify$;
rollback;
