-- DEFERRED NATIVE VERIFIER SOURCE. UNPARSED / UNEXECUTED. Requires isolated privileged SQL owner.
-- The initial raw canonical is a labelled privileged metadata fixture. Actual new writes use the real denied RPC.
-- Does not grant service_role, simulate two-session concurrency or establish cutover/release.
begin;
do $era_external_pin$ begin
  if encode(extensions.digest(convert_to((select prosrc from pg_catalog.pg_proc where oid=to_regprocedure('private.canonical_correction_write_ready()')),'UTF8'),'sha256'),'hex')<>'de6e71fed03732a391e35226d20816acd207267eef5f09c27017cee1f054f3fd' then raise exception 'ERA_READINESS_PIN_DRIFT' using errcode='23514'; end if;
end; $era_external_pin$;
create function pg_temp.era_assert(p_ok boolean,p_case text) returns void language plpgsql set search_path='' as $$
begin if p_ok is not true then raise exception 'ERA_CASE_%',p_case using errcode='23514'; end if; end; $$;
create function pg_temp.era_store(p_body jsonb,p_revision integer) returns jsonb language plpgsql set search_path='' as $$
begin
  insert into public.canonical_resume_versions(id,resume_id,source_resume_version_id,organization_id,owner_id,locale,state,content,created_at,
    parent_version_id,source_evidence_version_id,revision,idempotency_key,command,request_id)
    values((p_body->>'versionId')::uuid,(p_body->>'resumeId')::uuid,'10000000-0000-4000-8000-000000000004',
      (p_body->>'organizationId')::uuid,(p_body->>'ownerId')::uuid,p_body->>'locale',p_body->>'state',p_body,(p_body->>'createdAt')::timestamptz,
      (p_body->>'parentVersionId')::uuid,(p_body->>'sourceEvidenceVersionId')::uuid,p_revision,gen_random_uuid(),'{"operation":"privileged_metadata_fixture"}','erg-source-fixture');
  insert into public.resume_facts(canonical_version_id,id,organization_id,owner_id,type,value,state,sources,confirmation)
    select (p_body->>'versionId')::uuid,(value->>'id')::uuid,(p_body->>'organizationId')::uuid,(p_body->>'ownerId')::uuid,
      value->>'type',value->>'value',value->>'state',value->'sources',nullif(value->'confirmation','null'::jsonb) from jsonb_array_elements(p_body->'facts');
  return jsonb_build_object('versionId',p_body->'versionId','revision',p_revision,'contentSha256',
    encode(extensions.digest(convert_to(p_body::text,'UTF8'),'sha256'),'hex'),'locale',p_body->'locale');
end;
$$;
create function pg_temp.era_command(p_normal jsonb,p_key uuid) returns jsonb language sql set search_path='' as $$
  select jsonb_build_object('normalForm',p_normal,'previewHash',private.grouped_import_command_sha256(private.entry_regroup_atoms(p_normal)),'idempotencyKey',p_key); $$;
create function pg_temp.era_manual(p_head uuid,p_op text,p_fact uuid,p_value text,p_target uuid default null) returns uuid language plpgsql set search_path='' as $$
declare parent jsonb; doc jsonb; event jsonb; command jsonb; result jsonb; prior text; v uuid:=gen_random_uuid(); created text:='2026-11-13T18:30:00.000Z';
begin
  select content into strict parent from public.canonical_resume_versions where id=p_head;
  doc:=parent;
  if p_op='rollback' then select content into strict doc from public.canonical_resume_versions where id=p_target;
  elsif p_op='rename_section' then prior:=doc->'sections'->0->>'title'; doc:=jsonb_set(doc,'{sections,0,title}',to_jsonb(p_value));
  else
    select value->>'value' into strict prior from jsonb_array_elements(doc->'facts') where value->>'id'=p_fact::text;
    doc:=jsonb_set(doc,'{facts}',(select jsonb_agg(case when value->>'id'=p_fact::text then
      case when p_op='confirm' then value||jsonb_build_object('state','candidate_confirmed','confirmation',jsonb_build_object('actorId',parent->'ownerId','value',prior,'confirmedAt',created))
      else value||jsonb_build_object('value',p_value,'state','unconfirmed','sources','[]'::jsonb,'confirmation',null) end else value end order by ordinality) from jsonb_array_elements(doc->'facts') with ordinality));
  end if;
  event:=jsonb_build_object('id',gen_random_uuid(),'actorId',parent->'ownerId','action',case when p_op='rollback' then 'rollback' else 'edit' end,
    'targetId',case when p_op='rollback' then v when p_op='rename_section' then (parent->'sections'->0->>'id')::uuid else p_fact end,
    'priorValue',case when p_op='rollback' then null else prior end,'createdAt',created);
  doc:=doc||jsonb_build_object('versionId',v,'parentVersionId',p_head,'createdAt',created,'state','review_required','changes',jsonb_build_array(event));
  command:=jsonb_build_object('operation',p_op,'expectedVersionId',p_head,'idempotencyKey',gen_random_uuid(),'factId',p_fact,
    'value',case when p_op in ('edit','rename_section') then p_value else null end,'targetVersionId',p_target);
  if p_op='rename_section' then command:=command||jsonb_build_object('sectionId',parent->'sections'->0->'id'); end if;
  result:=public.save_canonical_version((parent->>'ownerId')::uuid,'10000000-0000-4000-8000-000000000004',doc,command,'era-native-fixture');
  perform pg_temp.era_assert(result->>'status'='applied','ordinary_'||p_op); return (result->>'versionId')::uuid;
