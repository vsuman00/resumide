-- SOURCE ONLY / UNPARSED / UNAPPLIED / UNEXECUTED. Rollback-only, privileged synthetic fixture.
-- Requires a separate reviewed isolated managed target/action packet. No automatic runner.
-- This script does not prove two-session concurrency, restore acceptance or applied grants.
begin isolation level read committed;
set local statement_timeout='20s';
set local lock_timeout='2s';
set local idle_in_transaction_session_timeout='30s';
do $admission$
begin
  if current_setting('resumide.a02_test_admission',true) is distinct from 'isolated-managed-grouped-original-read/1'
    or current_setting('resumide.a02_test_owner_id',true) is distinct from '10000000-0000-4000-8000-000000000002'
    or coalesce(current_setting('resumide.a02_test_run_id',true),'') collate "C" !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
    or exists(select 1 from auth.users where id='10000000-0000-4000-8000-000000000002')
    or exists(select 1 from public.resumes where id='10000000-0000-4000-8000-000000000005') then
    raise exception 'A02_READ_FIXTURE_NOT_ADMITTED' using errcode='42501'; end if;
  if private.canonical_correction_write_ready() is not true
    or (select encode(extensions.digest(convert_to(prosrc,'UTF8'),'sha256'),'hex') from pg_catalog.pg_proc
      where oid=to_regprocedure('private.canonical_correction_write_ready()')) is distinct from 'c2098f91ee32e4035ff30dd5db71c4d7e95944cef24e4b137c8c489841edd5db'
    or not has_function_privilege('service_role','public.read_grouped_original_workspace(uuid,uuid)','EXECUTE')
    or has_function_privilege('anon','public.read_grouped_original_workspace(uuid,uuid)','EXECUTE')
    or has_function_privilege('authenticated','public.read_grouped_original_workspace(uuid,uuid)','EXECUTE')
    or exists(select 1 from pg_catalog.pg_proc p, lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      where p.oid=to_regprocedure('public.read_grouped_original_workspace(uuid,uuid)') and a.grantee=0 and a.privilege_type='EXECUTE')
    or has_function_privilege('service_role','public.import_canonical_grouped_original(uuid,uuid,jsonb,jsonb,text)','EXECUTE') then
    raise exception 'A02_READ_PROFILE_NOT_ADMITTED' using errcode='42501'; end if;
