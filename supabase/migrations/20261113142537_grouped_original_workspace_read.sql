-- Source-only forward read admission. The grouped writer remains EXECUTE-revoked.
begin;
create function public.read_grouped_original_workspace(p_user_id uuid,p_analysis_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $a02_read$
declare scope jsonb; evidence public.document_evidence_attempts%rowtype; result jsonb; ready boolean; permitted boolean;
begin
  if p_user_id is null or p_analysis_id is null then perform private.correction_fail('not_found'); end if;
  -- Same owner/privacy/source locks and captured prefixes as the atomic writer.
  scope:=private.grouped_original_scope(p_user_id,p_analysis_id);
  select * into strict evidence from public.document_evidence_attempts
    where id=(scope->>'attemptId')::uuid and owner_id=p_user_id
      and organization_id=(scope->>'organizationId')::uuid and analysis_id=p_analysis_id
      and resume_version_id=(scope->>'sourceId')::uuid and input_sha256=scope->>'inputSha256' for share;
  ready:=private.canonical_correction_write_ready();
  permitted:=ready and has_function_privilege('service_role','public.import_canonical_grouped_original(uuid,uuid,jsonb,jsonb,text)','EXECUTE');
  result:=jsonb_build_object('schemaVersion','grouped-original-read/1.0.0','status','available',
    'compatibilityReady',ready,'canCommit',permitted,
    'freshImportAllowed',scope->'headId'='null'::jsonb and private.correction_original_import_allowed(scope),
    'scoringEligible',false,'source',jsonb_build_object(
      'ownerId',scope->'ownerId','organizationId',scope->'organizationId','resumeId',scope->'resumeId',
      'analysisId',scope->'analysisId','sourceId',scope->'sourceId','attemptId',scope->'attemptId','inputSha256',scope->'inputSha256'),
    'captured',jsonb_build_object('reviewRevision',scope->'reviewRevision','reviewHeadId',scope->'reviewHeadId',
      'assignmentRevision',scope->'assignmentRevision','assignmentHeadId',scope->'assignmentHeadId',
      'associationRevision',scope->'associationRevision','associationHeadId',scope->'associationHeadId','canonicalHeadId',scope->'headId'),
    'attempt',jsonb_build_object('id',evidence.id,'attemptNumber',evidence.attempt_number,'envelope',evidence.envelope));
  if octet_length(convert_to(result::text,'UTF8'))>16777216 then perform private.correction_fail('unavailable'); end if;
  return result;
exception when insufficient_privilege then
  return jsonb_build_object('schemaVersion','grouped-original-read/1.0.0','status','not_found','scoringEligible',false);
when others then
  return jsonb_build_object('schemaVersion','grouped-original-read/1.0.0','status','unavailable','scoringEligible',false);
end;
$a02_read$;
revoke all on function public.read_grouped_original_workspace(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.read_grouped_original_workspace(uuid,uuid) to service_role;

-- Guard the full predecessor; preserve its table/column/FK/trigger and ACL checks.
do $a02_read_profile$
declare routine pg_catalog.pg_proc%rowtype; source text; definition text; next_source text;
  predecessor text:='07d338cc1cbd2c79df76dcbc21bd814b3612c43a0e748531f574974b55c25958';
  postimage text:='c2098f91ee32e4035ff30dd5db71c4d7e95944cef24e4b137c8c489841edd5db';
  old_manifest text:=$a02_old_manifest$[
  {
    "signature": "private.correction_assert_fact_placement(jsonb,uuid,text)",
    "sha256": "dc457354f50cf9abe54f8e412338502f10d7c68275effaebf2b0d03ff68369fb",
    "definer": false,
    "volatility": "i",
    "resultType": "void",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.candidate_owner_lock_keys(uuid[])",
    "sha256": "71a245029186c9f601dd9730d5ac894a32b91431be0065538ff57f0c949b7c85",
    "definer": false,
    "volatility": "i",
    "resultType": "bigint[]",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.candidate_write_blocked(uuid)",
    "sha256": "e94533690339986bb0e0889ec2f98de0687c6061e80b490a7040e5c40cadd53b",
    "definer": true,
    "volatility": "v",
    "resultType": "boolean",
    "strict": false,
    "language": "sql",
    "serviceExecute": false
  },
  {
    "signature": "private.canonical_shape_valid(jsonb)",
    "sha256": "572ba813d4b46eadc23c7cbb39334f1e093a9f2a746e3fd26bfd324f5354ae92",
    "definer": false,
    "volatility": "i",
    "resultType": "boolean",
    "strict": false,
    "language": "sql",
    "serviceExecute": false
  },
  {
    "signature": "private.correction_admit_new(jsonb,jsonb,jsonb)",
    "sha256": "33ff0b2956f8dc84cf72a71fde1553c446d2aa1d6b887fb982326ac6393f0370",
    "definer": false,
    "volatility": "v",
    "resultType": "void",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.correction_atoms(jsonb,jsonb,jsonb)",
    "sha256": "c361ebe4f11baa3069999145b2b8da5be0f4afaca8ce1b038099e33e951c14dc",
    "definer": false,
    "volatility": "i",
    "resultType": "text[]",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.correction_child_body(jsonb,uuid,jsonb,text,uuid)",
    "sha256": "2315b0eb5aabd09ce9003268abd528dc7eb5886c5c537ed9f91eff0698a44390",
    "definer": false,
    "volatility": "v",
    "resultType": "jsonb",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.correction_citations(jsonb,uuid)",
    "sha256": "7c49ed406cc85a8395c0953b2a220f86173199e2f7448c01758a8df0ef0f710c",
    "definer": false,
    "volatility": "i",
    "resultType": "jsonb",
    "strict": false,
    "language": "sql",
    "serviceExecute": false
  },
  {
    "signature": "private.correction_command_bytes(text[])",
    "sha256": "afb4eca3cf9ebd31bf49f5ccbb62f859056c34b177b9ae4fca69dae52a47b797",
    "definer": false,
    "volatility": "i",
    "resultType": "bytea",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.correction_command_sha256(text[])",
    "sha256": "5571e9221b6738c50923c32813fc8b5f2f74306129227dab0ccb9849b66ffe67",
    "definer": false,
    "volatility": "i",
    "resultType": "text",
    "strict": false,
    "language": "sql",
    "serviceExecute": false
  },
  {
    "signature": "private.correction_fail(text)",
    "sha256": "5830ddc09c3ab01037c99910e32b7d2af71eaad41d5c0f8a8ec34e89638ac1d7",
    "definer": false,
    "volatility": "i",
    "resultType": "void",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.correction_insert_operation(jsonb,jsonb,text,uuid[],uuid[],uuid,uuid,integer,bigint,text)",
    "sha256": "bc071ad288642b50a116724ad3230864effea2fb944b637dfcd094bc07aa0d35",
    "definer": false,
    "volatility": "v",
    "resultType": "uuid",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.correction_latest(jsonb,jsonb,jsonb)",
    "sha256": "dce9e9295ec122146bc836a8ffa9c243804727da95465bf90a253ae58859267e",
    "definer": false,
    "volatility": "v",
    "resultType": "boolean",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.correction_location(jsonb,uuid)",
    "sha256": "1f8e4da690698cdef6d5b9949a5f78d10b72217bd9a87eb2d1cf0703dd98093a",
    "definer": false,
    "volatility": "i",
    "resultType": "jsonb",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.correction_normalize(jsonb,jsonb)",
    "sha256": "dd0dc4ad2ea4e8e56ee633cd395d6caf182015d37f8906f66cbd5ccc8e095764",
    "definer": false,
    "volatility": "v",
    "resultType": "jsonb",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.correction_original_import_allowed(jsonb)",
    "sha256": "7238107de85eb94472214eb2bda16a641a478e61c30d611cc101943b91775f93",
    "definer": false,
    "volatility": "v",
    "resultType": "boolean",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.correction_place(jsonb,jsonb,text,uuid,text,uuid,uuid,uuid)",
    "sha256": "6da429e9875880782057342788c472697e145ad0ceca12324349b1a5f3ca90cd",
    "definer": false,
    "volatility": "i",
    "resultType": "jsonb",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.correction_receipt(uuid,boolean)",
    "sha256": "1d58cb7258edb1a265cbb69507195b7ee1ab6d8e649be22e5559edf1378fe5ea",
    "definer": false,
    "volatility": "v",
    "resultType": "jsonb",
    "strict": false,
    "language": "sql",
    "serviceExecute": false
  },
  {
    "signature": "private.correction_replay(jsonb,jsonb,jsonb,text)",
    "sha256": "e5b954bc4ab638d132f6eb2018454b0aa7ab0e3dfb7e5a9f0a9762872a7c92f5",
    "definer": false,
    "volatility": "v",
    "resultType": "jsonb",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.correction_scope(uuid,uuid)",
    "sha256": "e64bf7f02bc07ef92eaa3e47f2c0cf471a34b146eaaa58b036c09760522c0493",
    "definer": false,
    "volatility": "v",
    "resultType": "jsonb",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.correction_selector_from_row(public.candidate_correction_assignments,uuid)",
    "sha256": "ec1be8a462926ed22ae4bb58b4a34fef76d919a5a0c7286df4d19788e75d86cc",
    "definer": false,
    "volatility": "i",
    "resultType": "jsonb",
    "strict": false,
    "language": "sql",
    "serviceExecute": false
  },
  {
    "signature": "private.correction_sorted_citations(jsonb)",
    "sha256": "b95b7924f4943f09d7976fc943289ed648572dab7c139fd053be5883a963b465",
    "definer": false,
    "volatility": "i",
    "resultType": "jsonb",
    "strict": false,
    "language": "sql",
    "serviceExecute": false
  },
  {
    "signature": "private.correction_uuid(jsonb,boolean)",
    "sha256": "602919fd3c33bfe75d0999b29879f3dc04a0215e82e92c53c87c9789c4c6c454",
    "definer": false,
    "volatility": "i",
    "resultType": "boolean",
    "strict": false,
    "language": "sql",
    "serviceExecute": false
  },
  {
    "signature": "private.correction_validate_command(jsonb,boolean)",
    "sha256": "164e99251599c9520c8eb314c2371600bf5b94a87eca6c641c9b5b2789c42afe",
    "definer": false,
    "volatility": "i",
    "resultType": "void",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.evidence_integer(jsonb,bigint,bigint)",
    "sha256": "6c4e10bfbef2d70d4a40b9c2346962b5ad5dac1415574b7b33707115d234e765",
    "definer": false,
    "volatility": "i",
    "resultType": "boolean",
    "strict": false,
    "language": "sql",
    "serviceExecute": false
  },
  {
    "signature": "private.evidence_keys(jsonb,text[])",
    "sha256": "824082145b4e705dfdf1d1be622b7fe4f6959c2fcaec5c69bb28ca0a930e5168",
    "definer": false,
    "volatility": "i",
    "resultType": "boolean",
    "strict": false,
    "language": "sql",
    "serviceExecute": false
  },
  {
    "signature": "private.lock_candidate_owners(uuid[])",
    "sha256": "f456097e005450c5cac7c2a601fc6641681bc4afdff1fab0abe649cd4562bd4a",
    "definer": false,
    "volatility": "v",
    "resultType": "void",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.save_candidate_authored_fact(uuid,uuid,jsonb,uuid,uuid,text)",
    "sha256": "a3d2c3b21e117277bb65da29976400a5130badb2c523bd7f2082ff8a6687ea27",
    "definer": false,
    "volatility": "v",
    "resultType": "jsonb",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.try_candidate_privacy_write(uuid)",
    "sha256": "89e7eec219295b7c834c284012ba7144049380935273e1505a994d38efc4156d",
    "definer": true,
    "volatility": "v",
    "resultType": "boolean",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.validate_correction_child(jsonb,uuid,uuid)",
    "sha256": "92385c2299fb20d4b339805e2cdc4a95c824afad444a4924a61acb2a6e20aecc",
    "definer": false,
    "volatility": "v",
    "resultType": "void",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.write_correction_snapshot(uuid,jsonb)",
    "sha256": "374df60f2fb2358a7a5d6c9747ab8e05ba3fddcc3384b1f21f708e86364fdf60",
    "definer": false,
    "volatility": "v",
    "resultType": "void",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "public.apply_authoring_action(uuid,uuid,jsonb,jsonb,jsonb,text)",
    "sha256": "b25b9b1fd9459834afd59c0b48fe5f65e2143e3640818ded15fa227c2b8170c2",
    "definer": true,
    "volatility": "v",
    "resultType": "jsonb",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": true
  },
  {
    "signature": "public.apply_candidate_corrections(uuid,uuid,jsonb,jsonb,text)",
    "sha256": "b562db15226cfcf5818e1e23dda0ea38282b0f54df46607172d249e063834292",
    "definer": true,
    "volatility": "v",
    "resultType": "jsonb",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": true
  },
  {
    "signature": "public.assign_candidate_correction_targets(uuid,uuid,jsonb,text)",
    "sha256": "0c8788e948b9481df2ae5a3593a5e7aba044467103f4e13c4cf7959eafb54e34",
    "definer": true,
    "volatility": "v",
    "resultType": "jsonb",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": true
  },
  {
    "signature": "public.import_canonical_original(uuid,uuid,jsonb,jsonb,jsonb,text)",
    "sha256": "1671cf3b6d3c8b0c716b2c2e5c8dc622dee70f468e3ebcdab21a2e088266f49b",
    "definer": true,
    "volatility": "v",
    "resultType": "jsonb",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": true
  },
  {
    "signature": "public.read_candidate_correction_ledger(uuid,uuid)",
    "sha256": "b380edcf9d0fb9c743ee957e00946ed05049d5b5e6345f68cd1981c1563744b8",
    "definer": true,
    "volatility": "v",
    "resultType": "jsonb",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": true
  },
  {
    "signature": "public.save_canonical_version(uuid,uuid,jsonb,jsonb,text)",
    "sha256": "5a6109303ed91cb80c916c2650cfcceed7d8f97737dc65d6e0c03cdfb3d32a1f",
    "definer": true,
    "volatility": "v",
    "resultType": "jsonb",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": true
  },
  {
    "signature": "private.grouped_import_command_bytes(text[])",
    "sha256": "74e9f591ff2958fe9b5d5f2d2f50beb3c0f77f9d70e2eac4078a8873e4f31a6e",
    "definer": false,
    "volatility": "i",
    "resultType": "bytea",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.grouped_import_command_sha256(text[])",
    "sha256": "7f389fc92cd6d1aef3c15961a77a81718ce8bcce9bc8ee8f09af5a1a3210589c",
    "definer": false,
    "volatility": "i",
    "resultType": "text",
    "strict": false,
    "language": "sql",
    "serviceExecute": false
  },
  {
    "signature": "private.grouped_import_invalid()",
    "sha256": "e8ae677933aa164cb3bd2c6343116270c21c40a515254e8c3361f1f3ed574c50",
    "definer": false,
    "volatility": "i",
    "resultType": "void",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.grouped_import_keys(jsonb,text[])",
    "sha256": "3e4ce46e18e28c4b47293508b37cf866d1c45619027e048e135d50e3e52a3155",
    "definer": false,
    "volatility": "i",
    "resultType": "boolean",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.grouped_import_whitespace()",
    "sha256": "03c21f5467b44105d8a28408cfa10d053cd81ee91022beb3709b47165d255ede",
    "definer": false,
    "volatility": "i",
    "resultType": "text",
    "strict": false,
    "language": "sql",
    "serviceExecute": false
  },
  {
    "signature": "private.grouped_import_trim(text)",
    "sha256": "36fc1b16bb7ef5e8f17db55c1d7de42611ac656d9af6e6e68473dfb43a5d93bb",
    "definer": false,
    "volatility": "i",
    "resultType": "text",
    "strict": true,
    "language": "sql",
    "serviceExecute": false
  },
  {
    "signature": "private.grouped_import_ascii_lower(text)",
    "sha256": "cf94af1d2d41e0896f93fbf4e712d692916592e5670d4ba797119870d36161f3",
    "definer": false,
    "volatility": "i",
    "resultType": "text",
    "strict": true,
    "language": "sql",
    "serviceExecute": false
  },
  {
    "signature": "private.grouped_import_utf16_length(text)",
    "sha256": "5a96204c0f13fef791f49a0f86c87baae34c5b281369492b65fb6c878027985b",
    "definer": false,
    "volatility": "i",
    "resultType": "integer",
    "strict": true,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.grouped_import_uuid(jsonb)",
    "sha256": "d564ea71a6bca9c4cdcbfe14b00fd826979cc13dcabb4d59875eda202ba6e65b",
    "definer": false,
    "volatility": "i",
    "resultType": "boolean",
    "strict": false,
    "language": "sql",
    "serviceExecute": false
  },
  {
    "signature": "private.grouped_import_source_index(jsonb,jsonb)",
    "sha256": "4b572e313df3a6ba8707045ea446806b17d804a3d31178f864cca25a46374cba",
    "definer": false,
    "volatility": "i",
    "resultType": "jsonb",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.grouped_import_same_span(text,jsonb)",
    "sha256": "2145e0f14c862f220e59d6a11d22ad96b39857d0c8096fbd79c4fcc47c68043f",
    "definer": false,
    "volatility": "i",
    "resultType": "text",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.grouped_import_flush(jsonb,boolean,jsonb)",
    "sha256": "2ddfc241029796f3cb47ac64f70208f66855cafe161926b7d77e155901e9ba78",
    "definer": false,
    "volatility": "i",
    "resultType": "jsonb",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.grouped_import_project_candidates(jsonb,jsonb)",
    "sha256": "5a9a4f9b6fe9db8b56746c031fb290c1839fe6262410ab799dbad66fd3e6f451",
    "definer": false,
    "volatility": "i",
    "resultType": "jsonb",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.grouped_import_check_refs(jsonb,jsonb)",
    "sha256": "437b7d2f71b961ce48a2d45f3e3014b49e43f703bdde2f45efdbc1e4f8c76808",
    "definer": false,
    "volatility": "i",
    "resultType": "void",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.grouped_import_place_original(jsonb,jsonb,jsonb,jsonb)",
    "sha256": "5cc017c40469f9611aa94f741062756dab1805f11296959daa76a87fbe73bd06",
    "definer": false,
    "volatility": "i",
    "resultType": "jsonb",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.entry_association_group_active(uuid,uuid)",
    "sha256": "62457d48a18d8b024dbae5fe83b371ddd4ffcc5992522b7ba08f34ba1a460289",
    "definer": false,
    "volatility": "v",
    "resultType": "boolean",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.entry_association_validate_head(uuid)",
    "sha256": "177db5fbecd38fffffaae7151db221e0e0358e246b9c5a0e74bd46d674278e47",
    "definer": false,
    "volatility": "v",
    "resultType": "void",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.entry_association_prefix(jsonb)",
    "sha256": "9b499d875b3f5f46449d9b1331a7978ed1bcda1d4cd621bd1d229013d8539979",
    "definer": false,
    "volatility": "v",
    "resultType": "jsonb",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.entry_association_write_snapshot(uuid,jsonb)",
    "sha256": "25c47b6fd0ad92bec87c3adcb55b2388514664c459b41f9455a380f5b4454a80",
    "definer": false,
    "volatility": "v",
    "resultType": "void",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.entry_association_export_records(uuid)",
    "sha256": "8daff2f43d41cab99ef417a55fdfc73cc17930dcd45923c82c6ac6004c49c1ff",
    "definer": false,
    "volatility": "s",
    "resultType": "jsonb",
    "strict": false,
    "language": "sql",
    "serviceExecute": false
  },
  {
    "signature": "private.grouped_original_normalize(jsonb,jsonb,jsonb)",
    "sha256": "0743af81e482c5477a63718a5a4d2140937d496c89470cea7ab64992530164fe",
    "definer": false,
    "volatility": "i",
    "resultType": "jsonb",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.grouped_original_atoms(jsonb)",
    "sha256": "48eb87f1b3ba4efb6caff285f1d7c86acb36ecee525c5e7f0ebf366db01a68ba",
    "definer": false,
    "volatility": "i",
    "resultType": "text[]",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.grouped_original_scope(uuid,uuid)",
    "sha256": "d23da79373709d34c0154694c77612e3aee8c70044a798559a5f8a19d6031c83",
    "definer": false,
    "volatility": "v",
    "resultType": "jsonb",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.grouped_original_receipt(uuid,boolean)",
    "sha256": "82c3eb4b229a338482459159d2c581419e552163ccda6012d8064aa85a74ba2e",
    "definer": false,
    "volatility": "v",
    "resultType": "jsonb",
    "strict": false,
    "language": "sql",
    "serviceExecute": false
  },
  {
    "signature": "public.import_canonical_grouped_original(uuid,uuid,jsonb,jsonb,text)",
    "sha256": "e1b9822d9274badaa96796657ffa82c269a51b0d02ab3b8930db41c72ba0ff2f",
    "definer": true,
    "volatility": "v",
    "resultType": "jsonb",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.reject_correction_ledger_update()",
    "sha256": "4e04dcaff7d4721e1ec13dd7720cb34601617e18ffe1113b3c144b8b61bc38f7",
    "definer": false,
    "volatility": "v",
    "resultType": "trigger",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.guard_candidate_privacy_write()",
    "sha256": "3d67b52e4694e18dcb43f571e12da97cd75942324fc8323080e1daf8982e8db9",
    "definer": true,
    "volatility": "v",
    "resultType": "trigger",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "public.export_resume_workspace_records(uuid)",
    "sha256": "7e84db73e326a2d372fd3cbbd8315e0c53a24d52f3a5ced9dd25900d5b9d56cd",
    "definer": true,
    "volatility": "s",
    "resultType": "jsonb",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": true
  },
  {
    "signature": "public.export_canonical_records(uuid)",
    "sha256": "d49131630cd8d7a6cce603e5ed6c1308ce8724bfa1a4102bcce34ad85c8f40c1",
    "definer": true,
    "volatility": "s",
    "resultType": "jsonb",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": true
  },
  {
    "signature": "public.export_job_requirement_records(uuid)",
    "sha256": "42832d213c4c96f0d11ed724d8a6e06fd6a1a8f37faebb068a60bca4bff670b1",
    "definer": true,
    "volatility": "s",
    "resultType": "jsonb",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": true
  },
  {
    "signature": "public.export_authoring_records(uuid)",
    "sha256": "5bb5345d77bd4dacb2e595c094c6eb2d1cf32395e8bd9ed81db39c532422e05f",
    "definer": true,
    "volatility": "s",
    "resultType": "jsonb",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": true
  }
]$a02_old_manifest$;
  new_manifest text:=$a02_new_manifest$[
  {
    "signature": "private.correction_assert_fact_placement(jsonb,uuid,text)",
    "sha256": "dc457354f50cf9abe54f8e412338502f10d7c68275effaebf2b0d03ff68369fb",
    "definer": false,
    "volatility": "i",
    "resultType": "void",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.candidate_owner_lock_keys(uuid[])",
    "sha256": "71a245029186c9f601dd9730d5ac894a32b91431be0065538ff57f0c949b7c85",
    "definer": false,
    "volatility": "i",
    "resultType": "bigint[]",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.candidate_write_blocked(uuid)",
    "sha256": "e94533690339986bb0e0889ec2f98de0687c6061e80b490a7040e5c40cadd53b",
    "definer": true,
    "volatility": "v",
    "resultType": "boolean",
    "strict": false,
    "language": "sql",
    "serviceExecute": false
  },
  {
    "signature": "private.canonical_shape_valid(jsonb)",
    "sha256": "572ba813d4b46eadc23c7cbb39334f1e093a9f2a746e3fd26bfd324f5354ae92",
    "definer": false,
    "volatility": "i",
    "resultType": "boolean",
    "strict": false,
    "language": "sql",
    "serviceExecute": false
  },
  {
    "signature": "private.correction_admit_new(jsonb,jsonb,jsonb)",
    "sha256": "33ff0b2956f8dc84cf72a71fde1553c446d2aa1d6b887fb982326ac6393f0370",
    "definer": false,
    "volatility": "v",
    "resultType": "void",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.correction_atoms(jsonb,jsonb,jsonb)",
    "sha256": "c361ebe4f11baa3069999145b2b8da5be0f4afaca8ce1b038099e33e951c14dc",
    "definer": false,
    "volatility": "i",
    "resultType": "text[]",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.correction_child_body(jsonb,uuid,jsonb,text,uuid)",
    "sha256": "2315b0eb5aabd09ce9003268abd528dc7eb5886c5c537ed9f91eff0698a44390",
    "definer": false,
    "volatility": "v",
    "resultType": "jsonb",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.correction_citations(jsonb,uuid)",
    "sha256": "7c49ed406cc85a8395c0953b2a220f86173199e2f7448c01758a8df0ef0f710c",
    "definer": false,
    "volatility": "i",
    "resultType": "jsonb",
    "strict": false,
    "language": "sql",
    "serviceExecute": false
  },
  {
    "signature": "private.correction_command_bytes(text[])",
    "sha256": "afb4eca3cf9ebd31bf49f5ccbb62f859056c34b177b9ae4fca69dae52a47b797",
    "definer": false,
    "volatility": "i",
    "resultType": "bytea",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.correction_command_sha256(text[])",
    "sha256": "5571e9221b6738c50923c32813fc8b5f2f74306129227dab0ccb9849b66ffe67",
    "definer": false,
    "volatility": "i",
    "resultType": "text",
    "strict": false,
    "language": "sql",
    "serviceExecute": false
  },
  {
    "signature": "private.correction_fail(text)",
    "sha256": "5830ddc09c3ab01037c99910e32b7d2af71eaad41d5c0f8a8ec34e89638ac1d7",
    "definer": false,
    "volatility": "i",
    "resultType": "void",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.correction_insert_operation(jsonb,jsonb,text,uuid[],uuid[],uuid,uuid,integer,bigint,text)",
    "sha256": "bc071ad288642b50a116724ad3230864effea2fb944b637dfcd094bc07aa0d35",
    "definer": false,
    "volatility": "v",
    "resultType": "uuid",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.correction_latest(jsonb,jsonb,jsonb)",
    "sha256": "dce9e9295ec122146bc836a8ffa9c243804727da95465bf90a253ae58859267e",
    "definer": false,
    "volatility": "v",
    "resultType": "boolean",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.correction_location(jsonb,uuid)",
    "sha256": "1f8e4da690698cdef6d5b9949a5f78d10b72217bd9a87eb2d1cf0703dd98093a",
    "definer": false,
    "volatility": "i",
    "resultType": "jsonb",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.correction_normalize(jsonb,jsonb)",
    "sha256": "dd0dc4ad2ea4e8e56ee633cd395d6caf182015d37f8906f66cbd5ccc8e095764",
    "definer": false,
    "volatility": "v",
    "resultType": "jsonb",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.correction_original_import_allowed(jsonb)",
    "sha256": "7238107de85eb94472214eb2bda16a641a478e61c30d611cc101943b91775f93",
    "definer": false,
    "volatility": "v",
    "resultType": "boolean",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.correction_place(jsonb,jsonb,text,uuid,text,uuid,uuid,uuid)",
    "sha256": "6da429e9875880782057342788c472697e145ad0ceca12324349b1a5f3ca90cd",
    "definer": false,
    "volatility": "i",
    "resultType": "jsonb",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.correction_receipt(uuid,boolean)",
    "sha256": "1d58cb7258edb1a265cbb69507195b7ee1ab6d8e649be22e5559edf1378fe5ea",
    "definer": false,
    "volatility": "v",
    "resultType": "jsonb",
    "strict": false,
    "language": "sql",
    "serviceExecute": false
  },
  {
    "signature": "private.correction_replay(jsonb,jsonb,jsonb,text)",
    "sha256": "e5b954bc4ab638d132f6eb2018454b0aa7ab0e3dfb7e5a9f0a9762872a7c92f5",
    "definer": false,
    "volatility": "v",
    "resultType": "jsonb",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.correction_scope(uuid,uuid)",
    "sha256": "e64bf7f02bc07ef92eaa3e47f2c0cf471a34b146eaaa58b036c09760522c0493",
    "definer": false,
    "volatility": "v",
    "resultType": "jsonb",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.correction_selector_from_row(public.candidate_correction_assignments,uuid)",
    "sha256": "ec1be8a462926ed22ae4bb58b4a34fef76d919a5a0c7286df4d19788e75d86cc",
    "definer": false,
    "volatility": "i",
    "resultType": "jsonb",
    "strict": false,
    "language": "sql",
    "serviceExecute": false
  },
  {
    "signature": "private.correction_sorted_citations(jsonb)",
    "sha256": "b95b7924f4943f09d7976fc943289ed648572dab7c139fd053be5883a963b465",
    "definer": false,
    "volatility": "i",
    "resultType": "jsonb",
    "strict": false,
    "language": "sql",
    "serviceExecute": false
  },
  {
    "signature": "private.correction_uuid(jsonb,boolean)",
    "sha256": "602919fd3c33bfe75d0999b29879f3dc04a0215e82e92c53c87c9789c4c6c454",
    "definer": false,
    "volatility": "i",
    "resultType": "boolean",
    "strict": false,
    "language": "sql",
    "serviceExecute": false
  },
  {
    "signature": "private.correction_validate_command(jsonb,boolean)",
    "sha256": "164e99251599c9520c8eb314c2371600bf5b94a87eca6c641c9b5b2789c42afe",
    "definer": false,
    "volatility": "i",
    "resultType": "void",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.evidence_integer(jsonb,bigint,bigint)",
    "sha256": "6c4e10bfbef2d70d4a40b9c2346962b5ad5dac1415574b7b33707115d234e765",
    "definer": false,
    "volatility": "i",
    "resultType": "boolean",
    "strict": false,
    "language": "sql",
    "serviceExecute": false
  },
  {
    "signature": "private.evidence_keys(jsonb,text[])",
    "sha256": "824082145b4e705dfdf1d1be622b7fe4f6959c2fcaec5c69bb28ca0a930e5168",
    "definer": false,
    "volatility": "i",
    "resultType": "boolean",
    "strict": false,
    "language": "sql",
    "serviceExecute": false
  },
  {
    "signature": "private.lock_candidate_owners(uuid[])",
    "sha256": "f456097e005450c5cac7c2a601fc6641681bc4afdff1fab0abe649cd4562bd4a",
    "definer": false,
    "volatility": "v",
    "resultType": "void",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.save_candidate_authored_fact(uuid,uuid,jsonb,uuid,uuid,text)",
    "sha256": "a3d2c3b21e117277bb65da29976400a5130badb2c523bd7f2082ff8a6687ea27",
    "definer": false,
    "volatility": "v",
    "resultType": "jsonb",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.try_candidate_privacy_write(uuid)",
    "sha256": "89e7eec219295b7c834c284012ba7144049380935273e1505a994d38efc4156d",
    "definer": true,
    "volatility": "v",
    "resultType": "boolean",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.validate_correction_child(jsonb,uuid,uuid)",
    "sha256": "92385c2299fb20d4b339805e2cdc4a95c824afad444a4924a61acb2a6e20aecc",
    "definer": false,
    "volatility": "v",
    "resultType": "void",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.write_correction_snapshot(uuid,jsonb)",
    "sha256": "374df60f2fb2358a7a5d6c9747ab8e05ba3fddcc3384b1f21f708e86364fdf60",
    "definer": false,
    "volatility": "v",
    "resultType": "void",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "public.apply_authoring_action(uuid,uuid,jsonb,jsonb,jsonb,text)",
    "sha256": "b25b9b1fd9459834afd59c0b48fe5f65e2143e3640818ded15fa227c2b8170c2",
    "definer": true,
    "volatility": "v",
    "resultType": "jsonb",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": true
  },
  {
    "signature": "public.apply_candidate_corrections(uuid,uuid,jsonb,jsonb,text)",
    "sha256": "b562db15226cfcf5818e1e23dda0ea38282b0f54df46607172d249e063834292",
    "definer": true,
    "volatility": "v",
    "resultType": "jsonb",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": true
  },
  {
    "signature": "public.assign_candidate_correction_targets(uuid,uuid,jsonb,text)",
    "sha256": "0c8788e948b9481df2ae5a3593a5e7aba044467103f4e13c4cf7959eafb54e34",
    "definer": true,
    "volatility": "v",
    "resultType": "jsonb",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": true
  },
  {
    "signature": "public.import_canonical_original(uuid,uuid,jsonb,jsonb,jsonb,text)",
    "sha256": "1671cf3b6d3c8b0c716b2c2e5c8dc622dee70f468e3ebcdab21a2e088266f49b",
    "definer": true,
    "volatility": "v",
    "resultType": "jsonb",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": true
  },
  {
    "signature": "public.read_candidate_correction_ledger(uuid,uuid)",
    "sha256": "b380edcf9d0fb9c743ee957e00946ed05049d5b5e6345f68cd1981c1563744b8",
    "definer": true,
    "volatility": "v",
    "resultType": "jsonb",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": true
  },
  {
    "signature": "public.save_canonical_version(uuid,uuid,jsonb,jsonb,text)",
    "sha256": "5a6109303ed91cb80c916c2650cfcceed7d8f97737dc65d6e0c03cdfb3d32a1f",
    "definer": true,
    "volatility": "v",
    "resultType": "jsonb",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": true
  },
  {
    "signature": "private.grouped_import_command_bytes(text[])",
    "sha256": "74e9f591ff2958fe9b5d5f2d2f50beb3c0f77f9d70e2eac4078a8873e4f31a6e",
    "definer": false,
    "volatility": "i",
    "resultType": "bytea",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.grouped_import_command_sha256(text[])",
    "sha256": "7f389fc92cd6d1aef3c15961a77a81718ce8bcce9bc8ee8f09af5a1a3210589c",
    "definer": false,
    "volatility": "i",
    "resultType": "text",
    "strict": false,
    "language": "sql",
    "serviceExecute": false
  },
  {
    "signature": "private.grouped_import_invalid()",
    "sha256": "e8ae677933aa164cb3bd2c6343116270c21c40a515254e8c3361f1f3ed574c50",
    "definer": false,
    "volatility": "i",
    "resultType": "void",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.grouped_import_keys(jsonb,text[])",
    "sha256": "3e4ce46e18e28c4b47293508b37cf866d1c45619027e048e135d50e3e52a3155",
    "definer": false,
    "volatility": "i",
    "resultType": "boolean",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.grouped_import_whitespace()",
    "sha256": "03c21f5467b44105d8a28408cfa10d053cd81ee91022beb3709b47165d255ede",
    "definer": false,
    "volatility": "i",
    "resultType": "text",
    "strict": false,
    "language": "sql",
    "serviceExecute": false
  },
  {
    "signature": "private.grouped_import_trim(text)",
    "sha256": "36fc1b16bb7ef5e8f17db55c1d7de42611ac656d9af6e6e68473dfb43a5d93bb",
    "definer": false,
    "volatility": "i",
    "resultType": "text",
    "strict": true,
    "language": "sql",
    "serviceExecute": false
  },
  {
    "signature": "private.grouped_import_ascii_lower(text)",
    "sha256": "cf94af1d2d41e0896f93fbf4e712d692916592e5670d4ba797119870d36161f3",
    "definer": false,
    "volatility": "i",
    "resultType": "text",
    "strict": true,
    "language": "sql",
    "serviceExecute": false
  },
  {
    "signature": "private.grouped_import_utf16_length(text)",
    "sha256": "5a96204c0f13fef791f49a0f86c87baae34c5b281369492b65fb6c878027985b",
    "definer": false,
    "volatility": "i",
    "resultType": "integer",
    "strict": true,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.grouped_import_uuid(jsonb)",
    "sha256": "d564ea71a6bca9c4cdcbfe14b00fd826979cc13dcabb4d59875eda202ba6e65b",
    "definer": false,
    "volatility": "i",
    "resultType": "boolean",
    "strict": false,
    "language": "sql",
    "serviceExecute": false
  },
  {
    "signature": "private.grouped_import_source_index(jsonb,jsonb)",
    "sha256": "4b572e313df3a6ba8707045ea446806b17d804a3d31178f864cca25a46374cba",
    "definer": false,
    "volatility": "i",
    "resultType": "jsonb",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.grouped_import_same_span(text,jsonb)",
    "sha256": "2145e0f14c862f220e59d6a11d22ad96b39857d0c8096fbd79c4fcc47c68043f",
    "definer": false,
    "volatility": "i",
    "resultType": "text",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.grouped_import_flush(jsonb,boolean,jsonb)",
    "sha256": "2ddfc241029796f3cb47ac64f70208f66855cafe161926b7d77e155901e9ba78",
    "definer": false,
    "volatility": "i",
    "resultType": "jsonb",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.grouped_import_project_candidates(jsonb,jsonb)",
    "sha256": "5a9a4f9b6fe9db8b56746c031fb290c1839fe6262410ab799dbad66fd3e6f451",
    "definer": false,
    "volatility": "i",
    "resultType": "jsonb",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.grouped_import_check_refs(jsonb,jsonb)",
    "sha256": "437b7d2f71b961ce48a2d45f3e3014b49e43f703bdde2f45efdbc1e4f8c76808",
    "definer": false,
    "volatility": "i",
    "resultType": "void",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.grouped_import_place_original(jsonb,jsonb,jsonb,jsonb)",
    "sha256": "5cc017c40469f9611aa94f741062756dab1805f11296959daa76a87fbe73bd06",
    "definer": false,
    "volatility": "i",
    "resultType": "jsonb",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.entry_association_group_active(uuid,uuid)",
    "sha256": "62457d48a18d8b024dbae5fe83b371ddd4ffcc5992522b7ba08f34ba1a460289",
    "definer": false,
    "volatility": "v",
    "resultType": "boolean",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.entry_association_validate_head(uuid)",
    "sha256": "177db5fbecd38fffffaae7151db221e0e0358e246b9c5a0e74bd46d674278e47",
    "definer": false,
    "volatility": "v",
    "resultType": "void",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.entry_association_prefix(jsonb)",
    "sha256": "9b499d875b3f5f46449d9b1331a7978ed1bcda1d4cd621bd1d229013d8539979",
    "definer": false,
    "volatility": "v",
    "resultType": "jsonb",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.entry_association_write_snapshot(uuid,jsonb)",
    "sha256": "25c47b6fd0ad92bec87c3adcb55b2388514664c459b41f9455a380f5b4454a80",
    "definer": false,
    "volatility": "v",
    "resultType": "void",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.entry_association_export_records(uuid)",
    "sha256": "8daff2f43d41cab99ef417a55fdfc73cc17930dcd45923c82c6ac6004c49c1ff",
    "definer": false,
    "volatility": "s",
    "resultType": "jsonb",
    "strict": false,
    "language": "sql",
    "serviceExecute": false
  },
  {
    "signature": "private.grouped_original_normalize(jsonb,jsonb,jsonb)",
    "sha256": "0743af81e482c5477a63718a5a4d2140937d496c89470cea7ab64992530164fe",
    "definer": false,
    "volatility": "i",
    "resultType": "jsonb",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.grouped_original_atoms(jsonb)",
    "sha256": "48eb87f1b3ba4efb6caff285f1d7c86acb36ecee525c5e7f0ebf366db01a68ba",
    "definer": false,
    "volatility": "i",
    "resultType": "text[]",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.grouped_original_scope(uuid,uuid)",
    "sha256": "d23da79373709d34c0154694c77612e3aee8c70044a798559a5f8a19d6031c83",
    "definer": false,
    "volatility": "v",
    "resultType": "jsonb",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.grouped_original_receipt(uuid,boolean)",
    "sha256": "82c3eb4b229a338482459159d2c581419e552163ccda6012d8064aa85a74ba2e",
    "definer": false,
    "volatility": "v",
    "resultType": "jsonb",
    "strict": false,
    "language": "sql",
    "serviceExecute": false
  },
  {
    "signature": "public.import_canonical_grouped_original(uuid,uuid,jsonb,jsonb,text)",
    "sha256": "e1b9822d9274badaa96796657ffa82c269a51b0d02ab3b8930db41c72ba0ff2f",
    "definer": true,
    "volatility": "v",
    "resultType": "jsonb",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.reject_correction_ledger_update()",
    "sha256": "4e04dcaff7d4721e1ec13dd7720cb34601617e18ffe1113b3c144b8b61bc38f7",
    "definer": false,
    "volatility": "v",
    "resultType": "trigger",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "private.guard_candidate_privacy_write()",
    "sha256": "3d67b52e4694e18dcb43f571e12da97cd75942324fc8323080e1daf8982e8db9",
    "definer": true,
    "volatility": "v",
    "resultType": "trigger",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": false
  },
  {
    "signature": "public.export_resume_workspace_records(uuid)",
    "sha256": "7e84db73e326a2d372fd3cbbd8315e0c53a24d52f3a5ced9dd25900d5b9d56cd",
    "definer": true,
    "volatility": "s",
    "resultType": "jsonb",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": true
  },
  {
    "signature": "public.export_canonical_records(uuid)",
    "sha256": "d49131630cd8d7a6cce603e5ed6c1308ce8724bfa1a4102bcce34ad85c8f40c1",
    "definer": true,
    "volatility": "s",
    "resultType": "jsonb",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": true
  },
  {
    "signature": "public.export_job_requirement_records(uuid)",
    "sha256": "42832d213c4c96f0d11ed724d8a6e06fd6a1a8f37faebb068a60bca4bff670b1",
    "definer": true,
    "volatility": "s",
    "resultType": "jsonb",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": true
  },
  {
    "signature": "public.export_authoring_records(uuid)",
    "sha256": "5bb5345d77bd4dacb2e595c094c6eb2d1cf32395e8bd9ed81db39c532422e05f",
    "definer": true,
    "volatility": "s",
    "resultType": "jsonb",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": true
  },
  {
    "signature": "public.read_grouped_original_workspace(uuid,uuid)",
    "sha256": "1fd0207d21a252acc3c869d8555e5a809e775a35d458aa79e13ae324dfc10bfe",
    "definer": true,
    "volatility": "v",
    "resultType": "jsonb",
    "strict": false,
    "language": "plpgsql",
    "serviceExecute": true
  }
]$a02_new_manifest$;
begin
  select * into strict routine from pg_catalog.pg_proc where oid=to_regprocedure('private.canonical_correction_write_ready()');
  if encode(extensions.digest(convert_to(routine.prosrc,'UTF8'),'sha256'),'hex') is distinct from predecessor
    or routine.prosecdef or routine.provolatile<>'s' or routine.proisstrict or routine.proretset
    or routine.prorettype<>'boolean'::regtype or routine.prokind<>'f'
    or routine.prolang<>(select oid from pg_catalog.pg_language where lanname='plpgsql')
    or routine.proconfig is distinct from array['search_path=""']
    or exists(select 1 from aclexplode(coalesce(routine.proacl,acldefault('f',routine.proowner))) where grantee=0 and privilege_type='EXECUTE')
    or has_function_privilege('anon',routine.oid,'EXECUTE') or has_function_privilege('authenticated',routine.oid,'EXECUTE')
    or has_function_privilege('service_role',routine.oid,'EXECUTE') then
    raise exception 'A02_READ_PROFILE_PREDECESSOR_DRIFT' using errcode='23514'; end if;
  source:=routine.prosrc;
  if (length(source)-length(replace(source,old_manifest,'')))/length(old_manifest)<>1 then
    raise exception 'A02_READ_PROFILE_CONTEXT_DRIFT' using errcode='23514'; end if;
  next_source:=replace(source,old_manifest,new_manifest);
  if encode(extensions.digest(convert_to(next_source,'UTF8'),'sha256'),'hex') is distinct from postimage then
    raise exception 'A02_READ_PROFILE_POSTIMAGE_DRIFT' using errcode='23514'; end if;
  definition:=pg_get_functiondef(routine.oid);
  if (length(definition)-length(replace(definition,source,'')))/length(source)<>1 then
    raise exception 'A02_READ_PROFILE_DEFINITION_DRIFT' using errcode='23514'; end if;
  execute replace(definition,source,next_source);
end;
$a02_read_profile$;
commit;