end; $$;
do $era_native$
#variable_conflict use_variable
<<fixture>>
declare oracle jsonb:=$era_oracle${
  "evidence": {
    "id": "10000000-0000-4000-8000-000000000001",
    "ownerId": "10000000-0000-4000-8000-000000000002",
    "analysisId": "10000000-0000-4000-8000-000000000003",
    "sourceId": "10000000-0000-4000-8000-000000000004",
    "inputSha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "createdAt": "2026-11-13T00:00:00.000Z",
    "retentionPolicyId": "synthetic/1.0.0",
    "schemaVersion": "evidence/2.0.0",
    "fieldExtractorVersion": "evidence-fields/1.0.1",
    "nativeSource": {
      "schemaVersion": "native-evidence-v1",
      "extractorVersion": "unpdf-v1",
      "offsetUnit": "unicode_code_point",
      "pages": [
        {
          "id": "page-1",
          "pageNumber": 1,
          "text": "Experience\nEmployer: Synthetic Alpha Labs\nRole: Platform Engineer\nDates: 2020 - 2022\nEmployer: Synthetic Beta Labs\nRole: Data Engineer\nDates: 2021 - 2023",
          "method": "native_text",
          "confidence": "uncalibrated"
        }
      ],
      "spans": [
        {
          "id": "page-1-line-1",
          "pageId": "page-1",
          "start": 0,
          "end": 10,
          "text": "Experience"
        },
        {
          "id": "page-1-line-2",
          "pageId": "page-1",
          "start": 11,
          "end": 41,
          "text": "Employer: Synthetic Alpha Labs"
        },
        {
          "id": "page-1-line-3",
          "pageId": "page-1",
          "start": 42,
          "end": 65,
          "text": "Role: Platform Engineer"
        },
        {
          "id": "page-1-line-4",
          "pageId": "page-1",
          "start": 66,
          "end": 84,
          "text": "Dates: 2020 - 2022"
        },
        {
          "id": "page-1-line-5",
          "pageId": "page-1",
          "start": 85,
          "end": 114,
          "text": "Employer: Synthetic Beta Labs"
        },
        {
          "id": "page-1-line-6",
          "pageId": "page-1",
          "start": 115,
          "end": 134,
          "text": "Role: Data Engineer"
        },
        {
          "id": "page-1-line-7",
          "pageId": "page-1",
          "start": 135,
          "end": 153,
          "text": "Dates: 2021 - 2023"
        }
      ],
      "assertions": [
        {
          "field": "name",
          "value": null,
          "state": "not_evaluated",
          "confidence": "uncalibrated",
          "evidence": null
        },
        {
          "field": "email",
          "value": null,
          "state": "not_evaluated",
          "confidence": "uncalibrated",
          "evidence": null
        },
        {
          "field": "phone",
          "value": null,
          "state": "not_evaluated",
          "confidence": "uncalibrated",
          "evidence": null
        }
      ]
    },
    "ocrSource": null,
    "ocrFailure": null,
    "status": "review_required",
    "scoringEligible": false,
    "confidence": {
      "kind": "uncalibrated",
      "reason": "calibration_not_approved"
    },
    "spans": [
      {
        "id": "native-page-1-line-1",
        "pageId": "page-1",
        "method": "native_text",
        "text": "Experience",
        "start": 0,
        "end": 10,
        "box": null,
        "confidence": {
          "kind": "uncalibrated",
          "value": null
        }
      },
      {
        "id": "native-page-1-line-2",
        "pageId": "page-1",
        "method": "native_text",
        "text": "Employer: Synthetic Alpha Labs",
        "start": 11,
        "end": 41,
        "box": null,
        "confidence": {
          "kind": "uncalibrated",
          "value": null
        }
      },
      {
        "id": "native-page-1-line-3",
        "pageId": "page-1",
        "method": "native_text",
        "text": "Role: Platform Engineer",
        "start": 42,
        "end": 65,
        "box": null,
        "confidence": {
          "kind": "uncalibrated",
          "value": null
        }
      },
      {
        "id": "native-page-1-line-4",
        "pageId": "page-1",
        "method": "native_text",
        "text": "Dates: 2020 - 2022",
        "start": 66,
        "end": 84,
        "box": null,
        "confidence": {
          "kind": "uncalibrated",
          "value": null
        }
      },
      {
        "id": "native-page-1-line-5",
        "pageId": "page-1",
        "method": "native_text",
        "text": "Employer: Synthetic Beta Labs",
        "start": 85,
        "end": 114,
        "box": null,
        "confidence": {
          "kind": "uncalibrated",
          "value": null
        }
      },
      {
        "id": "native-page-1-line-6",
        "pageId": "page-1",
        "method": "native_text",
        "text": "Role: Data Engineer",
        "start": 115,
        "end": 134,
        "box": null,
        "confidence": {
          "kind": "uncalibrated",
          "value": null
        }
      },
      {
        "id": "native-page-1-line-7",
        "pageId": "page-1",
        "method": "native_text",
        "text": "Dates: 2021 - 2023",
        "start": 135,
        "end": 153,
        "box": null,
        "confidence": {
          "kind": "uncalibrated",
          "value": null
        }
      }
    ],
    "assertions": [
      {
        "id": "assertion-1",
        "field": "employer",
        "value": "Synthetic Alpha Labs",
        "evidence": [
          {
            "spanId": "native-page-1-line-2",
            "start": 10,
            "end": 30
          }
        ],
        "state": "review_required",
        "confidence": {
          "kind": "uncalibrated",
          "value": null
        }
      },
      {
        "id": "assertion-2",
        "field": "role",
        "value": "Platform Engineer",
        "evidence": [
          {
            "spanId": "native-page-1-line-3",
            "start": 6,
            "end": 23
          }
        ],
        "state": "review_required",
        "confidence": {
          "kind": "uncalibrated",
          "value": null
        }
      },
      {
        "id": "assertion-3",
        "field": "dates",
        "value": "2020 - 2022",
        "evidence": [
          {
            "spanId": "native-page-1-line-4",
            "start": 7,
            "end": 18
          }
        ],
        "state": "review_required",
        "confidence": {
          "kind": "uncalibrated",
          "value": null
        }
      },
      {
        "id": "assertion-4",
        "field": "employer",
        "value": "Synthetic Beta Labs",
        "evidence": [
          {
            "spanId": "native-page-1-line-5",
            "start": 10,
            "end": 29
          }
        ],
        "state": "review_required",
        "confidence": {
          "kind": "uncalibrated",
          "value": null
        }
      },
      {
        "id": "assertion-5",
        "field": "role",
        "value": "Data Engineer",
        "evidence": [
          {
            "spanId": "native-page-1-line-6",
            "start": 6,
            "end": 19
          }
        ],
        "state": "review_required",
        "confidence": {
          "kind": "uncalibrated",
          "value": null
        }
      },
      {
        "id": "assertion-6",
        "field": "dates",
        "value": "2021 - 2023",
        "evidence": [
          {
            "spanId": "native-page-1-line-7",
            "start": 7,
            "end": 18
          }
        ],
        "state": "review_required",
        "confidence": {
          "kind": "uncalibrated",
          "value": null
        }
      }
    ],
    "fields": [
      {
        "field": "name",
        "state": "not_evaluated"
      },
      {
        "field": "email",
        "state": "not_evaluated"
      },
      {
        "field": "phone",
        "state": "not_evaluated"
      },
      {
        "field": "employer",
        "state": "conflict"
      },
      {
        "field": "role",
        "state": "conflict"
      },
      {
        "field": "dates",
        "state": "conflict"
      },
      {
        "field": "education",
        "state": "not_evaluated"
      },
      {
        "field": "certification",
        "state": "not_evaluated"
      }
    ],
    "blockers": [
      "uncalibrated_confidence",
      "missing_critical_fields",
      "conflicting_critical_fields"
    ]
  },
  "base": {
    "schemaVersion": "canonical-resume/1.0.0",
    "producerVersion": "canonical-engine/1.0.1",
    "analysisId": "10000000-0000-4000-8000-000000000003",
    "inputSha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "retentionPolicyId": "synthetic/1.0.0",
    "resumeId": "10000000-0000-4000-8000-000000000005",
    "versionId": "10000000-0000-4000-8000-000000000100",
    "parentVersionId": null,
    "ownerId": "10000000-0000-4000-8000-000000000002",
    "organizationId": "10000000-0000-4000-8000-000000000006",
    "locale": "en-IN",
    "createdAt": "2026-11-13T00:00:00.000Z",
    "state": "review_required",
    "sourceEvidenceVersionId": "10000000-0000-4000-8000-000000000001",
    "contactFactIds": [],
    "facts": [
      {
        "id": "10000000-0000-4000-8000-000000000101",
        "type": "employer",
        "value": "Synthetic Alpha Labs",
        "state": "unconfirmed",
        "sources": [
          {
            "attemptId": "10000000-0000-4000-8000-000000000001",
            "spanId": "native-page-1-line-2",
            "start": 10,
            "end": 30
          }
        ],
        "confirmation": null
      },
      {
        "id": "10000000-0000-4000-8000-000000000102",
        "type": "role",
        "value": "Platform Engineer",
        "state": "unconfirmed",
        "sources": [
          {
            "attemptId": "10000000-0000-4000-8000-000000000001",
            "spanId": "native-page-1-line-3",
            "start": 6,
            "end": 23
          }
        ],
        "confirmation": null
      },
      {
        "id": "10000000-0000-4000-8000-000000000103",
        "type": "dates",
        "value": "2020 - 2022",
        "state": "unconfirmed",
        "sources": [
          {
            "attemptId": "10000000-0000-4000-8000-000000000001",
            "spanId": "native-page-1-line-4",
            "start": 7,
            "end": 18
          }
        ],
        "confirmation": null
      },
      {
        "id": "10000000-0000-4000-8000-000000000104",
        "type": "employer",
        "value": "Synthetic Beta Labs",
        "state": "unconfirmed",
        "sources": [
          {
            "attemptId": "10000000-0000-4000-8000-000000000001",
            "spanId": "native-page-1-line-5",
            "start": 10,
            "end": 29
          }
        ],
        "confirmation": null
      },
      {
        "id": "10000000-0000-4000-8000-000000000105",
        "type": "role",
        "value": "Data Engineer",
        "state": "unconfirmed",
        "sources": [
          {
            "attemptId": "10000000-0000-4000-8000-000000000001",
            "spanId": "native-page-1-line-6",
            "start": 6,
            "end": 19
          }
        ],
        "confirmation": null
      },
      {
        "id": "10000000-0000-4000-8000-000000000106",
        "type": "dates",
        "value": "2021 - 2023",
        "state": "unconfirmed",
        "sources": [
          {
            "attemptId": "10000000-0000-4000-8000-000000000001",
            "spanId": "native-page-1-line-7",
            "start": 7,
            "end": 18
          }
        ],
        "confirmation": null
      }
    ],
    "sections": [
      {
        "id": "10000000-0000-4000-8000-000000000107",
        "type": "experience",
        "title": "Experience",
        "factIds": [],
        "entries": [
          {
            "id": "10000000-0000-4000-8000-000000000108",
            "factIds": [
              "10000000-0000-4000-8000-000000000101"
            ],
            "bullets": []
          },
          {
            "id": "10000000-0000-4000-8000-000000000109",
            "factIds": [
              "10000000-0000-4000-8000-000000000102"
            ],
            "bullets": []
          },
          {
            "id": "10000000-0000-4000-8000-000000000110",
            "factIds": [
              "10000000-0000-4000-8000-000000000103"
            ],
            "bullets": []
          },
          {
            "id": "10000000-0000-4000-8000-000000000111",
            "factIds": [
              "10000000-0000-4000-8000-000000000104"
            ],
            "bullets": []
          },
          {
            "id": "10000000-0000-4000-8000-000000000112",
            "factIds": [
              "10000000-0000-4000-8000-000000000105"
            ],
            "bullets": []
          },
          {
            "id": "10000000-0000-4000-8000-000000000113",
            "factIds": [
              "10000000-0000-4000-8000-000000000106"
            ],
            "bullets": []
          }
        ]
      }
    ],
    "changes": [
      {
        "id": "10000000-0000-4000-8000-000000000114",
        "actorId": "10000000-0000-4000-8000-000000000002",
        "action": "import",
        "targetId": "10000000-0000-4000-8000-000000000100",
        "priorValue": null,
        "createdAt": "2026-11-13T00:00:00.000Z"
      }
    ]
  },
  "first": {
    "request": {
      "schemaVersion": "canonical-entry-regroup-command/1.0.0",
      "operation": "approve_whole_entry_regroup",
      "binding": {
        "ownerId": "10000000-0000-4000-8000-000000000002",
        "analysisId": "10000000-0000-4000-8000-000000000003",
        "sourceId": "10000000-0000-4000-8000-000000000004",
        "inputSha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "attemptId": "10000000-0000-4000-8000-000000000001",
        "resumeId": "10000000-0000-4000-8000-000000000005",
        "organizationId": "10000000-0000-4000-8000-000000000006",
        "evidenceSchemaVersion": "evidence/2.0.0",
        "fieldExtractorVersion": "evidence-fields/1.0.1",
        "targetModelVersion": "evidence-targets/1.0.0",
        "associationModelVersion": "evidence-entry-associations/1.0.0",
        "producerVersion": "canonical-engine/1.0.4",
        "admissionPolicyVersion": "whole-entry-regroup-admission/1.0.0",
        "structuralTextProfileVersion": "a02-structural-text/1.0.0",
        "correctionProjectionModelVersion": "canonical-corrections/1.0.1",
        "correctionAdmissionPolicyVersion": "candidate-correction-admission/1.0.0",
        "regroupModelVersion": "canonical-entry-regroup/1.0.0"
      },
      "base": {
        "versionId": "10000000-0000-4000-8000-000000000100",
        "revision": 1,
        "contentSha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        "locale": "en-IN"
      },
      "expected": {
        "reviewRevision": 0,
        "reviewHeadId": null,
        "assignmentRevision": 0,
        "assignmentHeadId": null,
        "associationRevision": 0,
        "associationHeadId": null,
        "regroupRevision": 0,
        "regroupHeadId": null,
        "canonicalHeadId": "10000000-0000-4000-8000-000000000100"
      },
      "selections": [
        {
          "groupId": "entry-association-1036212579a5a6954c04df1e78a8d8efad6fdda28830f8849823bab1975597ac",
          "factIds": [
            "10000000-0000-4000-8000-000000000101",
            "10000000-0000-4000-8000-000000000102",
            "10000000-0000-4000-8000-000000000103"
          ]
        }
      ],
      "unselectedDisposition": "retain_eligible_original_origins"
    },
    "command": {
      "normalForm": {
        "schemaVersion": "canonical-entry-regroup-command/1.0.0",
        "operation": "approve_whole_entry_regroup",
        "binding": {
          "ownerId": "10000000-0000-4000-8000-000000000002",
          "organizationId": "10000000-0000-4000-8000-000000000006",
          "resumeId": "10000000-0000-4000-8000-000000000005",
          "analysisId": "10000000-0000-4000-8000-000000000003",
          "sourceId": "10000000-0000-4000-8000-000000000004",
          "attemptId": "10000000-0000-4000-8000-000000000001",
          "inputSha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          "evidenceSchemaVersion": "evidence/2.0.0",
          "fieldExtractorVersion": "evidence-fields/1.0.1",
          "targetModelVersion": "evidence-targets/1.0.0",
          "associationModelVersion": "evidence-entry-associations/1.0.0",
          "producerVersion": "canonical-engine/1.0.4",
          "admissionPolicyVersion": "whole-entry-regroup-admission/1.0.0",
          "structuralTextProfileVersion": "a02-structural-text/1.0.0",
          "correctionProjectionModelVersion": "canonical-corrections/1.0.1",
          "correctionAdmissionPolicyVersion": "candidate-correction-admission/1.0.0",
          "regroupModelVersion": "canonical-entry-regroup/1.0.0"
        },
        "base": {
          "versionId": "10000000-0000-4000-8000-000000000100",
          "revision": 1,
          "contentSha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          "locale": "en-IN"
        },
        "expected": {
          "reviewRevision": 0,
          "reviewHeadId": null,
          "assignmentRevision": 0,
          "assignmentHeadId": null,
          "associationRevision": 0,
          "associationHeadId": null,
          "regroupRevision": 0,
          "regroupHeadId": null,
          "canonicalHeadId": "10000000-0000-4000-8000-000000000100"
        },
        "acknowledgementPolicy": "whole_entry_merge_not_fact_confirmation",
        "acknowledgement": true,
        "unselectedDisposition": "retain_eligible_original_origins",
        "selections": [
          {
            "pageId": "page-1",
            "method": "native_text",
            "sectionId": "10000000-0000-4000-8000-000000000107",
            "anchorEntryId": "10000000-0000-4000-8000-000000000108",
            "insertionIndex": 0,
            "affectedEntryIds": [
              "10000000-0000-4000-8000-000000000108",
              "10000000-0000-4000-8000-000000000109",
              "10000000-0000-4000-8000-000000000110"
            ],
            "members": [
              {
                "assertionId": "assertion-1",
                "field": "employer",
                "factId": "10000000-0000-4000-8000-000000000101",
                "citations": [
                  {
                    "attemptId": "10000000-0000-4000-8000-000000000001",
                    "spanId": "native-page-1-line-2",
                    "pageId": "page-1",
                    "method": "native_text",
                    "start": 10,
                    "end": 30,
                    "pageStart": 21,
                    "pageEnd": 41
                  }
                ],
                "mappedThrough": "current_citations",
                "originVersionId": null,
                "location": {
                  "kind": "entry",
                  "sectionId": "10000000-0000-4000-8000-000000000107",
                  "entryId": "10000000-0000-4000-8000-000000000108",
                  "bulletId": null
                }
              },
              {
                "assertionId": "assertion-2",
                "field": "role",
                "factId": "10000000-0000-4000-8000-000000000102",
                "citations": [
                  {
                    "attemptId": "10000000-0000-4000-8000-000000000001",
                    "spanId": "native-page-1-line-3",
                    "pageId": "page-1",
                    "method": "native_text",
                    "start": 6,
                    "end": 23,
                    "pageStart": 48,
                    "pageEnd": 65
                  }
                ],
                "mappedThrough": "current_citations",
                "originVersionId": null,
                "location": {
                  "kind": "entry",
                  "sectionId": "10000000-0000-4000-8000-000000000107",
                  "entryId": "10000000-0000-4000-8000-000000000109",
                  "bulletId": null
                }
              },
              {
                "assertionId": "assertion-3",
                "field": "dates",
                "factId": "10000000-0000-4000-8000-000000000103",
                "citations": [
                  {
                    "attemptId": "10000000-0000-4000-8000-000000000001",
                    "spanId": "native-page-1-line-4",
                    "pageId": "page-1",
                    "method": "native_text",
                    "start": 7,
                    "end": 18,
                    "pageStart": 73,
                    "pageEnd": 84
                  }
                ],
                "mappedThrough": "current_citations",
                "originVersionId": null,
                "location": {
                  "kind": "entry",
                  "sectionId": "10000000-0000-4000-8000-000000000107",
                  "entryId": "10000000-0000-4000-8000-000000000110",
                  "bulletId": null
                }
              }
            ]
          }
        ]
      },
      "previewHash": "f81d2b731d1ef9ca4318775f9ed20631ba367c06addb47c363f4da82bdfb090e",
      "idempotencyKey": "90000000-0000-4000-8000-000000000010"
    },
    "sections": [
      {
        "id": "10000000-0000-4000-8000-000000000107",
        "type": "experience",
        "title": "Experience",
        "factIds": [],
        "entries": [
          {
            "id": "10000000-0000-4000-8000-000000000108",
            "factIds": [
              "10000000-0000-4000-8000-000000000101",
              "10000000-0000-4000-8000-000000000102",
              "10000000-0000-4000-8000-000000000103"
            ],
            "bullets": []
          },
          {
            "id": "10000000-0000-4000-8000-000000000111",
            "factIds": [
              "10000000-0000-4000-8000-000000000104"
            ],
            "bullets": []
          },
          {
            "id": "10000000-0000-4000-8000-000000000112",
            "factIds": [
              "10000000-0000-4000-8000-000000000105"
            ],
            "bullets": []
          },
          {
            "id": "10000000-0000-4000-8000-000000000113",
            "factIds": [
              "10000000-0000-4000-8000-000000000106"
            ],
            "bullets": []
          }
        ]
      }
    ],
    "changed": true
  },
  "child": {
    "schemaVersion": "canonical-resume/1.0.0",
    "producerVersion": "canonical-engine/1.0.4",
    "analysisId": "10000000-0000-4000-8000-000000000003",
    "inputSha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "retentionPolicyId": "synthetic/1.0.0",
    "resumeId": "10000000-0000-4000-8000-000000000005",
    "versionId": "90000000-0000-4000-8000-000000000011",
    "parentVersionId": "10000000-0000-4000-8000-000000000100",
    "ownerId": "10000000-0000-4000-8000-000000000002",
    "organizationId": "10000000-0000-4000-8000-000000000006",
    "locale": "en-IN",
    "createdAt": "2026-11-13T18:00:00.000Z",
    "state": "review_required",
    "sourceEvidenceVersionId": "10000000-0000-4000-8000-000000000001",
    "contactFactIds": [],
    "facts": [
      {
        "id": "10000000-0000-4000-8000-000000000101",
        "type": "employer",
        "value": "Synthetic Alpha Labs",
        "state": "unconfirmed",
        "sources": [
          {
            "attemptId": "10000000-0000-4000-8000-000000000001",
            "spanId": "native-page-1-line-2",
            "start": 10,
            "end": 30
          }
        ],
        "confirmation": null
      },
      {
        "id": "10000000-0000-4000-8000-000000000102",
        "type": "role",
        "value": "Platform Engineer",
        "state": "unconfirmed",
        "sources": [
          {
            "attemptId": "10000000-0000-4000-8000-000000000001",
            "spanId": "native-page-1-line-3",
            "start": 6,
            "end": 23
          }
        ],
        "confirmation": null
      },
      {
        "id": "10000000-0000-4000-8000-000000000103",
        "type": "dates",
        "value": "2020 - 2022",
        "state": "unconfirmed",
        "sources": [
          {
            "attemptId": "10000000-0000-4000-8000-000000000001",
            "spanId": "native-page-1-line-4",
            "start": 7,
            "end": 18
          }
        ],
        "confirmation": null
      },
      {
        "id": "10000000-0000-4000-8000-000000000104",
        "type": "employer",
        "value": "Synthetic Beta Labs",
        "state": "unconfirmed",
        "sources": [
          {
            "attemptId": "10000000-0000-4000-8000-000000000001",
            "spanId": "native-page-1-line-5",
            "start": 10,
            "end": 29
          }
        ],
        "confirmation": null
      },
      {
        "id": "10000000-0000-4000-8000-000000000105",
        "type": "role",
        "value": "Data Engineer",
        "state": "unconfirmed",
        "sources": [
          {
            "attemptId": "10000000-0000-4000-8000-000000000001",
            "spanId": "native-page-1-line-6",
            "start": 6,
            "end": 19
          }
        ],
        "confirmation": null
      },
      {
        "id": "10000000-0000-4000-8000-000000000106",
        "type": "dates",
        "value": "2021 - 2023",
        "state": "unconfirmed",
        "sources": [
          {
            "attemptId": "10000000-0000-4000-8000-000000000001",
            "spanId": "native-page-1-line-7",
            "start": 7,
            "end": 18
          }
        ],
        "confirmation": null
      }
    ],
    "sections": [
      {
        "id": "10000000-0000-4000-8000-000000000107",
        "type": "experience",
        "title": "Experience",
        "factIds": [],
        "entries": [
          {
            "id": "10000000-0000-4000-8000-000000000108",
            "factIds": [
              "10000000-0000-4000-8000-000000000101",
              "10000000-0000-4000-8000-000000000102",
              "10000000-0000-4000-8000-000000000103"
            ],
            "bullets": []
          },
          {
            "id": "10000000-0000-4000-8000-000000000111",
            "factIds": [
              "10000000-0000-4000-8000-000000000104"
            ],
            "bullets": []
          },
          {
            "id": "10000000-0000-4000-8000-000000000112",
            "factIds": [
              "10000000-0000-4000-8000-000000000105"
            ],
            "bullets": []
          },
          {
            "id": "10000000-0000-4000-8000-000000000113",
            "factIds": [
              "10000000-0000-4000-8000-000000000106"
            ],
            "bullets": []
          }
        ]
      }
    ],
    "changes": [
      {
        "id": "90000000-0000-4000-8000-000000000012",
        "actorId": "10000000-0000-4000-8000-000000000002",
        "action": "edit",
        "targetId": "10000000-0000-4000-8000-000000000005",
        "priorValue": null,
        "createdAt": "2026-11-13T18:00:00.000Z"
      }
    ]
  },
  "second": {
    "request": {
      "schemaVersion": "canonical-entry-regroup-command/1.0.0",
      "operation": "approve_whole_entry_regroup",
      "binding": {
        "ownerId": "10000000-0000-4000-8000-000000000002",
        "analysisId": "10000000-0000-4000-8000-000000000003",
        "sourceId": "10000000-0000-4000-8000-000000000004",
        "inputSha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "attemptId": "10000000-0000-4000-8000-000000000001",
        "resumeId": "10000000-0000-4000-8000-000000000005",
        "organizationId": "10000000-0000-4000-8000-000000000006",
        "evidenceSchemaVersion": "evidence/2.0.0",
        "fieldExtractorVersion": "evidence-fields/1.0.1",
        "targetModelVersion": "evidence-targets/1.0.0",
        "associationModelVersion": "evidence-entry-associations/1.0.0",
        "producerVersion": "canonical-engine/1.0.4",
        "admissionPolicyVersion": "whole-entry-regroup-admission/1.0.0",
        "structuralTextProfileVersion": "a02-structural-text/1.0.0",
        "correctionProjectionModelVersion": "canonical-corrections/1.0.1",
        "correctionAdmissionPolicyVersion": "candidate-correction-admission/1.0.0",
        "regroupModelVersion": "canonical-entry-regroup/1.0.0"
      },
      "base": {
        "versionId": "90000000-0000-4000-8000-000000000011",
        "revision": 2,
        "contentSha256": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        "locale": "en-IN"
      },
      "expected": {
        "reviewRevision": 0,
        "reviewHeadId": null,
        "assignmentRevision": 0,
        "assignmentHeadId": null,
        "associationRevision": 0,
        "associationHeadId": null,
        "regroupRevision": 1,
        "regroupHeadId": "90000000-0000-4000-8000-000000000013",
        "canonicalHeadId": "90000000-0000-4000-8000-000000000011"
      },
      "selections": [
        {
          "groupId": "entry-association-308c9d651e3adc564eca1807b2641f3f171d7ea0e64aeb1e8e199c78ecc00a82",
          "factIds": [
            "10000000-0000-4000-8000-000000000104",
            "10000000-0000-4000-8000-000000000105",
            "10000000-0000-4000-8000-000000000106"
          ]
        }
      ],
      "unselectedDisposition": "retain_eligible_original_origins"
    },
    "command": {
      "normalForm": {
        "schemaVersion": "canonical-entry-regroup-command/1.0.0",
        "operation": "approve_whole_entry_regroup",
        "binding": {
          "ownerId": "10000000-0000-4000-8000-000000000002",
          "organizationId": "10000000-0000-4000-8000-000000000006",
          "resumeId": "10000000-0000-4000-8000-000000000005",
          "analysisId": "10000000-0000-4000-8000-000000000003",
          "sourceId": "10000000-0000-4000-8000-000000000004",
          "attemptId": "10000000-0000-4000-8000-000000000001",
          "inputSha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          "evidenceSchemaVersion": "evidence/2.0.0",
          "fieldExtractorVersion": "evidence-fields/1.0.1",
          "targetModelVersion": "evidence-targets/1.0.0",
          "associationModelVersion": "evidence-entry-associations/1.0.0",
          "producerVersion": "canonical-engine/1.0.4",
          "admissionPolicyVersion": "whole-entry-regroup-admission/1.0.0",
          "structuralTextProfileVersion": "a02-structural-text/1.0.0",
          "correctionProjectionModelVersion": "canonical-corrections/1.0.1",
          "correctionAdmissionPolicyVersion": "candidate-correction-admission/1.0.0",
          "regroupModelVersion": "canonical-entry-regroup/1.0.0"
        },
        "base": {
          "versionId": "90000000-0000-4000-8000-000000000011",
          "revision": 2,
          "contentSha256": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
          "locale": "en-IN"
        },
        "expected": {
          "reviewRevision": 0,
          "reviewHeadId": null,
          "assignmentRevision": 0,
          "assignmentHeadId": null,
          "associationRevision": 0,
          "associationHeadId": null,
          "regroupRevision": 1,
          "regroupHeadId": "90000000-0000-4000-8000-000000000013",
          "canonicalHeadId": "90000000-0000-4000-8000-000000000011"
        },
        "acknowledgementPolicy": "whole_entry_merge_not_fact_confirmation",
        "acknowledgement": true,
        "unselectedDisposition": "retain_eligible_original_origins",
        "selections": [
          {
            "pageId": "page-1",
            "method": "native_text",
            "sectionId": "10000000-0000-4000-8000-000000000107",
            "anchorEntryId": "10000000-0000-4000-8000-000000000111",
            "insertionIndex": 1,
            "affectedEntryIds": [
              "10000000-0000-4000-8000-000000000111",
              "10000000-0000-4000-8000-000000000112",
              "10000000-0000-4000-8000-000000000113"
            ],
            "members": [
              {
                "assertionId": "assertion-4",
                "field": "employer",
                "factId": "10000000-0000-4000-8000-000000000104",
                "citations": [
                  {
                    "attemptId": "10000000-0000-4000-8000-000000000001",
                    "spanId": "native-page-1-line-5",
                    "pageId": "page-1",
                    "method": "native_text",
                    "start": 10,
                    "end": 29,
                    "pageStart": 95,
                    "pageEnd": 114
                  }
                ],
                "mappedThrough": "current_citations",
                "originVersionId": null,
                "location": {
                  "kind": "entry",
                  "sectionId": "10000000-0000-4000-8000-000000000107",
                  "entryId": "10000000-0000-4000-8000-000000000111",
                  "bulletId": null
                }
              },
              {
                "assertionId": "assertion-5",
                "field": "role",
                "factId": "10000000-0000-4000-8000-000000000105",
                "citations": [
                  {
                    "attemptId": "10000000-0000-4000-8000-000000000001",
                    "spanId": "native-page-1-line-6",
                    "pageId": "page-1",
                    "method": "native_text",
                    "start": 6,
                    "end": 19,
                    "pageStart": 121,
                    "pageEnd": 134
                  }
                ],
                "mappedThrough": "current_citations",
                "originVersionId": null,
                "location": {
                  "kind": "entry",
                  "sectionId": "10000000-0000-4000-8000-000000000107",
                  "entryId": "10000000-0000-4000-8000-000000000112",
                  "bulletId": null
                }
              },
              {
                "assertionId": "assertion-6",
                "field": "dates",
                "factId": "10000000-0000-4000-8000-000000000106",
                "citations": [
                  {
                    "attemptId": "10000000-0000-4000-8000-000000000001",
                    "spanId": "native-page-1-line-7",
                    "pageId": "page-1",
                    "method": "native_text",
                    "start": 7,
                    "end": 18,
                    "pageStart": 142,
                    "pageEnd": 153
                  }
                ],
                "mappedThrough": "current_citations",
                "originVersionId": null,
                "location": {
                  "kind": "entry",
                  "sectionId": "10000000-0000-4000-8000-000000000107",
                  "entryId": "10000000-0000-4000-8000-000000000113",
                  "bulletId": null
                }
              }
            ]
          }
        ]
      },
      "previewHash": "798f74cd74d416601b323fa8779a7d6d65e55519d721640b6c26547949625c6f",
      "idempotencyKey": "90000000-0000-4000-8000-000000000020"
    },
    "sections": [
      {
        "id": "10000000-0000-4000-8000-000000000107",
        "type": "experience",
        "title": "Experience",
        "factIds": [],
        "entries": [
          {
            "id": "10000000-0000-4000-8000-000000000108",
            "factIds": [
              "10000000-0000-4000-8000-000000000101",
              "10000000-0000-4000-8000-000000000102",
              "10000000-0000-4000-8000-000000000103"
            ],
            "bullets": []
          },
          {
            "id": "10000000-0000-4000-8000-000000000111",
            "factIds": [
              "10000000-0000-4000-8000-000000000104",
              "10000000-0000-4000-8000-000000000105",
              "10000000-0000-4000-8000-000000000106"
            ],
            "bullets": []
          }
        ]
      }
    ],
    "changed": true
  },
  "unchanged": {
    "request": {
      "schemaVersion": "canonical-entry-regroup-command/1.0.0",
      "operation": "approve_whole_entry_regroup",
      "binding": {
        "ownerId": "10000000-0000-4000-8000-000000000002",
        "analysisId": "10000000-0000-4000-8000-000000000003",
        "sourceId": "10000000-0000-4000-8000-000000000004",
        "inputSha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "attemptId": "10000000-0000-4000-8000-000000000001",
        "resumeId": "10000000-0000-4000-8000-000000000005",
        "organizationId": "10000000-0000-4000-8000-000000000006",
        "evidenceSchemaVersion": "evidence/2.0.0",
        "fieldExtractorVersion": "evidence-fields/1.0.1",
        "targetModelVersion": "evidence-targets/1.0.0",
        "associationModelVersion": "evidence-entry-associations/1.0.0",
        "producerVersion": "canonical-engine/1.0.4",
        "admissionPolicyVersion": "whole-entry-regroup-admission/1.0.0",
        "structuralTextProfileVersion": "a02-structural-text/1.0.0",
        "correctionProjectionModelVersion": "canonical-corrections/1.0.1",
        "correctionAdmissionPolicyVersion": "candidate-correction-admission/1.0.0",
        "regroupModelVersion": "canonical-entry-regroup/1.0.0"
      },
      "base": {
        "versionId": "90000000-0000-4000-8000-000000000011",
        "revision": 2,
        "contentSha256": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        "locale": "en-IN"
      },
      "expected": {
        "reviewRevision": 0,
        "reviewHeadId": null,
        "assignmentRevision": 0,
        "assignmentHeadId": null,
        "associationRevision": 0,
        "associationHeadId": null,
        "regroupRevision": 1,
        "regroupHeadId": "90000000-0000-4000-8000-000000000013",
        "canonicalHeadId": "90000000-0000-4000-8000-000000000011"
      },
      "selections": [
        {
          "groupId": "entry-association-1036212579a5a6954c04df1e78a8d8efad6fdda28830f8849823bab1975597ac",
          "factIds": [
            "10000000-0000-4000-8000-000000000101",
            "10000000-0000-4000-8000-000000000102",
            "10000000-0000-4000-8000-000000000103"
          ]
        }
      ],
      "unselectedDisposition": "retain_eligible_original_origins"
    },
    "command": {
      "normalForm": {
        "schemaVersion": "canonical-entry-regroup-command/1.0.0",
        "operation": "approve_whole_entry_regroup",
        "binding": {
          "ownerId": "10000000-0000-4000-8000-000000000002",
          "organizationId": "10000000-0000-4000-8000-000000000006",
          "resumeId": "10000000-0000-4000-8000-000000000005",
          "analysisId": "10000000-0000-4000-8000-000000000003",
          "sourceId": "10000000-0000-4000-8000-000000000004",
          "attemptId": "10000000-0000-4000-8000-000000000001",
          "inputSha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          "evidenceSchemaVersion": "evidence/2.0.0",
          "fieldExtractorVersion": "evidence-fields/1.0.1",
          "targetModelVersion": "evidence-targets/1.0.0",
          "associationModelVersion": "evidence-entry-associations/1.0.0",
          "producerVersion": "canonical-engine/1.0.4",
          "admissionPolicyVersion": "whole-entry-regroup-admission/1.0.0",
          "structuralTextProfileVersion": "a02-structural-text/1.0.0",
          "correctionProjectionModelVersion": "canonical-corrections/1.0.1",
          "correctionAdmissionPolicyVersion": "candidate-correction-admission/1.0.0",
          "regroupModelVersion": "canonical-entry-regroup/1.0.0"
        },
        "base": {
          "versionId": "90000000-0000-4000-8000-000000000011",
          "revision": 2,
          "contentSha256": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
          "locale": "en-IN"
        },
        "expected": {
          "reviewRevision": 0,
          "reviewHeadId": null,
          "assignmentRevision": 0,
          "assignmentHeadId": null,
          "associationRevision": 0,
          "associationHeadId": null,
          "regroupRevision": 1,
          "regroupHeadId": "90000000-0000-4000-8000-000000000013",
          "canonicalHeadId": "90000000-0000-4000-8000-000000000011"
        },
        "acknowledgementPolicy": "whole_entry_merge_not_fact_confirmation",
        "acknowledgement": true,
        "unselectedDisposition": "retain_eligible_original_origins",
        "selections": [
          {
            "pageId": "page-1",
            "method": "native_text",
            "sectionId": "10000000-0000-4000-8000-000000000107",
            "anchorEntryId": "10000000-0000-4000-8000-000000000108",
            "insertionIndex": 0,
            "affectedEntryIds": [
              "10000000-0000-4000-8000-000000000108"
            ],
            "members": [
              {
                "assertionId": "assertion-1",
                "field": "employer",
                "factId": "10000000-0000-4000-8000-000000000101",
                "citations": [
                  {
                    "attemptId": "10000000-0000-4000-8000-000000000001",
                    "spanId": "native-page-1-line-2",
                    "pageId": "page-1",
                    "method": "native_text",
                    "start": 10,
                    "end": 30,
                    "pageStart": 21,
                    "pageEnd": 41
                  }
                ],
                "mappedThrough": "current_citations",
                "originVersionId": null,
                "location": {
                  "kind": "entry",
                  "sectionId": "10000000-0000-4000-8000-000000000107",
                  "entryId": "10000000-0000-4000-8000-000000000108",
                  "bulletId": null
                }
              },
              {
                "assertionId": "assertion-2",
                "field": "role",
                "factId": "10000000-0000-4000-8000-000000000102",
                "citations": [
                  {
                    "attemptId": "10000000-0000-4000-8000-000000000001",
                    "spanId": "native-page-1-line-3",
                    "pageId": "page-1",
                    "method": "native_text",
                    "start": 6,
                    "end": 23,
                    "pageStart": 48,
                    "pageEnd": 65
                  }
                ],
                "mappedThrough": "current_citations",
                "originVersionId": null,
                "location": {
                  "kind": "entry",
                  "sectionId": "10000000-0000-4000-8000-000000000107",
                  "entryId": "10000000-0000-4000-8000-000000000108",
                  "bulletId": null
                }
              },
              {
                "assertionId": "assertion-3",
                "field": "dates",
                "factId": "10000000-0000-4000-8000-000000000103",
                "citations": [
                  {
                    "attemptId": "10000000-0000-4000-8000-000000000001",
                    "spanId": "native-page-1-line-4",
                    "pageId": "page-1",
                    "method": "native_text",
                    "start": 7,
                    "end": 18,
                    "pageStart": 73,
                    "pageEnd": 84
                  }
                ],
                "mappedThrough": "current_citations",
                "originVersionId": null,
                "location": {
                  "kind": "entry",
                  "sectionId": "10000000-0000-4000-8000-000000000107",
                  "entryId": "10000000-0000-4000-8000-000000000108",
                  "bulletId": null
                }
              }
            ]
          }
        ]
      },
      "previewHash": "0431454021de408e3873f92ba63605ff45b18c1e63a5dbbe2848814a8ccf7204",
      "idempotencyKey": "90000000-0000-4000-8000-000000000021"
    },
    "sections": [
      {
        "id": "10000000-0000-4000-8000-000000000107",
        "type": "experience",
        "title": "Experience",
        "factIds": [],
        "entries": [
          {
            "id": "10000000-0000-4000-8000-000000000108",
            "factIds": [
              "10000000-0000-4000-8000-000000000101",
              "10000000-0000-4000-8000-000000000102",
              "10000000-0000-4000-8000-000000000103"
            ],
            "bullets": []
          },
          {
            "id": "10000000-0000-4000-8000-000000000111",
            "factIds": [
              "10000000-0000-4000-8000-000000000104"
            ],
            "bullets": []
          },
          {
            "id": "10000000-0000-4000-8000-000000000112",
            "factIds": [
              "10000000-0000-4000-8000-000000000105"
            ],
            "bullets": []
          },
          {
            "id": "10000000-0000-4000-8000-000000000113",
            "factIds": [
              "10000000-0000-4000-8000-000000000106"
            ],
            "bullets": []
          }
        ]
      }
    ],
    "changed": false
  }
}$era_oracle$::jsonb;
  owner_id uuid:='10000000-0000-4000-8000-000000000002'; analysis_id uuid:='10000000-0000-4000-8000-000000000003';
  source_id uuid:='10000000-0000-4000-8000-000000000004'; root_id uuid:='10000000-0000-4000-8000-000000000005'; org_id uuid:='10000000-0000-4000-8000-000000000006';
  base jsonb; base_key jsonb; normal jsonb; command1 jsonb; command2 jsonb; result1 jsonb; result2 jsonb; result3 jsonb; moved jsonb; receipt jsonb; snap jsonb;
  head1 uuid; head2 uuid; current_id uuid; event_id uuid; first_batch uuid; other_batch uuid; raw jsonb; scope jsonb; c jsonb; bad jsonb; before_rows bigint; after_rows bigint;
  c02_read jsonb; c02_command jsonb; selector jsonb; assignment uuid; failure_message text;
  name text; created text:='2026-11-13T18:30:00.000Z'; scalar bigint;
