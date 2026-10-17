import { type FormEvent, useRef, useState } from "react";
import FileUploader from "~/components/FileUploader";
import WorkspaceShell from "~/components/WorkspaceShell";
import { useAnalysisStore } from "~/lib/store";
import { formatSize, generateUUID } from "~/lib/utils";
import { useLoaderData, useNavigate } from "react-router";
import { getUploadConfig } from "~/lib/server/config";

export function loader() {
  const config = getUploadConfig();
  return {
    maxUploadBytes: config.MAX_UPLOAD_BYTES,
    maxJobTitleCharacters: config.MAX_JOB_TITLE_CHARACTERS,
    maxJobDescriptionCharacters: config.MAX_JOB_DESCRIPTION_CHARACTERS,
  };
}

export function meta() {
  return [
    { title: "Resumide | Upload" },
    {
      name: "description",
      content: "Upload a resume for ATS compatibility guidance.",
    },
  ];
}

const Upload = () => {
  const limits = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const setEntry = useAnalysisStore((state) => state.set);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [consentError, setConsentError] = useState("");
  const [hasConsent, setHasConsent] = useState(false);
  const [jobTitle, setJobTitle] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const requestController = useRef<AbortController | null>(null);
  const idempotencyKey = useRef(generateUUID());
  const hasJobContext = Boolean(jobTitle.trim() || jobDescription.trim());
  const fileIsWithinLimit = Boolean(file && file.size <= limits.maxUploadBytes);
  const canSubmit = Boolean(fileIsWithinLimit && hasConsent && !isProcessing);

  const handleFileSelect = (selectedFile: File | null) => {
    setFile(selectedFile);
    if (selectedFile) {
      setFileError("");
      setStatusText("");
    }
  };

  const handleFileValidationError = (message: string) => {
    setFileError(message);
    if (message) setStatusText("");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isProcessing) return;

    if (!file) {
      setFileError("Choose a PDF resume before analyzing.");
      return;
    }
    if (file.type !== "application/pdf") {
      setFileError("Upload a PDF file to continue.");
      return;
    }
    if (file.size > limits.maxUploadBytes) {
      setFileError(
        `The PDF is too large. Maximum size is ${limits.maxUploadBytes / 1024 / 1024} MB.`,
      );
      return;
    }
    if (!hasConsent) {
      setConsentError("Confirm AI-assisted feedback to continue.");
      return;
    }

    setIsProcessing(true);
    setStatusText("Uploading and analyzing...");
    const controller = new AbortController();
    requestController.current = controller;

    try {
      const apiForm = new FormData();
      apiForm.append("file", file);
      apiForm.append("jobTitle", jobTitle);
      apiForm.append("jobDescription", jobDescription);
      apiForm.append("idempotencyKey", idempotencyKey.current);
      apiForm.append("aiConsent", "accepted");

      const response = await fetch("/api/analyze", {
        method: "POST",
        body: apiForm,
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          typeof payload?.error === "object"
            ? payload.error.message
            : payload?.error;
        throw new Error(message || `Request failed (${response.status})`);
      }

      const id = typeof payload?.id === "string" ? payload.id : generateUUID();
      if (payload?.result) {
        setEntry(id, {
          id,
          jobTitle,
          jobDescription,
          pdf: file,
          result: payload.result,
        });
        setStatusText("Analysis complete, redirecting...");
        navigate(`/resume/${id}`);
      } else {
        setStatusText("Upload accepted, opening analysis progress...");
        navigate(`/analysis/${id}`);
      }
    } catch (error) {
      setIsProcessing(false);
      setStatusText(
        error instanceof DOMException && error.name === "AbortError"
          ? "Upload stopped in this browser. The server may have received your file. Check Analyses for its status."
          : error instanceof TypeError || navigator.onLine === false
            ? "You appear to be offline. Check your connection and try again."
            : error instanceof Error
              ? error.message
              : "Unable to analyze the resume right now.",
      );
    } finally {
      requestController.current = null;
    }
  };

  return (
    <WorkspaceShell
      eyebrow="Step 1 of 2"
      title="Prepare a new analysis"
      description="Add your resume and optional job context. You will review the evidence before making changes."
    >
      <section className="main-section workspace-upload-section">
        <form
          id="upload-form"
          onSubmit={handleSubmit}
          className="upload-form"
          noValidate
        >
          <div className="analysis-prep-grid">
            <div className="upload-form-sections">
              <fieldset className="upload-fieldset">
                <legend>Resume PDF</legend>
                <p className="upload-fieldset-intro">
                  Start with the original document. Resumide will preserve it as
                  the source layer for the evidence review.
                </p>
                <FileUploader
                  maxUploadBytes={limits.maxUploadBytes}
                  onFileSelect={handleFileSelect}
                  onValidationError={handleFileValidationError}
                />
                {fileError ? (
                  <p
                    id="resume-file-error"
                    className="field-error"
                    role="alert"
                  >
                    {fileError}
                  </p>
                ) : null}
              </fieldset>

              <fieldset className="upload-fieldset upload-job-context">
                <legend>
                  Target job <span>(optional)</span>
                </legend>
                <p className="upload-fieldset-intro">
                  Job context makes keyword and relevance feedback more useful.
                </p>
                <div className="form-div">
                  <label htmlFor="job-title">Job title</label>
                  <input
                    type="text"
                    name="job-title"
                    placeholder="Senior product designer"
                    id="job-title"
                    maxLength={limits.maxJobTitleCharacters}
                    value={jobTitle}
                    onChange={(event) => setJobTitle(event.target.value)}
                  />
                </div>
                <div className="form-div">
                  <label htmlFor="job-description">Job description</label>
                  <textarea
                    rows={6}
                    name="job-description"
                    placeholder="Paste the responsibilities, requirements, and skills from the role."
                    id="job-description"
                    maxLength={limits.maxJobDescriptionCharacters}
                    value={jobDescription}
                    onChange={(event) => setJobDescription(event.target.value)}
                  />
                  {jobDescription.length >
                  limits.maxJobDescriptionCharacters * 0.8 ? (
                    <span className="field-character-count">
                      {jobDescription.length} /{" "}
                      {limits.maxJobDescriptionCharacters}
                    </span>
                  ) : null}
                </div>
              </fieldset>

              <section
                className="upload-consent"
                aria-labelledby="ai-consent-heading"
              >
                <div>
                  <h2 id="ai-consent-heading">AI-assisted feedback</h2>
                  <p>
                    Resume text is sent to the configured AI provider only to
                    generate qualitative suggestions. Deterministic ATS evidence
                    remains available if that step is unavailable.
                  </p>
                </div>
                <label className="upload-consent-control">
                  <input
                    type="checkbox"
                    name="ai-consent"
                    checked={hasConsent}
                    aria-describedby={
                      consentError ? "ai-consent-error" : undefined
                    }
                    aria-invalid={Boolean(consentError)}
                    onChange={(event) => {
                      setHasConsent(event.target.checked);
                      if (event.target.checked) setConsentError("");
                    }}
                  />
                  <span>
                    I consent to AI-assisted feedback for this resume.
                  </span>
                </label>
                {consentError ? (
                  <p id="ai-consent-error" className="field-error" role="alert">
                    {consentError}
                  </p>
                ) : null}
              </section>
            </div>

            <aside
              className="analysis-readiness-panel"
              aria-labelledby="readiness-heading"
            >
              <div>
                <p className="workspace-eyebrow">Before you begin</p>
                <h2 id="readiness-heading">Analysis readiness</h2>
              </div>
              <ul className="readiness-list">
                <li className={file ? "is-ready" : ""}>
                  <span className="readiness-indicator" aria-hidden="true" />
                  <span>
                    <strong>
                      {file ? "PDF selected" : "Add a resume PDF"}
                    </strong>
                    <small>
                      {file ? file.name : "Required to start analysis"}
                    </small>
                  </span>
                </li>
                <li className={fileIsWithinLimit ? "is-ready" : ""}>
                  <span className="readiness-indicator" aria-hidden="true" />
                  <span>
                    <strong>Size within limit</strong>
                    <small>
                      {file
                        ? `${formatSize(file.size)} of ${formatSize(limits.maxUploadBytes)}`
                        : `Maximum ${formatSize(limits.maxUploadBytes)}`}
                    </small>
                  </span>
                </li>
                <li
                  className={
                    hasJobContext ? "is-ready is-optional" : "is-optional"
                  }
                >
                  <span className="readiness-indicator" aria-hidden="true" />
                  <span>
                    <strong>
                      {hasJobContext
                        ? "Job context added"
                        : "Job context is optional"}
                    </strong>
                    <small>Helps match role-specific language</small>
                  </span>
                </li>
                <li className={hasConsent ? "is-ready" : ""}>
                  <span className="readiness-indicator" aria-hidden="true" />
                  <span>
                    <strong>
                      {hasConsent
                        ? "AI consent confirmed"
                        : "Confirm AI consent"}
                    </strong>
                    <small>Required for qualitative suggestions</small>
                  </span>
                </li>
              </ul>
              <div className="analysis-next-steps">
                <h3>What happens next</h3>
                <ol>
                  <li>Secure upload</li>
                  <li>Extract and parse</li>
                  <li>Score evidence</li>
                  <li>Save your result</li>
                </ol>
              </div>
            </aside>
          </div>

          {statusText ? (
            <p
              id="upload-status"
              className={`upload-status${isProcessing ? " is-processing" : " is-error"}`}
              role={isProcessing ? "status" : "alert"}
              aria-live="polite"
            >
              {statusText}
            </p>
          ) : null}

          <div className="upload-action-bar">
            <p>
              {file && hasConsent
                ? `Ready to analyze ${file.name}`
                : "Add a PDF and confirm AI consent to continue."}
            </p>
            <div>
              {isProcessing ? (
                <button
                  type="button"
                  className="back-button"
                  onClick={() => requestController.current?.abort()}
                >
                  Stop upload
                </button>
              ) : null}
              {!isProcessing && statusText ? (
                <button
                  type="button"
                  className="back-button"
                  onClick={() => {
                    setStatusText("");
                    setFileError("");
                  }}
                >
                  Try again
                </button>
              ) : null}
              <button
                className="primary-button upload-submit"
                type="submit"
                disabled={!canSubmit}
              >
                {isProcessing ? "Analyzing resume" : "Analyze resume"}
              </button>
            </div>
          </div>
        </form>
      </section>
    </WorkspaceShell>
  );
};

export default Upload;