end;
$admission$;
create function pg_temp.a02_read_assert(p_ok boolean,p_case text) returns void language plpgsql set search_path='' as $$
begin if p_ok is not true then raise exception 'A02_READ_CASE_%',p_case using errcode='23514'; end if; end;
$$;
do $native$
#variable_conflict use_variable
<<fixture_scope>>
declare oracle jsonb:=$oracle${
  "envelope": {
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
  "original": {
    "schemaVersion": "canonical-resume/1.0.0",
    "producerVersion": "canonical-engine/1.0.1",
    "analysisId": "10000000-0000-4000-8000-000000000003",
    "inputSha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "retentionPolicyId": "synthetic/1.0.0",
    "resumeId": "10000000-0000-4000-8000-000000000005",
    "versionId": "40000000-0000-4000-8000-000000000001",
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
        "id": "40000000-0000-4000-8000-000000000002",
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
        "id": "40000000-0000-4000-8000-000000000003",
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
        "id": "40000000-0000-4000-8000-000000000004",
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
        "id": "40000000-0000-4000-8000-000000000005",
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
        "id": "40000000-0000-4000-8000-000000000006",
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
        "id": "40000000-0000-4000-8000-000000000007",
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
        "id": "40000000-0000-4000-8000-000000000008",
        "type": "experience",
        "title": "Experience",
        "factIds": [],
        "entries": [
          {
            "id": "40000000-0000-4000-8000-000000000009",
            "factIds": [
              "40000000-0000-4000-8000-000000000002"
            ],
            "bullets": []
          },
          {
            "id": "40000000-0000-4000-8000-00000000000a",
            "factIds": [
              "40000000-0000-4000-8000-000000000003"
            ],
            "bullets": []
          },
          {
            "id": "40000000-0000-4000-8000-00000000000b",
            "factIds": [
              "40000000-0000-4000-8000-000000000004"
            ],
            "bullets": []
          },
          {
            "id": "40000000-0000-4000-8000-00000000000c",
            "factIds": [
              "40000000-0000-4000-8000-000000000005"
            ],
            "bullets": []
          },
          {
            "id": "40000000-0000-4000-8000-00000000000d",
            "factIds": [
              "40000000-0000-4000-8000-000000000006"
            ],
            "bullets": []
          },
          {
            "id": "40000000-0000-4000-8000-00000000000e",
            "factIds": [
              "40000000-0000-4000-8000-000000000007"
            ],
            "bullets": []
          }
        ]
      }
    ],
    "changes": [
      {
        "id": "40000000-0000-4000-8000-00000000000f",
        "actorId": "10000000-0000-4000-8000-000000000002",
        "action": "import",
        "targetId": "40000000-0000-4000-8000-000000000001",
        "priorValue": null,
        "createdAt": "2026-11-13T00:00:00.000Z"
      }
    ]
  },
  "command": {
    "normalForm": {
      "schemaVersion": "grouped-original-command/1.0.0",
      "operation": "approve_and_import_grouped_original",
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
        "producerVersion": "canonical-engine/1.0.3",
        "admissionPolicyVersion": "grouped-original-admission/1.0.0",
        "structuralTextProfileVersion": "a02-structural-text/1.0.0",
        "correctionProjectionModelVersion": "canonical-corrections/1.0.1",
        "correctionAdmissionPolicyVersion": "candidate-correction-admission/1.0.0",
        "effectiveLocale": "en-IN"
      },
      "expected": {
        "reviewRevision": 0,
        "reviewHeadId": null,
        "assignmentRevision": 0,
        "assignmentHeadId": null,
        "associationRevision": 0,
        "associationHeadId": null,
        "canonicalHeadId": null
      },
      "acknowledgementPolicy": "relationship_only_not_fact_confirmation",
      "acknowledgement": true,
      "unselectedDisposition": "retain_original",
      "selections": [
        {
          "pageId": "page-1",
          "method": "native_text",
          "members": [
            {
              "assertionId": "assertion-1",
              "field": "employer",
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
              ]
            },
            {
              "assertionId": "assertion-2",
              "field": "role",
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
              ]
            },
            {
              "assertionId": "assertion-3",
              "field": "dates",
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
              ]
            }
          ]
        },
        {
          "pageId": "page-1",
          "method": "native_text",
          "members": [
            {
              "assertionId": "assertion-4",
              "field": "employer",
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
              ]
            },
            {
              "assertionId": "assertion-5",
              "field": "role",
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
              ]
            },
            {
              "assertionId": "assertion-6",
              "field": "dates",
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
              ]
            }
          ]
        }
      ]
    },
    "previewHash": "c0f67f0c0992f443854c74a5d1ab49e20a063a46ec7973e2347558b1aec679fd",
    "idempotencyKey": "90000000-0000-4000-8000-000000000001"
  },
  "scope": {
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
    "projectionModelVersion": "canonical-corrections/1.0.1",
    "admissionPolicyVersion": "candidate-correction-admission/1.0.0",
    "reviewRevision": 0,
    "assignmentRevision": 0,
    "headId": null,
    "headRevision": null,
    "headAttemptId": null
  },
  "atoms": [
    "grouped-original-command/1.0.0",
    "approve_and_import_grouped_original",
    "10000000-0000-4000-8000-000000000002",
    "10000000-0000-4000-8000-000000000006",
    "10000000-0000-4000-8000-000000000005",
    "10000000-0000-4000-8000-000000000003",
    "10000000-0000-4000-8000-000000000004",
    "10000000-0000-4000-8000-000000000001",
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "evidence/2.0.0",
    "evidence-fields/1.0.1",
    "evidence-targets/1.0.0",
    "evidence-entry-associations/1.0.0",
    "canonical-engine/1.0.3",
    "grouped-original-admission/1.0.0",
    "a02-structural-text/1.0.0",
    "canonical-corrections/1.0.1",
    "candidate-correction-admission/1.0.0",
    "en-IN",
    "0",
    null,
    "0",
    null,
    "0",
    null,
    null,
    "relationship_only_not_fact_confirmation",
    "1",
    "retain_original",
    "2",
    "page-1",
    "native_text",
    "3",
    "assertion-1",
    "employer",
    "1",
    "10000000-0000-4000-8000-000000000001",
    "native-page-1-line-2",
    "page-1",
    "native_text",
    "10",
    "30",
    "21",
    "41",
    "assertion-2",
    "role",
    "1",
    "10000000-0000-4000-8000-000000000001",
    "native-page-1-line-3",
    "page-1",
    "native_text",
    "6",
    "23",
    "48",
    "65",
    "assertion-3",
    "dates",
    "1",
    "10000000-0000-4000-8000-000000000001",
    "native-page-1-line-4",
    "page-1",
    "native_text",
    "7",
    "18",
    "73",
    "84",
    "page-1",
    "native_text",
    "3",
    "assertion-4",
    "employer",
    "1",
    "10000000-0000-4000-8000-000000000001",
    "native-page-1-line-5",
    "page-1",
    "native_text",
    "10",
    "29",
    "95",
    "114",
    "assertion-5",
    "role",
    "1",
    "10000000-0000-4000-8000-000000000001",
    "native-page-1-line-6",
    "page-1",
    "native_text",
    "6",
    "19",
    "121",
    "134",
    "assertion-6",
    "dates",
    "1",
    "10000000-0000-4000-8000-000000000001",
    "native-page-1-line-7",
    "page-1",
    "native_text",
    "7",
    "18",
    "142",
    "153"
  ],
  "hex": "4130324f50310a5433303a67726f757065642d6f726967696e616c2d636f6d6d616e642f312e302e303b5433353a617070726f76655f616e645f696d706f72745f67726f757065645f6f726967696e616c3b5433363a31303030303030302d303030302d343030302d383030302d3030303030303030303030323b5433363a31303030303030302d303030302d343030302d383030302d3030303030303030303030363b5433363a31303030303030302d303030302d343030302d383030302d3030303030303030303030353b5433363a31303030303030302d303030302d343030302d383030302d3030303030303030303030333b5433363a31303030303030302d303030302d343030302d383030302d3030303030303030303030343b5433363a31303030303030302d303030302d343030302d383030302d3030303030303030303030313b5436343a616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161613b5431343a65766964656e63652f322e302e303b5432313a65766964656e63652d6669656c64732f312e302e313b5432323a65766964656e63652d746172676574732f312e302e303b5433333a65766964656e63652d656e7472792d6173736f63696174696f6e732f312e302e303b5432323a63616e6f6e6963616c2d656e67696e652f312e302e333b5433323a67726f757065642d6f726967696e616c2d61646d697373696f6e2f312e302e303b5432353a6130322d7374727563747572616c2d746578742f312e302e303b5432373a63616e6f6e6963616c2d636f7272656374696f6e732f312e302e313b5433363a63616e6469646174652d636f7272656374696f6e2d61646d697373696f6e2f312e302e303b54353a656e2d494e3b54313a303b4e3b54313a303b4e3b54313a303b4e3b4e3b5433393a72656c6174696f6e736869705f6f6e6c795f6e6f745f666163745f636f6e6669726d6174696f6e3b54313a313b5431353a72657461696e5f6f726967696e616c3b54313a323b54363a706167652d313b5431313a6e61746976655f746578743b54313a333b5431313a617373657274696f6e2d313b54383a656d706c6f7965723b54313a313b5433363a31303030303030302d303030302d343030302d383030302d3030303030303030303030313b5432303a6e61746976652d706167652d312d6c696e652d323b54363a706167652d313b5431313a6e61746976655f746578743b54323a31303b54323a33303b54323a32313b54323a34313b5431313a617373657274696f6e2d323b54343a726f6c653b54313a313b5433363a31303030303030302d303030302d343030302d383030302d3030303030303030303030313b5432303a6e61746976652d706167652d312d6c696e652d333b54363a706167652d313b5431313a6e61746976655f746578743b54313a363b54323a32333b54323a34383b54323a36353b5431313a617373657274696f6e2d333b54353a64617465733b54313a313b5433363a31303030303030302d303030302d343030302d383030302d3030303030303030303030313b5432303a6e61746976652d706167652d312d6c696e652d343b54363a706167652d313b5431313a6e61746976655f746578743b54313a373b54323a31383b54323a37333b54323a38343b54363a706167652d313b5431313a6e61746976655f746578743b54313a333b5431313a617373657274696f6e2d343b54383a656d706c6f7965723b54313a313b5433363a31303030303030302d303030302d343030302d383030302d3030303030303030303030313b5432303a6e61746976652d706167652d312d6c696e652d353b54363a706167652d313b5431313a6e61746976655f746578743b54323a31303b54323a32393b54323a39353b54333a3131343b5431313a617373657274696f6e2d353b54343a726f6c653b54313a313b5433363a31303030303030302d303030302d343030302d383030302d3030303030303030303030313b5432303a6e61746976652d706167652d312d6c696e652d363b54363a706167652d313b5431313a6e61746976655f746578743b54313a363b54323a31393b54333a3132313b54333a3133343b5431313a617373657274696f6e2d363b54353a64617465733b54313a313b5433363a31303030303030302d303030302d343030302d383030302d3030303030303030303030313b5432303a6e61746976652d706167652d312d6c696e652d373b54363a706167652d313b5431313a6e61746976655f746578743b54313a373b54323a31383b54333a3134323b54333a3135333b"
}$oracle$::jsonb;
  owner_id uuid:=(oracle->'scope'->>'ownerId')::uuid; org_id uuid;
  root_id uuid:=(oracle->'scope'->>'resumeId')::uuid; source_id uuid:=(oracle->'scope'->>'sourceId')::uuid;
  analysis_id uuid:=(oracle->'scope'->>'analysisId')::uuid; attempt_id uuid:=(oracle->'scope'->>'attemptId')::uuid;
  envelope jsonb:=oracle->'envelope'; original jsonb:=oracle->'original'; command jsonb:=oracle->'command';
  result jsonb; initial jsonb; imported jsonb; review_id uuid:=gen_random_uuid(); latest_id uuid:=gen_random_uuid(); count_before bigint;