begin
  perform pg_temp.era_assert(private.canonical_correction_write_ready(),'full_successor_profile_ready');
  perform pg_temp.era_assert(not has_function_privilege('service_role','public.apply_canonical_entry_regroup(uuid,uuid,jsonb,text)','EXECUTE'),'writer_still_denied');
  perform pg_temp.era_assert(has_function_privilege('service_role','public.read_canonical_entry_regroup_workspace(uuid,uuid,jsonb)','EXECUTE'),'reader_service_only');
  -- Independent Node hashes are checked BEFORE the named native substitutions below.
  foreach name in array array['first','second','unchanged'] loop
    perform pg_temp.era_assert(private.grouped_import_command_sha256(private.entry_regroup_atoms(oracle->name->'command'->'normalForm'))=oracle->name->'command'->>'previewHash','frozen_node_'||name);
  end loop;
  insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values(owner_id,'authenticated','authenticated','era-source@example.test','{"provider":"email","providers":["email"]}','{}');
  insert into public.organizations(id,owner_id,name) values(org_id,owner_id,'Synthetic regroup admission');
  insert into public.memberships(organization_id,user_id,role) values(org_id,owner_id,'owner');
  insert into public.resumes(id,organization_id,owner_id,display_name) values(root_id,org_id,owner_id,'Synthetic regroup admission');
  insert into public.resume_versions(id,resume_id,organization_id,owner_id,storage_key,checksum,bytes,media_type) values(source_id,root_id,org_id,owner_id,'era-source/'||source_id,repeat('a',64),1024,'application/pdf');
  insert into public.analyses(id,resume_version_id,organization_id,owner_id,status,idempotency_key) values(analysis_id,source_id,org_id,owner_id,'needs_ocr',gen_random_uuid());
  delete from public.analysis_jobs j where j.analysis_id=fixture.analysis_id;
  insert into public.document_evidence_attempts(id,analysis_id,organization_id,owner_id,resume_version_id,input_sha256,attempt_number,envelope)
    values((oracle->'evidence'->>'id')::uuid,analysis_id,org_id,owner_id,source_id,repeat('a',64),1,oracle->'evidence');
  base:=oracle->'base'; base_key:=pg_temp.era_store(base,1);
  insert into public.canonical_resume_heads(resume_id,version_id,revision,owner_id,organization_id) values(root_id,(base->>'versionId')::uuid,1,owner_id,org_id);
  normal:=jsonb_set(oracle->'first'->'command'->'normalForm','{base,contentSha256}',base_key->'contentSha256');
  command1:=pg_temp.era_command(normal,(oracle->'first'->'command'->>'idempotencyKey')::uuid);
  result1:=public.apply_canonical_entry_regroup(owner_id,analysis_id,command1,'era-native-fixture'); head1:=(result1->>'versionId')::uuid; first_batch:=(result1->>'batchId')::uuid;
  perform pg_temp.era_assert(result1->>'status'='applied' and result1->'revision'='2' and result1->'regroupRevision'='1','actual_first_apply');
  perform pg_temp.era_assert(result1->'baseVersionId'=base->'versionId' and result1->'baseRevision'='1' and result1->'idempotencyKey'=command1->'idempotencyKey'
    and result1->'commandSha256'=command1->'previewHash' and result1->'regroupHeadId'=result1->'batchId','strict_correlated_receipt');
  select content into strict raw from public.canonical_resume_versions where id=head1;
  perform pg_temp.era_assert(raw->'sections'=oracle->'first'->'sections' and raw->'facts'=base->'facts' and raw->'contactFactIds'=base->'contactFactIds','actual_core_sections_and_fact_preservation');
  perform pg_temp.era_assert((select count(*)=1 from public.canonical_entry_regroup_links where canonical_version_id=head1),'first_composition');
  -- An acknowledged unchanged layout creates a REAL child/batch; isolate it so the independent second oracle retains base revision2.
  begin
    normal:=oracle->'unchanged'->'command'->'normalForm';
    normal:=jsonb_set(jsonb_set(jsonb_set(jsonb_set(normal,'{base,versionId}',to_jsonb(head1)),'{base,contentSha256}',to_jsonb(encode(extensions.digest(convert_to(raw::text,'UTF8'),'sha256'),'hex'))),'{expected,canonicalHeadId}',to_jsonb(head1)),'{expected,regroupHeadId}',to_jsonb(first_batch));
    result3:=public.apply_canonical_entry_regroup(owner_id,analysis_id,pg_temp.era_command(normal,gen_random_uuid()),'era-unchanged');
    perform pg_temp.era_assert(result3->>'status'='applied' and result3->>'versionId'<>head1::text and result3->'regroupRevision'='2','unchanged_layout_is_saved_approval');
    perform pg_temp.era_assert((select content->'sections'=raw->'sections' from public.canonical_resume_versions where id=(result3->>'versionId')::uuid),'unchanged_sections_preserved');
    raise exception 'ERA_BRANCH_ROLLBACK' using errcode='PZ001';
  exception when sqlstate 'PZ001' then perform pg_temp.era_assert(true,'unchanged_branch_rolled_back'); end;
  -- ONLY named changes: actual saved baseUUID/nativeSHA, canonicalHead and first approval batchUUID. No value/source/order changes.
  normal:=oracle->'second'->'command'->'normalForm';
  normal:=jsonb_set(jsonb_set(jsonb_set(jsonb_set(normal,'{base,versionId}',to_jsonb(head1)),'{base,contentSha256}',to_jsonb(encode(extensions.digest(convert_to(raw::text,'UTF8'),'sha256'),'hex'))),'{expected,canonicalHeadId}',to_jsonb(head1)),'{expected,regroupHeadId}',to_jsonb(first_batch));
  command2:=pg_temp.era_command(normal,(oracle->'second'->'command'->>'idempotencyKey')::uuid);
  result2:=public.apply_canonical_entry_regroup(owner_id,analysis_id,command2,'era-native-fixture'); head2:=(result2->>'versionId')::uuid;
  perform pg_temp.era_assert(result2->>'status'='applied' and result2->'revision'='3','actual_partial_base_apply');
  perform pg_temp.era_assert((select content->'sections'=oracle->'second'->'sections' from public.canonical_resume_versions where id=head2),'actual_second_core_sections');
  perform pg_temp.era_assert((select count(*)=2 from public.canonical_entry_regroup_links where canonical_version_id=head2)
    and exists(select 1 from public.canonical_entry_regroup_links where canonical_version_id=head2 and regroup_batch_id=first_batch and original_approval_version_id=head1),'retained_original_typed_origin');
  receipt:=public.apply_canonical_entry_regroup(owner_id,analysis_id,command1,'era-old-replay');
  perform pg_temp.era_assert(receipt=result1||'{"idempotent":true}'::jsonb and (select version_id=head2 from public.canonical_resume_heads where resume_id=root_id),'old_receipt_before_current_head');
  before_rows:=(select count(*) from public.candidate_entry_regroup_batches where owner_id=fixture.owner_id);
  bad:=jsonb_set(command1,'{normalForm,base,locale}','"en-US"');
  perform pg_temp.era_assert(public.apply_canonical_entry_regroup(owner_id,analysis_id,bad,'era-wrong-key')->>'status'='conflict','changed_bytes_same_key_conflict');
  bad:=jsonb_set(command1,'{idempotencyKey}',to_jsonb(gen_random_uuid()));
  perform pg_temp.era_assert(public.apply_canonical_entry_regroup(owner_id,analysis_id,bad,'era-stale')->>'status'='conflict','fresh_stale_cas_after_replay');
  perform pg_temp.era_assert((select count(*) from public.candidate_entry_regroup_batches where owner_id=fixture.owner_id)=before_rows,'stale_never_partial_approval');
  perform pg_temp.era_assert(public.apply_canonical_entry_regroup('ffffffff-ffff-ffff-ffff-ffffffffffff',analysis_id,command1,'era-foreign')->>'status'='not_found','foreign_owner_denied');
  -- Direct inner storage replay and ordinary producer retag cannot impersonate the outer operation.
  begin
    select content,command into raw,bad from public.canonical_resume_versions where id=head1;
    perform public.save_canonical_version(owner_id,source_id,raw,bad,'era-inner-replay');
    raise exception 'ERA_MISSING_INNER_REFUSAL' using errcode='23514';
  exception when invalid_parameter_value then get stacked diagnostics failure_message=MESSAGE_TEXT;
    perform pg_temp.era_assert(failure_message='REGROUP_REQUIRES_OUTER_REPLAY','inner_replay_denied_exact'); end;
  begin
    select content into raw from public.canonical_resume_versions where id=head2;
    raw:=jsonb_set(raw,'{producerVersion}','"canonical-engine/1.0.1"');
    bad:=jsonb_build_object('operation','confirm','expectedVersionId',head2,'idempotencyKey',gen_random_uuid(),'factId',base->'facts'->0->'id','value',null,'targetVersionId',null);
    perform public.save_canonical_version(owner_id,source_id,raw,bad,'era-retag');
    raise exception 'ERA_MISSING_RETAG_REFUSAL' using errcode='23514';
  exception when invalid_parameter_value then get stacked diagnostics failure_message=MESSAGE_TEXT;
    perform pg_temp.era_assert(failure_message='GROUPED_PRODUCER_RETAG','producer_retag_guard_exact'); end;
  -- Real C02 assign+add into an approved entry emits .2 and invalidates the WHOLE carried entry. The old API keys stay unchanged.
  begin
    event_id:=gen_random_uuid();
    insert into public.evidence_corrections(id,attempt_id,analysis_id,organization_id,owner_id,actor_id,revision,expected_revision,field,operation,value,candidate_id,idempotency_key,request_id)
      values(event_id,(oracle->'evidence'->>'id')::uuid,analysis_id,org_id,owner_id,owner_id,1,0,'role','correct','Synthetic Additional Candidate Role',null,gen_random_uuid(),'era-add');
    c02_read:=public.read_candidate_correction_ledger(owner_id,analysis_id);
    selector:=jsonb_build_object('eventId',event_id,'targetKind','observed_assertion','assertionId','assertion-2','opaqueTargetId','era-actual-role-target',
      'mappingMode','add','baseVersionId',null,'factId',null,'mappingProofKind','explicit_candidate_add','originVersionId',null,'originFactId',null,
      'location',jsonb_build_object('kind','entry','sectionId',base->'sections'->0->'id','entryId',base->'sections'->0->'entries'->0->'id',
        'bulletId',null,'newSectionType',null,'newSectionTitle',null),'supersedesAssignmentId',null);
    c02_command:=(c02_read->'binding'-array['ownerId','organizationId','resumeId','analysisId'])||jsonb_build_object('schemaVersion','candidate-correction-command/1.0.0',
      'kind','assign','idempotencyKey',gen_random_uuid(),'expectedReviewRevision',c02_read->'reviewRevision','expectedAssignmentRevision',c02_read->'assignmentRevision',
      'expectedVersionId',head2,'acknowledgement',true,'selectors',jsonb_build_array(selector));
    result3:=public.assign_candidate_correction_targets(owner_id,analysis_id,c02_command,'era-add');
    perform pg_temp.era_assert(result3->>'status'='assigned','actual_c02_assign'); assignment:=(result3->'assignmentIds'->>0)::uuid;
    c02_read:=public.read_candidate_correction_ledger(owner_id,analysis_id);
    c02_command:=(c02_read->'binding'-array['ownerId','organizationId','resumeId','analysisId'])||jsonb_build_object('schemaVersion','candidate-correction-command/1.0.0',
      'kind','add','idempotencyKey',gen_random_uuid(),'expectedReviewRevision',c02_read->'reviewRevision','expectedAssignmentRevision',c02_read->'assignmentRevision',
      'expectedVersionId',head2,'acknowledgement',true,'selectors',jsonb_build_array(jsonb_build_object('assignmentId',assignment,'priorApplicationId',null)));
    result3:=public.apply_candidate_corrections(owner_id,analysis_id,c02_command,null,'era-add'); current_id:=(result3->>'versionId')::uuid;
    perform pg_temp.era_assert(result3->>'status'='applied' and (select content->>'producerVersion'='canonical-engine/1.0.2' from public.canonical_resume_versions where id=current_id)
      and (select count(*)=1 from public.canonical_entry_regroup_links where canonical_version_id=current_id),'actual_2_add_metadata_presence_and_whole_group_loss');
    begin
      select content into strict raw from public.canonical_resume_versions where id=current_id;
      raw:=jsonb_set(raw,'{producerVersion}','"canonical-engine/1.0.1"');
      bad:=jsonb_build_object('operation','confirm','expectedVersionId',current_id,'idempotencyKey',gen_random_uuid(),'factId',base->'facts'->0->'id','value',null,'targetVersionId',null);
      perform public.save_canonical_version(owner_id,source_id,raw,bad,'era-2-retag');
      raise exception 'ERA_MISSING_2_RETAG_REFUSAL' using errcode='23514';
    exception when invalid_parameter_value then get stacked diagnostics failure_message=MESSAGE_TEXT;
      perform pg_temp.era_assert(failure_message='GROUPED_PRODUCER_RETAG','metadata_header_2_retag_guard_exact'); end;
    current_id:=pg_temp.era_manual(current_id,'rollback',null,null,head2);
    perform pg_temp.era_assert((select count(*)=2 from public.canonical_entry_regroup_links where canonical_version_id=current_id),'actual_add_restore_exact_target');
    raise exception 'ERA_BRANCH_ROLLBACK' using errcode='PZ001';
  exception when sqlstate 'PZ001' then perform pg_temp.era_assert(true,'c02_add_branch_rolled_back'); end;
  -- Actual measured proof shares ONE source/index across multiple canonical bases; these are real protected rows above.
  scope:=private.entry_regroup_scope(owner_id,analysis_id,(oracle->'evidence'->>'id')::uuid);
  c:=private.entry_regroup_origin_proof(scope,2,private.entry_regroup_cache());
  perform pg_temp.era_assert((select count(*)=1 from jsonb_object_keys(c->'sources')) and (select count(*)=1 from jsonb_object_keys(c->'sourceIndexes'))
    and not exists(select 1 from jsonb_each(c->'bases') where value ? 'envelope')
    and not exists(select 1 from jsonb_each(c->'signatures') where value ? 'facts'),'immutable_source_and_signature_cache_dedup');
  -- A real CHECK failure after pending batch/group insertion must leave no approval/version/head fragment.
  begin
    select content into strict raw from public.canonical_resume_versions where id=head2;
    normal:=oracle->'unchanged'->'command'->'normalForm';
    normal:=jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(normal,'{base,versionId}',to_jsonb(head2)),'{base,revision}','3'),
      '{base,contentSha256}',to_jsonb(encode(extensions.digest(convert_to(raw::text,'UTF8'),'sha256'),'hex'))),'{expected,canonicalHeadId}',to_jsonb(head2)),
      '{expected,regroupRevision}','2'),'{expected,regroupHeadId}',result2->'batchId');
    moved:=pg_temp.era_command(normal,gen_random_uuid());
    perform pg_temp.era_assert(private.entry_regroup_normalize(scope,moved)=normal,'atomic_failure_command_admitted_before_constraint');
    bad:=jsonb_build_object('b',(select count(*) from public.candidate_entry_regroup_batches where owner_id=fixture.owner_id),
      'g',(select count(*) from public.candidate_entry_regroup_groups where owner_id=fixture.owner_id),'m',(select count(*) from public.candidate_entry_regroup_members where owner_id=fixture.owner_id),
      'v',(select count(*) from public.canonical_resume_versions where owner_id=fixture.owner_id),'f',(select count(*) from public.resume_facts where owner_id=fixture.owner_id),
      'events',(select count(*) from public.change_events where owner_id=fixture.owner_id),'head',(select version_id from public.canonical_resume_heads where resume_id=root_id));
    alter table public.candidate_entry_regroup_members add constraint era_abort_after_pending check(false) not valid;
    perform pg_temp.era_assert(private.canonical_correction_write_ready(),'atomic_failure_not_profile_drift');
    result3:=public.apply_canonical_entry_regroup(owner_id,analysis_id,moved,'era-atomic-failure');
    perform pg_temp.era_assert(result3->>'status'='unavailable' and bad=jsonb_build_object('b',(select count(*) from public.candidate_entry_regroup_batches where owner_id=fixture.owner_id),
      'g',(select count(*) from public.candidate_entry_regroup_groups where owner_id=fixture.owner_id),'m',(select count(*) from public.candidate_entry_regroup_members where owner_id=fixture.owner_id),
      'v',(select count(*) from public.canonical_resume_versions where owner_id=fixture.owner_id),'f',(select count(*) from public.resume_facts where owner_id=fixture.owner_id),
      'events',(select count(*) from public.change_events where owner_id=fixture.owner_id),'head',(select version_id from public.canonical_resume_heads where resume_id=root_id)),'atomic_pending_failure_rolls_back_every_family');
    raise exception 'ERA_BRANCH_ROLLBACK' using errcode='PZ001';
  exception when sqlstate 'PZ001' then perform pg_temp.era_assert(true,'atomic_constraint_branch_rolled_back'); end;
  -- Real ordinary API lifecycle, with exact TARGET and legacy-empty restoration.
  current_id:=pg_temp.era_manual(head2,'confirm',(base->'facts'->0->>'id')::uuid,null);
  perform pg_temp.era_assert((select count(*)=2 from public.canonical_entry_regroup_links where canonical_version_id=current_id),'confirm_retains_complete_entries');
  current_id:=pg_temp.era_manual(current_id,'rename_section',null,'Synthetic Renamed Experience');
  perform pg_temp.era_assert((select count(*)=2 from public.canonical_entry_regroup_links where canonical_version_id=current_id),'rename_retains_complete_entries');
  current_id:=pg_temp.era_manual(current_id,'edit',(base->'facts'->0->>'id')::uuid,'Synthetic Candidate Employer');
  perform pg_temp.era_assert((select count(*)=1 from public.canonical_entry_regroup_links where canonical_version_id=current_id),'edit_invalidates_whole_entry');
  current_id:=pg_temp.era_manual(current_id,'rollback',null,null,head2);
  perform pg_temp.era_assert((select count(*)=2 from public.canonical_entry_regroup_links where canonical_version_id=current_id),'restore_exact_target_composition');
  current_id:=pg_temp.era_manual(current_id,'rollback',null,null,(base->>'versionId')::uuid);
  perform pg_temp.era_assert(exists(select 1 from public.canonical_entry_regroup_snapshots where canonical_version_id=current_id and creation_kind='restore')
    and not exists(select 1 from public.canonical_entry_regroup_links where canonical_version_id=current_id),'legacy_restore_has_explicit_empty_header');
  current_id:=pg_temp.era_manual(current_id,'rollback',null,null,head2);
  -- Later global rows exceed CURRENT cap; ORIGINAL capture0/read/replay remain independent.
  insert into public.evidence_corrections(id,attempt_id,analysis_id,organization_id,owner_id,actor_id,revision,expected_revision,field,operation,value,candidate_id,idempotency_key,request_id)
    select gen_random_uuid(),(oracle->'evidence'->>'id')::uuid,analysis_id,org_id,owner_id,owner_id,n,n-1,'employer','confirm','Synthetic Alpha Labs','assertion-1',gen_random_uuid(),'era-later' from generate_series(1,101) n;
  select id into event_id from public.evidence_corrections where analysis_id=fixture.analysis_id and revision=101;
  snap:=public.read_canonical_entry_regroup_workspace(owner_id,analysis_id,jsonb_build_object('base',base_key,'reviewRevision',101,'reviewHeadId',event_id));
  perform pg_temp.era_assert(snap->>'status'='available' and snap->'historical'->'review'->'historyAttestation'->'pageCount'='2'
    and jsonb_array_length(snap->'historical'->'review'->'events')=101,'actual_global_prefix_two_chunks');
  insert into public.evidence_corrections(id,attempt_id,analysis_id,organization_id,owner_id,actor_id,revision,expected_revision,field,operation,value,candidate_id,idempotency_key,request_id)
    select gen_random_uuid(),(oracle->'evidence'->>'id')::uuid,analysis_id,org_id,owner_id,owner_id,n,n-1,'employer','confirm','Synthetic Alpha Labs','assertion-1',gen_random_uuid(),'era-later' from generate_series(102,1001) n;
  snap:=public.read_canonical_entry_regroup_workspace(owner_id,analysis_id,jsonb_build_object('base',base_key,'reviewRevision',0,'reviewHeadId',null));
  perform pg_temp.era_assert(snap->>'status'='available' and snap->'current'->>'status'='unavailable' and snap->'historical'->'review'->'historyAttestation'->'pageCount'='0','historical_read_despite_current_overflow');
  receipt:=public.apply_canonical_entry_regroup(owner_id,analysis_id,command1,'era-original-after-overflow');
  perform pg_temp.era_assert(receipt=result1||'{"idempotent":true}'::jsonb,'original_prefix_receipt_ignores_later_overflow');
  -- Private accounting arithmetic is not public cache authority or a forged saved approval.
  foreach name in array array['documents','attempts','bytes','facts','refs','text','work'] loop
    scalar:=case name when 'documents' then 2048 when 'attempts' then 64 when 'bytes' then 33554432 when 'facts' then 200000 when 'refs' then 400000 when 'text' then 8000000 else 2000000 end;
    bad:=private.entry_regroup_inspect(private.entry_regroup_cache(),'document','era-cold',base);
    if name='work' then c:=private.entry_regroup_work(jsonb_set(private.entry_regroup_cache(),'{work}',to_jsonb(scalar)),0);
    elsif name='attempts' then bad:=private.entry_regroup_inspect(private.entry_regroup_cache(),'attempt','era-cold',oracle->'evidence'); c:=private.entry_regroup_inspect(jsonb_set(private.entry_regroup_cache(),array[name],to_jsonb(scalar-(bad->>name)::bigint)),'attempt','era-boundary',oracle->'evidence');
    else c:=private.entry_regroup_inspect(jsonb_set(private.entry_regroup_cache(),array[name],to_jsonb(scalar-(bad->>name)::bigint)),'document','era-boundary',base); end if;
    perform pg_temp.era_assert((c->>name)::bigint=scalar,'exact_aggregate_'||name||'_boundary');
    begin
      c:=jsonb_set(private.entry_regroup_cache(),array[name],to_jsonb(scalar));
      if name='work' then perform private.entry_regroup_work(c,1);
      elsif name='documents' then perform private.entry_regroup_inspect(c,'document','era-extra',base);
      elsif name='attempts' then perform private.entry_regroup_inspect(c,'attempt','era-extra',oracle->'evidence');
      else perform private.entry_regroup_inspect(c,'document','era-extra',base); end if;
      raise exception 'ERA_MISSING_BUDGET_REFUSAL' using errcode='23514';
    exception when sqlstate 'P0C03' then perform pg_temp.era_assert(true,'aggregate_'||name||'_boundary'); end;
  end loop;
  raise notice 'ERA_DEFERRED_NATIVE_CASES_COMPLETE_ROLLBACK_REQUIRED';
end; $era_native$;
rollback;
