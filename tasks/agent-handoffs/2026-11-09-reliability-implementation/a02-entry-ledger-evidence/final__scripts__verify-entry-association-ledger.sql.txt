-- SOURCE ONLY / UNPARSED / UNAPPLIED / UNEXECUTED.
-- Privileged rollback-only helper/metadata fixture, not public-writer or concurrency proof.
-- Requires a separately admitted exact isolated managed target and absent allocated owners.
-- No runner invokes this file. On any error the admitted operator must roll back.
begin isolation level read committed;
set local statement_timeout='20s';
set local lock_timeout='2s';
set local idle_in_transaction_session_timeout='30s';
do $admission$
declare k text;
begin
  if current_setting('resumide.entry_ledger_admission',true) is distinct from 'isolated-managed-entry-ledger/1' then
    raise exception 'ENTRY_LEDGER_TARGET_NOT_ADMITTED' using errcode='42501'; end if;
  foreach k in array array['resumide.entry_ledger_owner_id','resumide.entry_ledger_foreign_owner_id','resumide.entry_ledger_run_id'] loop
    if coalesce(current_setting(k,true),'') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then
      raise exception 'ENTRY_LEDGER_ALLOCATION_MISSING' using errcode='42501'; end if;
  end loop;
  if current_setting('resumide.entry_ledger_owner_id')=current_setting('resumide.entry_ledger_foreign_owner_id')
    or exists(select 1 from auth.users where id in (current_setting('resumide.entry_ledger_owner_id')::uuid,current_setting('resumide.entry_ledger_foreign_owner_id')::uuid)) then
    raise exception 'ENTRY_LEDGER_FIXTURE_COLLISION' using errcode='42501'; end if;
end;
$admission$;
create function pg_temp.entry_assert(p_ok boolean,p_case text) returns void language plpgsql set search_path='' as $$
begin if p_ok is not true then raise exception 'ENTRY_LEDGER_ASSERT_%',p_case using errcode='23514'; end if; end;
$$;
create function pg_temp.entry_fixture_version(p_body jsonb,p_parent uuid,p_command jsonb,p_snapshot boolean default true) returns uuid
language plpgsql set search_path='' as $$
declare v_id uuid:=(p_body->>'versionId')::uuid; rev integer:=1; op text;
begin
  if p_parent is not null then select revision+1 into strict rev from public.canonical_resume_versions where id=p_parent; end if;
  insert into public.canonical_resume_versions(id,resume_id,source_resume_version_id,organization_id,owner_id,locale,state,content,created_at,
    parent_version_id,source_evidence_version_id,revision,idempotency_key,command,request_id)
    values(v_id,(p_body->>'resumeId')::uuid,(select resume_version_id from public.document_evidence_attempts where id=(p_body->>'sourceEvidenceVersionId')::uuid),
      (p_body->>'organizationId')::uuid,(p_body->>'ownerId')::uuid,p_body->>'locale',p_body->>'state',p_body,(p_body->>'createdAt')::timestamptz,
      p_parent,(p_body->>'sourceEvidenceVersionId')::uuid,rev,(p_command->>'idempotencyKey')::uuid,p_command,'entry-ledger-fixture');
  insert into public.resume_facts(canonical_version_id,id,organization_id,owner_id,type,value,state,sources,confirmation)
    select v_id,(value->>'id')::uuid,(p_body->>'organizationId')::uuid,(p_body->>'ownerId')::uuid,value->>'type',value->>'value',value->>'state',value->'sources',nullif(value->'confirmation','null'::jsonb)
    from jsonb_array_elements(p_body->'facts');
  op:=case when p_command->>'operation'='grouped_original_import' then 'import' else p_command->>'operation' end;
  insert into public.change_events(canonical_version_id,id,owner_id,organization_id,actor_id,operation,event,created_at)
    select v_id,(value->>'id')::uuid,(p_body->>'ownerId')::uuid,(p_body->>'organizationId')::uuid,(value->>'actorId')::uuid,op,value,(p_body->>'createdAt')::timestamptz
    from jsonb_array_elements(p_body->'changes');
  if p_snapshot then
    perform private.write_correction_snapshot(v_id,p_command);
    -- The later admission migration installs this companion hook; do not call twice.
    if not exists(select 1 from public.canonical_entry_association_snapshots where canonical_version_id=v_id) then
      perform private.entry_association_write_snapshot(v_id,p_command);
    end if;
  end if;
  return v_id;