begin
  insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
    values(owner_id,'authenticated','authenticated','a02-'||owner_id||'@example.test','{"provider":"email","providers":["email"]}','{}');
  select id into strict org_id from public.organizations o where o.owner_id=fixture_scope.owner_id;
  original:=jsonb_set(original,'{organizationId}',to_jsonb(org_id));
  command:=jsonb_set(command,'{normalForm,binding,organizationId}',to_jsonb(org_id));
  command:=jsonb_set(command,'{previewHash}',to_jsonb(private.grouped_import_command_sha256(private.grouped_original_atoms(command->'normalForm'))));
  insert into public.resumes(id,organization_id,owner_id,display_name) values(root_id,org_id,owner_id,'Synthetic A02 read');
  insert into public.resume_versions(id,resume_id,organization_id,owner_id,storage_key,checksum,bytes,media_type)
    values(source_id,root_id,org_id,owner_id,'a02-read/'||source_id,repeat('a',64),1024,'application/pdf');
  insert into public.analyses(id,resume_version_id,organization_id,owner_id,status,idempotency_key)
    values(analysis_id,source_id,org_id,owner_id,'needs_ocr',gen_random_uuid());
  delete from public.analysis_jobs j where j.analysis_id=fixture_scope.analysis_id;
  insert into public.document_evidence_attempts(id,analysis_id,organization_id,owner_id,resume_version_id,input_sha256,attempt_number,envelope)
    values(attempt_id,analysis_id,org_id,owner_id,source_id,repeat('a',64),1,envelope);
  select count(*) into count_before from public.candidate_entry_association_batches where owner_id=fixture_scope.owner_id;
  initial:=public.read_grouped_original_workspace(owner_id,analysis_id);
  perform pg_temp.a02_read_assert(initial->>'status'='available' and initial->'compatibilityReady'='true'::jsonb
    and initial->'canCommit'='false'::jsonb and initial->'freshImportAllowed'='true'::jsonb,'ready_but_writer_denied');
  perform pg_temp.a02_read_assert(initial->'attempt'->'envelope'=envelope and initial->'source'=jsonb_build_object(
    'ownerId',owner_id,'organizationId',org_id,'resumeId',root_id,'analysisId',analysis_id,'sourceId',source_id,'attemptId',attempt_id,'inputSha256',repeat('a',64)),'one_exact_source_envelope');
  perform pg_temp.a02_read_assert(initial->'captured'=jsonb_build_object('reviewRevision',0,'reviewHeadId',null,
    'assignmentRevision',0,'assignmentHeadId',null,'associationRevision',0,'associationHeadId',null,'canonicalHeadId',null),'actual_initial_pairs');
  perform pg_temp.a02_read_assert((select count(*) from public.candidate_entry_association_batches where owner_id=fixture_scope.owner_id)=count_before
    and not exists(select 1 from public.canonical_resume_heads where resume_id=root_id),'read_has_no_version_or_approval_writes');
  result:=public.read_grouped_original_workspace('ffffffff-ffff-ffff-ffff-ffffffffffff',analysis_id);
  perform pg_temp.a02_read_assert(result=jsonb_build_object('schemaVersion','grouped-original-read/1.0.0','status','not_found','scoringEligible',false),'foreign_owner_fixed_not_found');
  result:=public.read_grouped_original_workspace(owner_id,'ffffffff-ffff-ffff-ffff-ffffffffffff');
  perform pg_temp.a02_read_assert(result->>'status'='not_found','missing_analysis_denied');
  -- Privileged fixture construction invokes the revoked writer without granting caller access.
  imported:=public.import_canonical_grouped_original(owner_id,analysis_id,command,original,'a02-read-owned');
  perform pg_temp.a02_read_assert(imported->>'status'='applied','privileged_grouped_fixture');
  insert into public.evidence_corrections(id,attempt_id,analysis_id,organization_id,owner_id,actor_id,revision,expected_revision,field,operation,value,candidate_id,idempotency_key,request_id)
    values(review_id,attempt_id,analysis_id,org_id,owner_id,owner_id,1,0,'employer','correct','Synthetic Later Proposal',null,gen_random_uuid(),'a02-read-owned');
  result:=public.read_grouped_original_workspace(owner_id,analysis_id);
  perform pg_temp.a02_read_assert(result->'captured'->'canonicalHeadId'=imported->'versionId'
    and result->'captured'->'associationHeadId'=imported->'batchId' and result->'captured'->'associationRevision'='1'::jsonb
    and result->'captured'->'reviewRevision'='1'::jsonb and result->'captured'->>'reviewHeadId'=review_id::text
    and result->'freshImportAllowed'='false'::jsonb and result->'canCommit'='false'::jsonb,'nonzero_captures_head_and_capability_are_distinct');
  insert into public.document_evidence_attempts(id,analysis_id,organization_id,owner_id,resume_version_id,input_sha256,attempt_number,envelope)
    values(latest_id,analysis_id,org_id,owner_id,source_id,repeat('a',64),2,jsonb_set(envelope,'{id}',to_jsonb(latest_id)));
  result:=public.read_grouped_original_workspace(owner_id,analysis_id);
  perform pg_temp.a02_read_assert(result->'source'->>'attemptId'=latest_id::text and result->'attempt'->>'id'=latest_id::text
    and result->'attempt'->'attemptNumber'='2'::jsonb and result->'attempt'->'envelope'->>'id'=latest_id::text,'latest_attempt_not_mixed_with_old_envelope');
  insert into public.data_requests(organization_id,user_id,kind) values(org_id,owner_id,'deletion');
  result:=public.read_grouped_original_workspace(owner_id,analysis_id);
  perform pg_temp.a02_read_assert(result=jsonb_build_object('schemaVersion','grouped-original-read/1.0.0','status','not_found','scoringEligible',false),'current_privacy_blocks_raw_source');
  raise notice 'A02_READ_SOURCE_CASES_COMPLETE_ROLLBACK_REQUIRED';
end;
$native$;
rollback;
