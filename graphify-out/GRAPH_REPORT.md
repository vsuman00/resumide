# Graph Report - app  (2026-11-22)

## Corpus Check
- 307 files · ~296,890 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: .css 7)

## Summary
- 3731 nodes · 8902 edges · 147 communities (141 shown, 6 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 102 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- LaTeX PDF Preview
- Typed Authoring Codec
- Job Queue & Leasing
- Requirement Relationships
- Restore Admission
- AI Budget
- Canonical Rewrite Contract
- Job Duration Subjects
- Clarification & Authoring Forms
- Analyze & AI Budget Sources
- Initial Feedback Operations
- Analyze Request & Errors
- Evaluation Corpus
- Analysis Ingestion
- Artifact Render Plans
- Grouped Original Import Review
- Auth & Deletion Verification
- Brand & 3D Evidence Scene
- Typed Authoring Contract
- Writing Support
- Authoring Contract
- Legacy Scoring Input
- Canonical Correction Review UI
- Entry Regroup Diff UI
- ATS Rules
- Initial Feedback Plan
- Evidence Entry Associations
- Job Requirement Admission
- Qualitative Support
- Analysis Stage Fence
- OCR Local Container
- Authoring Workspace UI
- Typed Authoring Bridge UI
- Document Extraction
- Canonical Content
- Entry Regroup Repository
- Feedback Publication Policy
- File Uploader & Config
- Initial Feedback Schemas
- PaddleOCR Integration
- BuildAiAssistant
- ai-readiness
- initial-feedback-operation-profile
- requirement-relationship-context
- score-v2-contract
- initial-feedback-ai
- canonical-corrections
- canonical-rewrite-workspace
- jd-clause-order-drafting
- clause-order-authoring
- canonical-entry-regroup-commands
- requirement-duration
- owned-ai-budget-export
- extraction-benchmark
- initial-feedback-contract
- iso-datetime
- ai-budget-source
- server/build-assist
- canonical-entry-regroup
- canonical-rewrite-ai
- extraction-stage
- owned-legacy-ai-usage-profile
- ATS
- StageTimeline
- layout-read-model
- grouped-import-commands
- job-aliases
- document-page-count-readiness-profile
- jd-clause-order-writer-scope
- jd-clause-order-decisions
- jd-clause-order-http
- canonical-grouped-import
- evaluation-claims
- evidence-review
- owned-ai-retirement-export
- pilot-workflow
- artifact-repository
- document-evidence
- evaluation-runner
- job-domain
- owned-ai-disposition-export
- TelemetryReporter
- CanonicalRewritePanel
- JdClauseOrderBridge
- evaluation-partitions
- evaluation-statistics
- pilot-evidence
- native-evidence
- evaluation-annotation
- owned-ai-usage
- privacy-operations
- analysis.canonical
- CitedWritingSuggestions
- JdRecommendations
- build-assist-support
- analysis.evidence
- canonical-rewrite-readiness-profile
- evidence-fields
- jd-clause-order-readiness
- Accordion
- NativeLayoutEvidence
- owned-legacy-ai-usage-export
- typed-authoring-readiness
- ClientOnly
- privacy-deletion
- evaluation-calibration
- schema
- createInitialFeedbackOperation
- local-review-admission
- boundedText()
- owned-ai-expiry
- layout
- contact
- JdClauseOrderBridge()
- ParseView
- ThemeControl
- ExportManifest
- initial-feedback-consumer
- parseSim
- AdmissionCleanupDeferred
- claimItems()
- RequirementCoverageReview
- canonical-resume-schema
- analysis.rewrite.workspace
- paddle-admission
- assessPilotEvidence()
- job-relation-unicode
- result-cache
- JdClauseOrderReview
- authorization
- bad()
- score-v2-validity-metrics
- ResultTabs
- ScoreAdmissionNotice
- ScoreBadge
- backup-restore
- correction-command-codec
- phase5-thresholds
- canonical-rewrite-workspace-profile
- InitialFeedbackContext
- load-scenario
- latex.compile-legacy
- initial-feedback-publication-profile
- owned-ai-expiry-profile

## God Nodes (most connected - your core abstractions)
1. `createSupabaseAdminClient()` - 105 edges
2. `getServerConfig()` - 91 edges
3. `createSupabaseServerClient()` - 63 edges
4. `CanonicalError` - 61 edges
5. `getAuthenticatedUser()` - 57 edges
6. `runProviderAttempt()` - 46 edges
7. `TypedAuthoringError` - 46 edges
8. `PublicApiError` - 40 edges
9. `requestIdFrom()` - 34 edges
10. `assertSameOrigin()` - 33 edges

## Surprising Connections (you probably didn't know these)
- `finish()` --indirect_call--> `pdf()`  [INFERRED]
  components/LatexPdfPreview.tsx → lib/server/artifact-worker.mjs
- `Privacy()` --indirect_call--> `isBlockingDeletionRequest()`  [INFERRED]
  routes/privacy.tsx → lib/privacy-deletion.ts
- `Resume()` --indirect_call--> `isFeedbackStrength()`  [INFERRED]
  routes/resume.tsx → lib/result-feedback.ts
- `ScoreDiagnostics()` --calls--> `AuthoringWorkspace()`  [EXTRACTED]
  routes/analysis.score.tsx → components/AuthoringWorkspace.tsx
- `LatexConverter()` --calls--> `BuildAiAssistant()`  [EXTRACTED]
  routes/latex.tsx → components/BuildAiAssistant.tsx

## Import Cycles
- None detected.

## Communities (147 total, 6 thin omitted)

### Community 0 - "LaTeX PDF Preview"
Cohesion: 0.06
Nodes (56): LatexPdfPreview(), destroyLoading(), finish(), LoadedPdf, PageRender, PageText, PDF_VERIFICATION_FAILED, PdfLoadResult (+48 more)

### Community 1 - "Typed Authoring Codec"
Cohesion: 0.05
Nodes (64): assertPostgresText(), encodeTypedAuthoringCommandAtoms(), hashTypedAuthoringCommandAtoms(), HEADER, TYPED_AUTHORING_COMMAND_CODEC_VERSION, TypedAuthoringReason, TypedAuthoringReceiptSchema, TypedAuthoringSelectionSchema (+56 more)

### Community 2 - "Job Queue & Leasing"
Cohesion: 0.05
Nodes (42): JOB_LEASE_SECONDS, MAX_JOB_ATTEMPTS, retryDelaySeconds(), AnalysisJobQueue, claimSchema, contextSchema, cleanLabelValue(), ClientTelemetry (+34 more)

### Community 3 - "Requirement Relationships"
Cohesion: 0.05
Nodes (58): RequirementRelationshipContext, RequirementRelationshipContextSchema, actions, agency, binding(), bindingSchema, citation, Citation (+50 more)

### Community 4 - "Restore Admission"
Cohesion: 0.09
Nodes (27): CandidateSchema, counter, evidence(), FenceSchema, instance, NonCommitAuthorization, OpenSchema, OutcomeSchema (+19 more)

### Community 5 - "AI Budget"
Cohesion: 0.06
Nodes (51): AI_BUDGET_SCHEMA_VERSION, AiBudgetBinding, AiBudgetError, AiBudgetErrorCode, AiBudgetNextBinding, AiBudgetReceipt, AiBudgetReconciliation, AiBudgetRpcClient (+43 more)

### Community 6 - "Canonical Rewrite Contract"
Cohesion: 0.06
Nodes (53): action, buildCanonicalRewriteWorkspace(), CANONICAL_REWRITE_POLICY, CANONICAL_REWRITE_POLICY_SHA256, CANONICAL_REWRITE_POLICY_VERSION, CanonicalRewriteBindingSchema, CanonicalRewriteClaimSchema, CanonicalRewriteCommandSchema (+45 more)

### Community 7 - "Job Duration Subjects"
Cohesion: 0.05
Nodes (52): binding, bounded(), common, deriveJobDurationSubjects(), expression, flags, fold(), JOB_DURATION_SUBJECT_POLICY (+44 more)

### Community 8 - "Clarification & Authoring Forms"
Cohesion: 0.09
Nodes (46): validateClauseOrderWorkspace(), applyAuthoring(), deriveClarificationReview(), previewClarification(), readAuthoringForm(), CanonicalError, domainFromJobTitle(), jobRelationSemanticSha256() (+38 more)

### Community 9 - "Analyze & AI Budget Sources"
Cohesion: 0.11
Nodes (36): AI_BUDGET_SOURCE_PROFILE, AI_BUDGET_SOURCE_PROFILES, AI_BUDGET_SOURCE_REGROUP_PROFILE, analyzeResume(), getClient(), getModel(), runAnalysis(), proseModelOptions() (+28 more)

### Community 10 - "Initial Feedback Operations"
Cohesion: 0.05
Nodes (50): attempt, binding, bounded(), budgetEnvelope, budgetReceipt, claim, compatibility, completion (+42 more)

### Community 11 - "Analyze Request & Errors"
Cohesion: 0.12
Nodes (35): analysisRateLimitKey(), parseBoundedAnalyzeFormData(), ApiErrorCode, ErrorBody, errorResponse(), methodNotAllowedResponse(), PublicApiError, PublicErrorStatus (+27 more)

### Community 12 - "Evaluation Corpus"
Cohesion: 0.07
Nodes (35): actorSchema, assessCorpusRetention(), assessEvaluationCorpus(), authorizedRepresentativeRecord(), CorpusAssessment, CorpusReasonCode, Action, actorSchema (+27 more)

### Community 13 - "Analysis Ingestion"
Cohesion: 0.07
Nodes (31): AdmissionCode, ANALYSIS_ADMISSION_POLICY_VERSION, AnalysisAdmissionError, createBoundQueuedAnalysis(), compensateUnadoptedUpload(), createQueuedAnalysis(), deniedSchema, digest() (+23 more)

### Community 14 - "Artifact Render Plans"
Cohesion: 0.07
Nodes (37): ArtifactObservation, ArtifactOptions, ArtifactOptionsSchema, ArtifactPlanError, ArtifactReport, buildRenderPlan(), hash(), normalizeArtifactText() (+29 more)

### Community 15 - "Grouped Original Import Review"
Cohesion: 0.07
Nodes (44): Available, CommitForm(), exact(), fields, FreshReview(), GroupedOriginalFeedback, GroupedOriginalImportReview(), Groups() (+36 more)

### Community 16 - "Auth & Deletion Verification"
Cohesion: 0.10
Nodes (31): authResponseHeaders(), getAuthenticatedUser(), invalidPathCharacters(), safeReturnTo(), SessionReader, AuthClient, jdClauseOrderHttpErrorResponse(), jdClauseOrderPrivateHeaders() (+23 more)

### Community 17 - "Brand & 3D Evidence Scene"
Cohesion: 0.07
Nodes (29): BrandLockup(), BrandLockupProps, EvidenceScene3D(), EvidenceScene3DProps, SceneVariant, Navbar(), RootLoaderData, PublicShell() (+21 more)

### Community 18 - "Typed Authoring Contract"
Cohesion: 0.08
Nodes (43): action, admitted(), Admitted, buildTypedAuthoringPatch(), buildTypedAuthoringWorkspace(), commandFields, createTypedAuthoringCommand(), current() (+35 more)

### Community 19 - "Writing Support"
Cohesion: 0.08
Nodes (42): ActionConcept, actionPattern, ACTIONS, Agency, assessRewrite(), assessSummary(), assessWritingSupport(), Binding (+34 more)

### Community 20 - "Authoring Contract"
Cohesion: 0.10
Nodes (37): assertAuthoringDiagnosticsAllowed(), AuthoringCommand, AuthoringCommandSchema, buildFindings(), buildSuggestion(), BulletPattern, ClarificationKind, clarifyValue() (+29 more)

### Community 21 - "Legacy Scoring Input"
Cohesion: 0.08
Nodes (41): context, audit, bounded(), checkContext(), checkReceipt(), checkResultChecksum(), evidence, fail() (+33 more)

### Community 22 - "Canonical Correction Review UI"
Cohesion: 0.06
Nodes (38): BoundReview(), CanonicalCorrectionReview(), commandBinding(), CorrectionItem(), Props, statusText, applicationRow, assignmentRow (+30 more)

### Community 23 - "Entry Regroup Diff UI"
Cohesion: 0.08
Nodes (36): CanonicalEntryRegroupDiff(), CurrentFact(), entryLabel(), Fact, FactReference(), fieldLabels, Prepared, Section (+28 more)

### Community 24 - "ATS Rules"
Cohesion: 0.10
Nodes (35): atsRules(), ATSRulesResult, buildTips(), Rule, RuleResult, RULES, RuleTrace, ScoreContext (+27 more)

### Community 25 - "Initial Feedback Plan"
Cohesion: 0.10
Nodes (36): INITIAL_FEEDBACK_MEASURED_TEMPLATES, INITIAL_FEEDBACK_PLAN_POLICY, InitialFeedbackCompileResultSchema, InitialFeedbackPlan, InitialFeedbackPlanError, InitialFeedbackRender, InitialFeedbackRenderSchema, InitialFeedbackSpanRef (+28 more)

### Community 26 - "Evidence Entry Associations"
Cohesion: 0.07
Nodes (35): DocumentEvidence, asciiLower(), Binding, deriveEvidenceEntryAssociations(), employmentFields, employmentHeadings, ENTRY_ASSOCIATION_MODEL_VERSION, EntryAssociationGroup (+27 more)

### Community 27 - "Job Requirement Admission"
Cohesion: 0.09
Nodes (36): assertJobRelationUnicodeRuntime(), atom, bound, build(), bySpan(), canonical(), clause, createJobRequirementRelations() (+28 more)

### Community 28 - "Qualitative Support"
Cohesion: 0.07
Nodes (35): assessQualitativeProse(), bindingSchema, categories, categorySchema, citationSchema, clarificationTemplates, digest, editorialTemplates (+27 more)

### Community 29 - "Analysis Stage Fence"
Cohesion: 0.15
Nodes (27): AnalysisStageFenceError, AnalysisStageOperation, AnalysisStageOptions, AnalysisStageRpcClient, assertAnalysisStageActive(), assertAnalysisStageLease(), checkedResult(), fencedCall() (+19 more)

### Community 30 - "OCR Local Container"
Cohesion: 0.07
Nodes (31): createLocalContainerOcrAdapter(), DockerCommand, LOCAL_OCR_VERSIONS, LocalOcrEvaluationConfig, runDocker(), BEST_LANGUAGE_DATA, TEXT_FUSION_MANIFEST, TEXT_FUSION_VERSIONS (+23 more)

### Community 31 - "Authoring Workspace UI"
Cohesion: 0.12
Nodes (30): AuthoringFeedback, AuthoringWorkspace(), BoundAcknowledgement(), ClarificationInputs(), Model, ReviewAcknowledgement(), changes, FactChange (+22 more)

### Community 32 - "Typed Authoring Bridge UI"
Cohesion: 0.13
Nodes (32): citation(), digest(), keys(), proposal(), reasons, receipt(), record(), safeError() (+24 more)

### Community 33 - "Document Extraction"
Cohesion: 0.11
Nodes (29): reconcileDocumentEvidence(), extractDocumentForReview(), extractDocumentForReviewWithMetadata(), ReviewExtractionArgs, assertResumeSource(), extractResumeText(), NativeTextLimits, PdfDocument (+21 more)

### Community 34 - "Canonical Content"
Cohesion: 0.15
Nodes (32): compareCanonical(), importCanonicalEvidence(), reviseCanonical(), rollbackCanonical(), AppliedCanonicalMutationResult, base, CanonicalCommandSchema, CanonicalRequestCommand (+24 more)

### Community 35 - "Entry Regroup Repository"
Cohesion: 0.11
Nodes (32): boundedCanonicalDocuments(), CanonicalEntryRegroupCapability, CanonicalEntryRegroupCurrent, CanonicalEntryRegroupDisplayGroup, CanonicalEntryRegroupError, capability(), Client, commitCanonicalEntryRegroup() (+24 more)

### Community 36 - "Feedback Publication Policy"
Cohesion: 0.07
Nodes (30): INITIAL_FEEDBACK_PLAN_POLICY_SHA256, INITIAL_FEEDBACK_PLAN_POLICY_VERSION, INITIAL_FEEDBACK_PLAN_PROFILE, acceptedScoringProfile, descriptor(), encodeInitialFeedbackPublicationPolicy(), hashInitialFeedbackPublicationPolicy(), historicalScoringProfile (+22 more)

### Community 37 - "File Uploader & Config"
Cohesion: 0.10
Nodes (21): FileUploader(), FileUploaderProps, AnalysisConfig, AnalysisConfigSchema, assertInitialFeedbackDependencies(), getUploadConfig(), parseAnalysisConfig(), parseServerConfig() (+13 more)

### Community 38 - "Initial Feedback Schemas"
Cohesion: 0.06
Nodes (32): InitialFeedbackAttemptSchema, InitialFeedbackBindingSchema, InitialFeedbackCompletion, InitialFeedbackCompletionSchema, InitialFeedbackFinishSchema, InitialFeedbackOperationSchema, InitialFeedbackProfileSelectionSchema, InitialFeedbackPublicationSchema (+24 more)

### Community 39 - "PaddleOCR Integration"
Cohesion: 0.11
Nodes (27): allowedResultUrl(), apiEnvelope, binding, PADDLEOCR_CONSENT_VERSION, PADDLEOCR_JOBS_URL, PADDLEOCR_MODEL, PaddleOcrConfig, resultHost (+19 more)

### Community 40 - "BuildAiAssistant"
Cohesion: 0.13
Nodes (27): BuildAiAssistant(), apply(), ask(), close(), show(), showCurrent(), undoLast(), checkedResult() (+19 more)

### Community 41 - "ai-readiness"
Cohesion: 0.10
Nodes (28): abortable(), AiLiveFailure, AiLiveReport, AiReadinessDependencies, AiReadinessInput, AiReadinessIssue, Allocation, allocation() (+20 more)

### Community 42 - "initial-feedback-operation-profile"
Cohesion: 0.06
Nodes (30): InitialFeedbackClaim, InitialFeedbackClaimSchema, InitialFeedbackOperation, InitialFeedbackPrepare, InitialFeedbackPrepareSchema, InitialFeedbackSettlement, InitialFeedbackSettlementSchema, InitialFeedbackUsageSchema (+22 more)

### Community 43 - "requirement-relationship-context"
Cohesion: 0.08
Nodes (31): LOCAL_JOB_RELATION_POLICY_SHA256, LOCAL_JOB_RELATION_POLICY_VERSION, JOB_RELATION_ADMISSION_PROFILE_SHA256, ancestor, available, bounded(), visit(), canonical (+23 more)

### Community 44 - "score-v2-contract"
Cohesion: 0.10
Nodes (29): JobRequirement, draft, LegacyScoreSchema, presentLegacyScore(), ScoreBlocker, ScoreDimensionId, ScorePolicyDraft, ScorePolicyDraftSchema (+21 more)

### Community 45 - "initial-feedback-ai"
Cohesion: 0.12
Nodes (26): abortable(), classify(), createInitialFeedbackRawTransport(), digest, generation(), INITIAL_FEEDBACK_AI_LIMITS, InitialFeedbackAiFailure, InitialFeedbackAiFailureCode (+18 more)

### Community 46 - "canonical-corrections"
Cohesion: 0.11
Nodes (29): admitCanonical(), CANONICAL_CORRECTION_PROJECTION_VERSION, CanonicalChoice, CanonicalCorrectionBinding, CanonicalCorrectionProjection, canonicalData(), Citation, contact (+21 more)

### Community 47 - "canonical-rewrite-workspace"
Cohesion: 0.11
Nodes (28): CanonicalRewriteWorkspaceSchema, availableNative, bootstrapProfileSchema, bounded(), call(), CanonicalRewriteWorkspaceClient, CanonicalRewriteWorkspaceInitialization, CanonicalRewriteWorkspaceInitializationSchema (+20 more)

### Community 48 - "jd-clause-order-drafting"
Cohesion: 0.14
Nodes (29): atomKey(), buildJdClauseOrderDraft(), buildJdClauseOrderPlan(), clauses(), digest, DraftBodySchema, draftFromValidated(), editableAtom() (+21 more)

### Community 49 - "clause-order-authoring"
Cohesion: 0.16
Nodes (25): clauseOrderCommandAtoms(), buildClauseOrderProposal(), clauseOrderCommandAtoms(), clauseOrderCommandSha256(), createClauseOrderCommand(), parseClauseOrderCommand(), sha(), validateClauseOrderReceipt() (+17 more)

### Community 50 - "canonical-entry-regroup-commands"
Cohesion: 0.10
Nodes (27): CanonicalEntryRegroupInput, atomsFor(), baseShape, bindingShape, bounded(), CanonicalEntryRegroupCommandContext, CanonicalEntryRegroupCommandNormalization, CanonicalEntryRegroupCommandPreparation (+19 more)

### Community 51 - "requirement-duration"
Cohesion: 0.11
Nodes (28): JobRequirementRelations, anniversary(), beforeMonth, bound, calendarBands, calendarYearDayBand(), compare(), DateParts (+20 more)

### Community 52 - "owned-ai-budget-export"
Cohesion: 0.09
Nodes (27): action, attempt, binding(), cost(), event, fail(), integer, label (+19 more)

### Community 53 - "extraction-benchmark"
Cohesion: 0.11
Nodes (26): aggregate(), digest(), distance(), document, evaluateExtractionDocument(), ExtractionBenchmarkAdapter, ExtractionManifest, extractionManifestLock() (+18 more)

### Community 54 - "initial-feedback-contract"
Cohesion: 0.07
Nodes (27): bullet, category, compatibility, compatibleCategory, compatibleTip, failureReason, index, INITIAL_FEEDBACK_CATEGORIES (+19 more)

### Community 55 - "iso-datetime"
Cohesion: 0.12
Nodes (24): SqlCompatibleIsoDateTimeSchema, LocalJobRelations, ProposalSchema, proposeJobRequirements(), RequirementProposalAdapter, deriveReviewedSkillSections(), escaped(), ExactJobSpan (+16 more)

### Community 56 - "ai-budget-source"
Cohesion: 0.12
Nodes (24): AiBudgetCallerSourceSchema, AiBudgetSource, AiBudgetSourceOptions, AiBudgetSourceProfile, AiBudgetSourceProfileSchema, AiBudgetSourceProfileSelection, AiBudgetSourceReadinessSchema, AiBudgetSourceRpcClient (+16 more)

### Community 57 - "server/build-assist"
Cohesion: 0.16
Nodes (21): BuildAssistCode, BuildAssistError, BuildAssistTransportInput, BuildAssistTransportResult, BuildSuggestionSchema, executeBuildAssist(), messages, OpenAIBuildAssistTransport (+13 more)

### Community 58 - "canonical-entry-regroup"
Cohesion: 0.11
Nodes (25): CanonicalCorrectionProjectionInput, CanonicalCorrectionSourceChoice, boundedIntent(), CanonicalEntryRegroupGroup, CanonicalEntryRegroupIntent, CanonicalEntryRegroupMember, CanonicalEntryRegroupReason, CanonicalEntryRegroupRetiredMapping (+17 more)

### Community 59 - "canonical-rewrite-ai"
Cohesion: 0.14
Nodes (22): CANONICAL_REWRITE_INSTRUCTIONS, canonicalRewritePayload(), canonicalRewriteProviderKey(), CanonicalRewriteTransport, createCanonicalRewriteTransport(), requestCanonicalRewrite(), CANONICAL_REWRITE_PROMPT_VERSION, CanonicalRewritePlanSchema (+14 more)

### Community 60 - "extraction-stage"
Cohesion: 0.11
Nodes (21): extractBoundedInput(), ExtractionFailureCode, extractionFailureStatus(), ExtractionStageFailure, extractPdfForAnalysis(), OcrRequiredError, PdfLayerExtractor, resolveExtraction() (+13 more)

### Community 61 - "owned-legacy-ai-usage-profile"
Cohesion: 0.09
Nodes (24): OWNED_LEGACY_AI_USAGE_PROFILE, AdmissionCleanupClaimSchema, AdmissionRetirementCaptureSchema, AdoptedDeletionObject, AiBudgetExportMetadataSchema, CanonicalExportSchema, CanonicalRewriteExportSchema, ClaimedPrivacyRequestSchema (+16 more)

### Community 62 - "ATS"
Cohesion: 0.13
Nodes (15): ATS(), ATSProps, Suggestion, Heatmap(), ResumeWriter(), failureMessages, RewriteGenerator(), SavedScoreContext() (+7 more)

### Community 63 - "StageTimeline"
Cohesion: 0.10
Nodes (20): activeStageByStatus, formatUpdatedAt(), stages, StageTimeline(), AnalysisStatus, AnalysisStatuses, transitions, AnalysisProgress() (+12 more)

### Community 64 - "layout-read-model"
Cohesion: 0.17
Nodes (20): deletionVerificationIntent, getDeletionVerification(), readOwnedNativeLayout(), cancelDataRequest(), createDataRequest(), readCandidatePrivacyAccess(), getPersonalOrganizationId(), privacyMutationFailure() (+12 more)

### Community 65 - "grouped-import-commands"
Cohesion: 0.11
Nodes (25): atomsFor(), bindingShape, boundedRecord(), expectedSchema, expectedShape, flags, GroupedOriginalCommandNormalization, GroupedOriginalCommandPreparation (+17 more)

### Community 66 - "job-aliases"
Cohesion: 0.12
Nodes (23): discoverJobAliasMentions(), JOB_ALIAS_LEXICON_SHA256, JOB_ALIAS_POLICY_VERSION, JobAliasMapping, JobAliasMention, lexicon, resolveJobAlias(), Bound (+15 more)

### Community 67 - "document-page-count-readiness-profile"
Cohesion: 0.10
Nodes (19): DOCUMENT_PAGE_COUNT_READINESS_PROFILE, INITIAL_FEEDBACK_CAPABILITIES, INITIAL_FEEDBACK_PROFILE, INITIAL_FEEDBACK_PROFILES, INITIAL_FEEDBACK_REGROUP_PROFILE, OWNED_AI_RETIREMENT_PROFILE, LegacyScoringInputProfileSchema, OwnedAiBudgetExportReadinessSchema (+11 more)

### Community 68 - "jd-clause-order-writer-scope"
Cohesion: 0.14
Nodes (21): JdClauseOrderDraftSchema, assertJdClauseOrderWriterScope(), closed(), contribution, fail(), folds, forbidden, forbiddenWord() (+13 more)

### Community 69 - "jd-clause-order-decisions"
Cohesion: 0.11
Nodes (21): binding, citation, citations, clauseOrderCommandSha256(), digest, encodeClauseOrderCommandAtoms(), JdClauseOrderDraftView, JdClauseOrderDraftViewSchema (+13 more)

### Community 70 - "jd-clause-order-http"
Cohesion: 0.15
Nodes (21): JdClauseOrderHttpSuccessSchema, JdClauseOrderReceiptSchema, JdClauseOrderUndoReceiptSchema, BodyBudget, bodyBudget(), boundedBytes(), boundedUndo(), canonicalUuid (+13 more)

### Community 71 - "canonical-grouped-import"
Cohesion: 0.11
Nodes (22): AssociationReceipt, bindingSchema, citation, Entry, Fact, factKey(), fail(), GROUPED_ORIGINAL_PRODUCER_VERSION (+14 more)

### Community 72 - "evaluation-claims"
Cohesion: 0.10
Nodes (22): assessEvaluationClaim(), bindings, cell, claim, digest(), EVALUATION_CLAIMS, EvaluationClaimAuthority, EvaluationClaimCard (+14 more)

### Community 73 - "evidence-review"
Cohesion: 0.17
Nodes (21): attemptSchema, checkReadSignal(), correctEvidenceReview(), correctionSchema, EvidenceCorrectionInput, EvidenceCorrectionInputSchema, EvidenceHistoryAttestation, EvidenceHistoryAttestationSchema (+13 more)

### Community 74 - "owned-ai-retirement-export"
Cohesion: 0.11
Nodes (20): bounded(), brand, captures, id, metadata, OwnedAiRetirementExportClient, OwnedAiRetirementExportError, OwnedAiRetirementExportSchema (+12 more)

### Community 75 - "pilot-workflow"
Cohesion: 0.09
Nodes (22): actorSchema, adapterResult, base, commandSchema, contextSchema, Event, hash, id (+14 more)

### Community 76 - "artifact-repository"
Cohesion: 0.24
Nodes (16): buildOwnedRenderPlan(), checkSourceLinks(), Client, loadArtifactPreview(), readArtifactForm(), renderOwnedArtifact(), artifactError(), artifactIdentity() (+8 more)

### Community 77 - "document-evidence"
Cohesion: 0.10
Nodes (20): assertion, blockers, box, confidence, ContextSchema, DocumentEvidenceContext, DocumentEvidenceSchema, failure (+12 more)

### Community 78 - "evaluation-runner"
Cohesion: 0.13
Nodes (21): compare(), digest(), proposeEvaluationCalibration(), EvaluationPartitionLock, readEvaluationPartitionLabels(), verifyEvaluationPartitionLock(), calibrationSchema, clusterIds() (+13 more)

### Community 79 - "job-domain"
Cohesion: 0.11
Nodes (14): ConceptSchema, FIRST_DOMAIN_PACK, mapTaxonomy(), MarketDatasetSchema, TaxonomyRegistry, TaxonomyRelease, TaxonomySchema, benchmarkJobIntelligence() (+6 more)

### Community 80 - "owned-ai-disposition-export"
Cohesion: 0.15
Nodes (19): account, bounded(), envelope, fail(), id, micros(), operation, OwnedAiDispositionExport (+11 more)

### Community 81 - "TelemetryReporter"
Cohesion: 0.15
Nodes (12): send(), TelemetryPayload, TelemetryReporter(), responseSecurity(), createSecurityHeaders(), CspMode, isSameOriginRequest(), createThemeBootstrapScript() (+4 more)

### Community 82 - "CanonicalRewritePanel"
Cohesion: 0.11
Nodes (20): Attempt, AttemptOutcome, CurrentSelection, Initialization, newRequest(), reasons, RequestMetadata, rewriteFailureMessages (+12 more)

### Community 83 - "JdClauseOrderBridge"
Cohesion: 0.15
Nodes (19): Accepted, JdClauseOrderBridgeProps, Source, Undo, JdClauseOrderDecisionReview(), submit(), JdClauseOrderDecisionReviewProps, proposalScope() (+11 more)

### Community 84 - "evaluation-partitions"
Cohesion: 0.10
Nodes (18): AccessAudit, accessSchema, clusterKeys, createEvaluationPartitionLock(), DeepReadonly, employerSchema, freeze(), groups (+10 more)

### Community 85 - "evaluation-statistics"
Cohesion: 0.14
Nodes (20): compare(), digest(), evaluateStatistics(), EvaluationMetricObservation, EvaluationMetricPolicy, evaluationMetricPolicySchema, EvaluationStatistics, EvaluationStatisticsInput (+12 more)

### Community 86 - "pilot-evidence"
Cohesion: 0.10
Nodes (20): measuredAt, observation, opaque, optionalReference, PILOT_METRICS, PILOT_OPERATIONS, PILOT_ROLES, PilotAssessment (+12 more)

### Community 87 - "native-evidence"
Cohesion: 0.13
Nodes (17): NativeLayoutSchema, NativeEvidence, NativeEvidenceSchema, offset, reference, adaptNativeEvidenceV2(), containsUnknownKeys(), ContextSchema (+9 more)

### Community 88 - "evaluation-annotation"
Cohesion: 0.12
Nodes (19): agreement(), AnnotationAssessment, AnnotationAuthority, AnnotationEligibilityBinding, AnnotationEvidence, annotationEvidenceSchema, AnnotationReason, annotator (+11 more)

### Community 89 - "owned-ai-usage"
Cohesion: 0.14
Nodes (17): InitialFeedbackUsageReply, InitialFeedbackUsageReplySchema, id, nextMonth(), owned, OwnedAiUsage, OwnedAiUsageClient, OwnedAiUsageError (+9 more)

### Community 90 - "privacy-operations"
Cohesion: 0.14
Nodes (15): buildExportManifest(), retentionCutoff(), bounded(), Code, createRetentionObjectRemover(), Deadline, messages, Reply (+7 more)

### Community 91 - "analysis.canonical"
Cohesion: 0.16
Nodes (16): CanonicalEntryRegroupFeedback, CanonicalEntryRegroupCommand, CanonicalCommand, readCanonicalForm(), Args, CanonicalResume(), CanonicalReviewAcknowledgement(), enabled() (+8 more)

### Community 92 - "CitedWritingSuggestions"
Cohesion: 0.17
Nodes (16): categories, CitedWritingSuggestions(), WritingFeedback, WritingTip, ClassifiedTip, FeedbackProvenance, feedbackProvenanceMessage(), isFeedbackStrength() (+8 more)

### Community 93 - "JdRecommendations"
Cohesion: 0.13
Nodes (16): JdRecommendations(), observations, structures, buildJdRecommendations(), digest, itemSchema, JdRecommendationPlan, JdRecommendationPlanSchema (+8 more)

### Community 94 - "build-assist-support"
Cohesion: 0.13
Nodes (18): BUILD_AI_LIMITS, assessBuildFactualSupport(), BUILD_FACT_SUPPORT_POLICY, BuildFactualSupport, canonical(), declarations, environments, guidance (+10 more)

### Community 95 - "analysis.evidence"
Cohesion: 0.15
Nodes (16): action(), AnalysisEvidence(), Args, associationReasonLabels, EntryCandidate(), ExistingEntryGroup, extractionBlockerLabels, loader() (+8 more)

### Community 96 - "canonical-rewrite-readiness-profile"
Cohesion: 0.16
Nodes (15): CANONICAL_REWRITE_READINESS_PROFILE, CANONICAL_REWRITE_READINESS_PROFILES, CANONICAL_REWRITE_REGROUP_READINESS_PROFILE, CanonicalRewriteUsage, CanonicalRewriteUsageClient, CanonicalRewriteUsageSchema, count, month (+7 more)

### Community 97 - "evidence-fields"
Cohesion: 0.20
Nodes (17): companyHeader(), credentialTitle(), EvidenceFieldCandidate, extractEvidenceFields(), FIELD_LABELS, FieldSourceSpan, LABEL_PATTERN, MIXED_OCR_FIELD_PROFILE (+9 more)

### Community 98 - "jd-clause-order-readiness"
Cohesion: 0.12
Nodes (16): bounded(), digest, hashFields, JdClauseOrderReadiness, JdClauseOrderReadinessClient, JdClauseOrderReadinessOptions, JdClauseOrderReadinessProfile, JdClauseOrderReadinessProfileSchema (+8 more)

### Community 99 - "Accordion"
Cohesion: 0.21
Nodes (15): Accordion(), AccordionContent(), AccordionContentProps, AccordionContext, AccordionContextType, AccordionHeader(), AccordionHeaderProps, AccordionItem() (+7 more)

### Community 100 - "NativeLayoutEvidence"
Cohesion: 0.22
Nodes (13): NativeLayoutEvidence(), warningText, NativeStructureEvidence(), LayoutBoxSchema, LayoutPage, layoutTextGroups(), bounds(), Box (+5 more)

### Community 101 - "owned-legacy-ai-usage-export"
Cohesion: 0.16
Nodes (15): counter, envelope, id, OwnedLegacyAiUsageExport, OwnedLegacyAiUsageExportError, ownedLegacyAiUsageMicros(), OwnedLegacyAiUsageProfile, OwnedLegacyAiUsageProfileSchema (+7 more)

### Community 102 - "typed-authoring-readiness"
Cohesion: 0.12
Nodes (15): assertTypedAuthoringReady(), bounded(), digest, hashFields, optionsSchema, profileFields, ReadRequest, ReadResult (+7 more)

### Community 103 - "ClientOnly"
Cohesion: 0.19
Nodes (8): ClientOnlyProps, ResumeCard(), ScoreCircle(), convertPdfToImage(), convertPdfToImages(), loadPdfJs(), PdfConversionResult, renderPage()

### Community 104 - "privacy-deletion"
Cohesion: 0.15
Nodes (11): INACTIVE_DELETION_STATUSES, isBlockingDeletionRequest(), OwnedAiDispositionReadinessSchema, OWNED_AI_DISPOSITION_PROFILE, OWNED_AI_DISPOSITION_REGROUP_PROFILE, access, CandidatePrivacyAccess, owner (+3 more)

### Community 105 - "evaluation-calibration"
Cohesion: 0.12
Nodes (15): CalibrationAuthority, CalibrationCandidate, CalibrationObservation, CalibrationProposal, CalibrationReason, CandidateResult, candidateSchema, id (+7 more)

### Community 106 - "schema"
Cohesion: 0.12
Nodes (15): AnalysisResultSchema, AnalysisResultZod, ATSCategory, ATSDimensionalTips, CategoryWithExplanation, ParseViewSchema, ParseViewZod, QualitativeAnalysisSchema (+7 more)

### Community 107 - "createInitialFeedbackOperation"
Cohesion: 0.24
Nodes (14): createInitialFeedbackOperationRepository(), bounded(), correlate(), ready(), decode(), InitialFeedbackOperationError, ownCode(), sameOperation() (+6 more)

### Community 108 - "local-review-admission"
Cohesion: 0.16
Nodes (14): binding, Binding, Denial, deny(), grantRecord, hash, imageId, policyId (+6 more)

### Community 109 - "boundedText()"
Cohesion: 0.33
Nodes (14): boundedText(), CanonicalRewritePanel(), digest(), inspectResponse(), isoTimestamp(), keys(), postRewrite(), publicationMatches() (+6 more)

### Community 110 - "owned-ai-expiry"
Cohesion: 0.20
Nodes (11): count, OwnedAiExpiryError, OwnedAiExpiryProfile, OwnedAiExpiryProfileSchema, OwnedAiExpiryReadinessSchema, OwnedAiExpirySweep, OwnedAiExpirySweepSchema, sha (+3 more)

### Community 111 - "layout"
Cohesion: 0.23
Nodes (12): fieldSection(), localEmploymentHeading(), lineHasContactSignal(), hasRepeatedSectionType(), parseLayoutWarnings(), splitColumns(), ALIAS_TO_TYPE, DetectedSection (+4 more)

### Community 112 - "contact"
Cohesion: 0.25
Nodes (13): phoneFromLine(), COUNTRY_NAMES, detectLocation(), detectName(), findPhone(), isLocationCandidate(), isPlausiblePhone(), NAME_PARTICLES (+5 more)

### Community 113 - "JdClauseOrderBridge()"
Cohesion: 0.28
Nodes (12): JdClauseOrderBridge(), decide(), knownError(), post(), activeRequest(), undo(), unavailable(), JdClauseOrderProposalSchema (+4 more)

### Community 114 - "ParseView"
Cohesion: 0.21
Nodes (11): Field(), ParseView(), savedTextReasonLabels, Severity, NativeLayout, base, inspectPageText(), PAGE_TEXT_AVAILABILITY_UNITS (+3 more)

### Community 115 - "ThemeControl"
Cohesion: 0.31
Nodes (11): ThemeControl(), themeLabels, applyThemePreference(), normalizeThemePreference(), readThemePreference(), ResolvedTheme, resolveThemePreference(), storeThemePreference() (+3 more)

### Community 116 - "ExportManifest"
Cohesion: 0.26
Nodes (5): ExportManifest, PrivacyRequestRepository, processPrivacyRequest(), runPrivacyWorkerCycle(), runPrivacyWorkerLoop()

### Community 117 - "initial-feedback-consumer"
Cohesion: 0.27
Nodes (8): empty(), isInitialFeedbackConsumerAccessDenied(), loadInitialFeedbackConsumer(), projectInitialFeedbackConsumer(), InitialFeedbackOperationClient, createInitialFeedbackPublicationReader(), InitialFeedbackPublicationReadScope, FeedbackSchema

### Community 118 - "parseSim"
Cohesion: 0.33
Nodes (8): buildPageTexts(), parseSim(), countBullets(), isBulletLine(), dateRangePattern(), extractDateStrings(), MONTH_NAMES, parseSections()

### Community 119 - "AdmissionCleanupDeferred"
Cohesion: 0.33
Nodes (3): AdmissionCleanupDeferred, isAdmissionRetirementHold(), SupabasePrivacyRequestRepository

### Community 120 - "claimItems()"
Cohesion: 0.31
Nodes (4): claimItems(), RetentionError, RetentionRpcClient, SupabaseRetentionRepository

### Community 121 - "RequirementCoverageReview"
Cohesion: 0.24
Nodes (9): Available, DurationObservation(), observationLabels, Operand, RequirementCoverageReview(), tierLabels, Witness, WitnessReview() (+1 more)

### Community 122 - "canonical-resume-schema"
Cohesion: 0.20
Nodes (9): bullet, CanonicalResumeDraftSchema, citation, confirmation, entry, fact, id, section (+1 more)

### Community 123 - "analysis.rewrite.workspace"
Cohesion: 0.24
Nodes (8): canonicalRewriteWorkspaceAction(), canonicalRewriteWorkspacePrivateHeaders(), FormError, readCanonicalRewriteWorkspaceSelection(), release(), unlock(), action(), loader()

### Community 124 - "paddle-admission"
Cohesion: 0.25
Nodes (7): createPaddleOcrAdmissionStore(), PaddleOcrBudget, RpcClient, RpcResult, validBudget(), PaddleOcrAdmissionRequest, PaddleOcrAttempt

### Community 125 - "assessPilotEvidence()"
Cohesion: 0.25
Nodes (8): assessPilotEvidence(), digest(), hashPilotEvidence(), hashPilotProtocol(), stable(), createPilotWorkflow(), digest(), stable()

### Community 126 - "job-relation-unicode"
Cohesion: 0.25
Nodes (7): data, freeze(), JOB_RELATION_UNICODE_PROFILE, JOB_RELATION_UNICODE_SHA256, JobRelationUnicodeRuntime, Ranges, UnicodeData

### Community 127 - "result-cache"
Cohesion: 0.32
Nodes (5): cacheAnalysisResult(), CachedResult, removeExpiredResults(), results, setCachedAnalysisResult()

### Community 128 - "JdClauseOrderReview"
Cohesion: 0.33
Nodes (6): JdClauseOrderPlanReview(), JdClauseOrderReview(), JdClauseOrderDraft, JdClauseOrderPlan, ScoreDiagnostics(), words()

### Community 129 - "authorization"
Cohesion: 0.33
Nodes (6): canAccessOrganization(), hasOrganizationAccess(), MembershipRole, MembershipRoles, OrganizationAction, permissions

### Community 130 - "bad()"
Cohesion: 0.38
Nodes (6): bad(), decoded(), InitialFeedbackContractError, validateInitialFeedbackContext(), validateInitialFeedbackReadiness(), validateInitialFeedbackUsage()

### Community 131 - "score-v2-validity-metrics"
Cohesion: 0.48
Nodes (6): measureScoreAgreement(), pairs, ranks(), Row, spearman(), summary()

### Community 132 - "ResultTabs"
Cohesion: 0.47
Nodes (5): isResultTabId(), readTabFromHash(), ResultTabId, ResultTabs(), tabDefinitions

### Community 133 - "ScoreAdmissionNotice"
Cohesion: 0.33
Nodes (5): candidateChecks, explanations, ScoreAdmissionNotice(), ScoreAdmissionNoticeProps, serviceChecks

### Community 134 - "ScoreBadge"
Cohesion: 0.53
Nodes (4): ScoreBadge(), ScoreBadgeProps, ScoreBand, scoreBand()

### Community 135 - "backup-restore"
Cohesion: 0.47
Nodes (5): BackupManifest, BackupRecord, checksum(), createBackupManifest(), verifyRestoredSnapshot()

### Community 136 - "correction-command-codec"
Cohesion: 0.47
Nodes (5): assertPostgresText(), CORRECTION_COMMAND_CODEC_VERSION, encodeCorrectionCommandAtoms(), hashCorrectionCommandAtoms(), HEADER

### Community 137 - "phase5-thresholds"
Cohesion: 0.40
Nodes (3): Phase5BenchmarkReport, Phase5ThresholdMinimums, Phase5Thresholds

### Community 138 - "canonical-rewrite-workspace-profile"
Cohesion: 0.50
Nodes (3): CANONICAL_REWRITE_REGROUP_WORKSPACE_PROFILE, CANONICAL_REWRITE_WORKSPACE_PROFILE, CANONICAL_REWRITE_WORKSPACE_PROFILES

### Community 139 - "InitialFeedbackContext"
Cohesion: 0.50
Nodes (4): InitialFeedbackContext, InitialFeedbackProfileSelection, InitialFeedbackOperationScope, InitialFeedbackServiceOptions

### Community 140 - "load-scenario"
Cohesion: 0.67
Nodes (3): createSyntheticLoadReport(), LoadReport, percentile()

## Knowledge Gaps
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createSupabaseAdminClient()` connect `layout-read-model` to `LaTeX PDF Preview`, `Job Queue & Leasing`, `AI Budget`, `Clarification & Authoring Forms`, `Analyze & AI Budget Sources`, `Analyze Request & Errors`, `Analysis Ingestion`, `Grouped Original Import Review`, `Auth & Deletion Verification`, `Brand & 3D Evidence Scene`, `Authoring Contract`, `Analysis Stage Fence`, `Canonical Content`, `Entry Regroup Repository`, `requirement-relationship-context`, `canonical-rewrite-workspace`, `server/build-assist`, `canonical-rewrite-ai`, `extraction-stage`, `owned-legacy-ai-usage-profile`, `ATS`, `StageTimeline`, `document-page-count-readiness-profile`, `evidence-review`, `artifact-repository`, `privacy-operations`, `analysis.canonical`, `JdRecommendations`, `analysis.evidence`, `AdmissionCleanupDeferred`, `claimItems()`, `analysis.rewrite.workspace`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._
- **Should `LaTeX PDF Preview` be split into smaller, more focused modules?**
  _Cohesion score 0.0554954954954955 - nodes in this community are weakly interconnected._
- **Why does `getServerConfig()` connect `Analysis Ingestion` to `LaTeX PDF Preview`, `AI Budget`, `Canonical Rewrite Contract`, `Clarification & Authoring Forms`, `Analyze & AI Budget Sources`, `Analyze Request & Errors`, `Grouped Original Import Review`, `Auth & Deletion Verification`, `Canonical Content`, `Entry Regroup Repository`, `File Uploader & Config`, `canonical-rewrite-workspace`, `server/build-assist`, `canonical-rewrite-ai`, `owned-legacy-ai-usage-profile`, `layout-read-model`, `artifact-repository`, `TelemetryReporter`, `analysis.canonical`, `analysis.evidence`, `analysis.rewrite.workspace`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Should `Typed Authoring Codec` be split into smaller, more focused modules?**
  _Cohesion score 0.051643192488262914 - nodes in this community are weakly interconnected._
- **Should `Job Queue & Leasing` be split into smaller, more focused modules?**
  _Cohesion score 0.05357142857142857 - nodes in this community are weakly interconnected._
- **Should `Requirement Relationships` be split into smaller, more focused modules?**
  _Cohesion score 0.04576271186440678 - nodes in this community are weakly interconnected._
- **Should `Restore Admission` be split into smaller, more focused modules?**
  _Cohesion score 0.09117475160724722 - nodes in this community are weakly interconnected._