-- ATS-D5 follow-up: re-seal the legacy-usage catalogue after the DOCX media-type change.
--
-- private.owned_legacy_ai_usage_catalogue() records the exact definition of every constraint on
-- public.resume_versions, and a sealed hash of it gates privacy access (a mismatch makes
-- read_candidate_privacy_access fail closed, so every saved-analysis page returns 503). The DOCX
-- migration (20261127092024) intentionally widened resume_versions_media_type_check, so the seal
-- must move with it. This migration changes the seal ONLY if that constraint is the single
-- difference: it rebuilds the old catalogue by restoring the old constraint text and requires the
-- result to match the current seal. Any other drift stops the migration.

do $reseal$
declare
  current_catalogue jsonb:=private.owned_legacy_ai_usage_catalogue();
  sealed text;
  restored jsonb;
begin
  select catalogue_sha256 into sealed from private.owned_legacy_ai_usage_catalogue_seal where singleton;
  restored:=jsonb_set(current_catalogue,'{resume_versions,constraints}',
    (select jsonb_agg(case when e->>'name'='resume_versions_media_type_check'
        then jsonb_set(e,'{definition}',to_jsonb('CHECK ((media_type = ''application/pdf''::text))'::text)) else e end order by ord)
     from jsonb_array_elements(current_catalogue->'resume_versions'->'constraints') with ordinality t(e,ord)));
  if sealed is null or private.ifo_sha(restored::text) is distinct from sealed then
    raise exception 'DOCX_RESEAL_UNEXPECTED_DRIFT' using errcode='55000';
  end if;
  if private.ifo_sha(current_catalogue::text)=sealed then return; end if;
  alter table private.owned_legacy_ai_usage_catalogue_seal disable trigger owned_legacy_ai_usage_seal_closed;
  update private.owned_legacy_ai_usage_catalogue_seal set catalogue_sha256=private.ifo_sha(current_catalogue::text) where singleton;
  alter table private.owned_legacy_ai_usage_catalogue_seal enable trigger owned_legacy_ai_usage_seal_closed;
end;
$reseal$;