end;
$$;
do $fixture$
#variable_conflict use_variable
declare oracle jsonb:=$oracle$
{
  "fixture": {
    "id": "two_jobs_overlap",
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
      "producerVersion": "canonical-engine/1.0.3",
      "admissionPolicyVersion": "grouped-original-admission/1.0.0",
      "structuralTextProfileVersion": "a02-structural-text/1.0.0",
      "correctionProjectionModelVersion": "canonical-corrections/1.0.1",
      "correctionAdmissionPolicyVersion": "candidate-correction-admission/1.0.0",
      "effectiveLocale": "en-IN"
    },
    "projected": [
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
    ],
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
    ],
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
    "placement": {
      "schemaVersion": "grouped-original-placement/1.0.0",
      "authority": "derived_preparation_only",
      "persistable": false,
      "scoringEligible": false,
      "requiresDurableAdmission": true,
      "document": {
        "schemaVersion": "canonical-resume/1.0.0",
        "producerVersion": "canonical-engine/1.0.3",
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
                  "40000000-0000-4000-8000-000000000002",
                  "40000000-0000-4000-8000-000000000003",
                  "40000000-0000-4000-8000-000000000004"
                ],
                "bullets": []
              },
              {
                "id": "40000000-0000-4000-8000-00000000000c",
                "factIds": [
                  "40000000-0000-4000-8000-000000000005",
                  "40000000-0000-4000-8000-000000000006",
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
      "mappings": [
        {
          "selection": {
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
          "sectionId": "40000000-0000-4000-8000-000000000008",
          "entryId": "40000000-0000-4000-8000-000000000009",
          "members": [
            {
              "assertionId": "assertion-1",
              "field": "employer",
              "factId": "40000000-0000-4000-8000-000000000002",
              "originalEntryId": "40000000-0000-4000-8000-000000000009",
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
              "factId": "40000000-0000-4000-8000-000000000003",
              "originalEntryId": "40000000-0000-4000-8000-00000000000a",
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
              "factId": "40000000-0000-4000-8000-000000000004",
              "originalEntryId": "40000000-0000-4000-8000-00000000000b",
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
          "selection": {
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
          },
          "sectionId": "40000000-0000-4000-8000-000000000008",
          "entryId": "40000000-0000-4000-8000-00000000000c",
          "members": [
            {
              "assertionId": "assertion-4",
              "field": "employer",
              "factId": "40000000-0000-4000-8000-000000000005",
              "originalEntryId": "40000000-0000-4000-8000-00000000000c",
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
              "factId": "40000000-0000-4000-8000-000000000006",
              "originalEntryId": "40000000-0000-4000-8000-00000000000d",
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
              "factId": "40000000-0000-4000-8000-000000000007",
              "originalEntryId": "40000000-0000-4000-8000-00000000000e",
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
    "prototypeState": "prepared"
  },
  "normalForm": {
    "schemaVersion": "grouped-original-command/1.0.0",
    "operation": "approve_and_import_grouped_original",
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
  ]
}
$oracle$::jsonb;
  owner_id uuid:=current_setting('resumide.entry_ledger_owner_id')::uuid; org_id uuid; root_id uuid:=gen_random_uuid(); source_id uuid:=gen_random_uuid();
  analysis_id uuid:=gen_random_uuid(); attempt_id uuid:=gen_random_uuid(); batch_id uuid:=gen_random_uuid(); storage_id uuid:=gen_random_uuid(); outer_id uuid:=gen_random_uuid();
  binding jsonb; normal jsonb; command jsonb; bytes bytea; sha text; original jsonb; body jsonb; inner_command jsonb; group_value jsonb; member jsonb;
  group_id uuid; first_group uuid; second_group uuid; source_order integer; entry_order integer; group_order integer:=0; key text; replacement text;
  origin_id uuid; confirmed_id uuid; edited_id uuid; added_id uuid; restored_id uuid; restored_edit_id uuid; previous_id uuid; child_id uuid;
  fact_id uuid; extra_fact uuid:=gen_random_uuid(); mode text; snapshot_count bigint; arrays jsonb; names text[]; rel regclass; role_name text; row_value jsonb;
  legacy_root uuid:=gen_random_uuid(); legacy_source uuid:=gen_random_uuid(); legacy_analysis uuid:=gen_random_uuid(); legacy_attempt uuid:=gen_random_uuid(); legacy_id uuid; legacy_child uuid;
  foreign_owner uuid:=current_setting('resumide.entry_ledger_foreign_owner_id')::uuid; foreign_org uuid; foreign_root uuid:=gen_random_uuid(); foreign_source uuid:=gen_random_uuid(); foreign_analysis uuid:=gen_random_uuid(); foreign_attempt uuid:=gen_random_uuid();
  captured_members jsonb; bad jsonb; rejected boolean;
begin
  perform private.lock_candidate_owners(array[owner_id,foreign_owner]);
  insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
    (owner_id,'authenticated','authenticated','entry-'||owner_id||'@example.test','{"provider":"email","providers":["email"]}','{}'),
    (foreign_owner,'authenticated','authenticated','entry-'||foreign_owner||'@example.test','{"provider":"email","providers":["email"]}','{}');
  select id into strict org_id from public.organizations where public.organizations.owner_id=owner_id;
  select id into strict foreign_org from public.organizations where public.organizations.owner_id=foreign_owner;
  foreach key in array array['ownerId','organizationId','resumeId','analysisId','sourceId','attemptId'] loop
    replacement:=case key when 'ownerId' then owner_id::text when 'organizationId' then org_id::text when 'resumeId' then root_id::text when 'analysisId' then analysis_id::text when 'sourceId' then source_id::text else attempt_id::text end;
    oracle:=replace(oracle::text,oracle->'fixture'->'binding'->>key,replacement)::jsonb;
  end loop;
  binding:=oracle->'fixture'->'binding'; original:=oracle->'fixture'->'original'; body:=oracle->'fixture'->'placement'->'document'; origin_id:=(body->>'versionId')::uuid;
  perform pg_temp.entry_assert(not exists(select 1 from public.canonical_resume_versions where id=origin_id),'origin_id_absent');
  insert into public.resumes(id,organization_id,owner_id,display_name) values(root_id,org_id,owner_id,'Synthetic entry metadata');
  insert into public.resume_versions(id,resume_id,organization_id,owner_id,storage_key,checksum,bytes,media_type)
    values(source_id,root_id,org_id,owner_id,'entry-synthetic/'||source_id,repeat('a',64),1024,'application/pdf');
  insert into public.analyses(id,resume_version_id,organization_id,owner_id,status,idempotency_key) values(analysis_id,source_id,org_id,owner_id,'needs_ocr',gen_random_uuid());
  delete from public.analysis_jobs where public.analysis_jobs.analysis_id=analysis_id;
  insert into public.document_evidence_attempts(id,analysis_id,organization_id,owner_id,resume_version_id,input_sha256,attempt_number,envelope)
    values(attempt_id,analysis_id,org_id,owner_id,source_id,repeat('a',64),1,oracle->'fixture'->'envelope');
  normal:=oracle->'normalForm'; bytes:=private.grouped_import_command_bytes(array(select jsonb_array_elements_text(oracle->'atoms'))); sha:=encode(extensions.digest(bytes,'sha256'),'hex');
  command:=jsonb_build_object('normalForm',normal,'previewHash',sha,'idempotencyKey',outer_id);
  inner_command:=jsonb_build_object('schemaVersion','grouped-original-storage/1.0.0','operation','grouped_original_import','batchId',batch_id,'semanticSha256',sha,'idempotencyKey',storage_id);
  insert into public.candidate_entry_association_batches(id,owner_id,organization_id,resume_id,analysis_id,source_resume_version_id,evidence_attempt_id,input_sha256,
    association_revision,previous_batch_id,idempotency_key,command,command_bytes,command_sha256,codec_version,result_version_id,result_revision,storage_key,result_content_sha256)
    values(batch_id,owner_id,org_id,root_id,analysis_id,source_id,attempt_id,repeat('a',64),1,null,outer_id,command,bytes,sha,'a02-command-bytes/1.0.0',origin_id,1,storage_id,
      encode(extensions.digest(convert_to(body::text,'UTF8'),'sha256'),'hex'));
  for group_value in select value from jsonb_array_elements(oracle->'fixture'->'placement'->'mappings') loop
    group_order:=group_order+1; group_id:=gen_random_uuid(); if group_order=1 then first_group:=group_id; else second_group:=group_id; end if;
    insert into public.candidate_entry_association_groups(id,batch_id,owner_id,organization_id,resume_id,source_resume_version_id,result_version_id,group_order,page_id,method,section_id,entry_id,source_selection)
      values(group_id,batch_id,owner_id,org_id,root_id,source_id,origin_id,group_order,group_value->'selection'->>'pageId',group_value->'selection'->>'method',
        (group_value->>'sectionId')::uuid,(group_value->>'entryId')::uuid,group_value->'selection');
    entry_order:=0;
    for member in select value from jsonb_array_elements(group_value->'members') loop
      entry_order:=entry_order+1;
      select ordinality::integer into strict source_order from jsonb_array_elements(group_value->'selection'->'members') with ordinality where value->>'assertionId'=member->>'assertionId';
      insert into public.candidate_entry_association_members(id,group_id,batch_id,owner_id,organization_id,resume_id,source_resume_version_id,result_version_id,
        source_order,entry_order,assertion_id,field,fact_id,original_entry_id,citations)
        values(gen_random_uuid(),group_id,batch_id,owner_id,org_id,root_id,source_id,origin_id,source_order,entry_order,member->>'assertionId',member->>'field',
          (member->>'factId')::uuid,(member->>'originalEntryId')::uuid,member->'citations');
    end loop;
  end loop;
  perform pg_temp.entry_fixture_version(body,null,inner_command);
  perform private.entry_association_validate_head(origin_id);
  perform pg_temp.entry_assert(private.entry_association_prefix(binding)=jsonb_build_object('associationRevision',1,'associationHeadId',batch_id),'exact_prefix');
  perform pg_temp.entry_assert((select count(*)=2 from public.canonical_entry_association_links where canonical_version_id=origin_id),'initial_whole_groups');
  -- Reordered normalized member metadata must fail validation. The subtransaction restores the immutable rows after the expected failure.
  select jsonb_agg(to_jsonb(m)) into captured_members from public.candidate_entry_association_members m where m.group_id=first_group;
  rejected:=false;
  begin
    delete from public.candidate_entry_association_members where public.candidate_entry_association_members.group_id=first_group;
    for bad in select value from jsonb_array_elements(captured_members) loop
      bad:=jsonb_set(bad,'{entry_order}',to_jsonb(case (bad->>'entry_order')::integer when 2 then 3 when 3 then 2 else 1 end));
      insert into public.candidate_entry_association_members select * from jsonb_populate_record(null::public.candidate_entry_association_members,bad);
    end loop;
    perform private.entry_association_validate_head(origin_id);
  exception when sqlstate 'P0C03' then rejected:=true;
  end;
  perform pg_temp.entry_assert(rejected,'ordered_members_refused');
  previous_id:=origin_id; fact_id:=(body->'facts'->0->>'id')::uuid;
  foreach mode in array array['confirm','rename_section','add','rollback_origin','edit','rollback_origin','rollback_edit'] loop
    child_id:=gen_random_uuid();
    if mode='rollback_origin' then select content into strict body from public.canonical_resume_versions where id=origin_id;
    elsif mode='rollback_edit' then select content into strict body from public.canonical_resume_versions where id=edited_id;
    else select content into strict body from public.canonical_resume_versions where id=previous_id; end if;
    body:=body||jsonb_build_object('versionId',child_id,'parentVersionId',previous_id);
    if mode='confirm' then body:=jsonb_set(body,'{facts,0}',(body->'facts'->0)||jsonb_build_object('state','candidate_confirmed','confirmation',jsonb_build_object('actorId',owner_id,'value',body->'facts'->0->'value','confirmedAt',body->'createdAt')));
    elsif mode='rename_section' then body:=jsonb_set(body,'{sections,0,title}','"Renamed experience"');
    elsif mode='edit' then body:=jsonb_set(body,'{facts,0}',(body->'facts'->0)||jsonb_build_object('value','Synthetic edited employer','sources','[]'::jsonb,'state','unconfirmed','confirmation',null));
    elsif mode='add' then body:=jsonb_set(jsonb_set(body,'{producerVersion}','"canonical-engine/1.0.2"'),'{facts}',(body->'facts')||jsonb_build_array(jsonb_build_object('id',extra_fact,'type','dates','value','Synthetic added date','sources','[]'::jsonb,'state','unconfirmed','confirmation',null)));
      body:=jsonb_set(body,'{sections,0,entries,0,factIds}',(body->'sections'->0->'entries'->0->'factIds')||to_jsonb(extra_fact)); end if;
    inner_command:=jsonb_build_object('operation',case when mode like 'rollback_%' then 'rollback' else mode end,'expectedVersionId',previous_id,'idempotencyKey',gen_random_uuid(),
      'factId',fact_id,'value',null,'targetVersionId',case mode when 'rollback_origin' then origin_id when 'rollback_edit' then edited_id else null end);
    body:=body||jsonb_build_object('changes',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'actorId',owner_id,'action',case when mode like 'rollback_%' then 'rollback' when mode='add' then 'create' else 'edit' end,
      'targetId',case when mode like 'rollback_%' then child_id else fact_id end,'priorValue',null,'createdAt',body->'createdAt')));
    perform pg_temp.entry_fixture_version(body,previous_id,inner_command);
    if mode='confirm' then confirmed_id:=child_id;
    elsif mode='edit' then edited_id:=child_id;
    elsif mode='add' then added_id:=child_id;
    elsif mode='rollback_origin' then restored_id:=child_id;
    elsif mode='rollback_edit' then restored_edit_id:=child_id; end if;
    perform pg_temp.entry_assert((select origin_batch_id=batch_id from public.canonical_entry_association_snapshots where canonical_version_id=child_id),'origin_history_retained_'||mode);
    perform pg_temp.entry_assert((select count(*)=case when mode in ('confirm','rename_section','rollback_origin') then 2 else 1 end from public.canonical_entry_association_links where canonical_version_id=child_id),'whole_group_lifecycle_'||mode);
    previous_id:=child_id;
  end loop;
  -- A separate legacy lineage covers TARGET restore with no historical association marker.
  insert into public.resumes(id,organization_id,owner_id,display_name) values(legacy_root,org_id,owner_id,'Synthetic legacy metadata');
  insert into public.resume_versions(id,resume_id,organization_id,owner_id,storage_key,checksum,bytes,media_type) values(legacy_source,legacy_root,org_id,owner_id,'entry-legacy/'||legacy_source,repeat('a',64),1024,'application/pdf');
  insert into public.analyses(id,resume_version_id,organization_id,owner_id,status,idempotency_key) values(legacy_analysis,legacy_source,org_id,owner_id,'needs_ocr',gen_random_uuid());
  delete from public.analysis_jobs where public.analysis_jobs.analysis_id=legacy_analysis;
  bad:=replace(replace(replace((oracle->'fixture'->'envelope')::text,source_id::text,legacy_source::text),analysis_id::text,legacy_analysis::text),attempt_id::text,legacy_attempt::text)::jsonb;
  insert into public.document_evidence_attempts(id,analysis_id,organization_id,owner_id,resume_version_id,input_sha256,attempt_number,envelope) values(legacy_attempt,legacy_analysis,org_id,owner_id,legacy_source,repeat('a',64),1,bad);
  body:=replace(replace(replace(replace(original::text,root_id::text,legacy_root::text),source_id::text,legacy_source::text),analysis_id::text,legacy_analysis::text),attempt_id::text,legacy_attempt::text)::jsonb;
  legacy_id:=gen_random_uuid(); body:=body||jsonb_build_object('versionId',legacy_id);
  body:=jsonb_set(body,'{changes,0,targetId}',to_jsonb(legacy_id));
  inner_command:=jsonb_build_object('operation','import','expectedVersionId',null,'idempotencyKey',gen_random_uuid(),'factId',null,'value',null,'targetVersionId',null);
  perform pg_temp.entry_fixture_version(body,null,inner_command,false);
  legacy_child:=gen_random_uuid(); body:=body||jsonb_build_object('versionId',legacy_child,'parentVersionId',legacy_id);
  body:=jsonb_set(body,'{changes,0}',jsonb_build_object('id',gen_random_uuid(),'actorId',owner_id,'action','rollback','targetId',legacy_child,'priorValue',null,'createdAt',body->'createdAt'));
  inner_command:=inner_command||jsonb_build_object('operation','rollback','expectedVersionId',legacy_id,'targetVersionId',legacy_id,'idempotencyKey',gen_random_uuid());
  perform pg_temp.entry_fixture_version(body,legacy_id,inner_command);
  perform pg_temp.entry_assert((select origin_kind='legacy_empty' and origin_batch_id is null and restored_from_version_id=legacy_id from public.canonical_entry_association_snapshots where canonical_version_id=legacy_child),'target_legacy_empty');
  arrays:=public.export_resume_workspace_records(owner_id);
  names:=array['candidateCorrectionOperations','candidateCorrectionAssignments','candidateCorrectionApplications','canonicalCorrectionSnapshots','canonicalCorrectionSnapshotFacts',
    'candidateEntryAssociationBatches','candidateEntryAssociationGroups','candidateEntryAssociationMembers','canonicalEntryAssociationSnapshots','canonicalEntryAssociationLinks'];
  foreach key in array names loop
    perform pg_temp.entry_assert(jsonb_typeof(arrays->key)='array','export_required_'||key);
    for row_value in select value from jsonb_array_elements(arrays->key) loop perform pg_temp.entry_assert(row_value->>'owner_id'=owner_id::text,'export_owner_'||key); end loop;
  end loop;
  perform pg_temp.entry_assert(jsonb_array_length(arrays->'candidateEntryAssociationMembers')=6,'ordered_members_exported');
  arrays:=private.entry_association_export_records(foreign_owner);
  foreach key in array names loop perform pg_temp.entry_assert(jsonb_array_length(arrays->key)=0,'foreign_export_excludes_'||key); end loop;
  foreach key in array array['candidate_entry_association_batches','candidate_entry_association_groups','candidate_entry_association_members','canonical_entry_association_snapshots','canonical_entry_association_links'] loop
    rel:=to_regclass('public.'||key);
    perform pg_temp.entry_assert((select relrowsecurity from pg_catalog.pg_class where oid=rel),'rls_'||key);
    foreach role_name in array array['anon','authenticated','service_role'] loop
      perform pg_temp.entry_assert(not has_table_privilege(role_name,rel,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') and not has_any_column_privilege(role_name,rel,'SELECT,INSERT,UPDATE'),'direct_access_denied_'||key);
    end loop;
  end loop;
  delete from public.resumes where id=root_id;
  perform pg_temp.entry_assert(not exists(select 1 from public.candidate_entry_association_batches where resume_id=root_id)
    and not exists(select 1 from public.candidate_entry_association_groups where resume_id=root_id)
    and not exists(select 1 from public.candidate_entry_association_members where resume_id=root_id)
    and not exists(select 1 from public.canonical_entry_association_snapshots where resume_id=root_id)
    and not exists(select 1 from public.canonical_entry_association_links where resume_id=root_id),'root_cascade_all_five');
  perform pg_temp.entry_assert(exists(select 1 from public.canonical_entry_association_snapshots where canonical_version_id=legacy_child),'unrelated_lineage_retained');
  set constraints all immediate;
end;
$fixture$;
rollback;
