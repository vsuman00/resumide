import { useCallback, useEffect, useRef, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { formatSize } from "~/lib/utils";
import { takePendingUpload } from "~/lib/pending-upload";
import EvidenceScene3D from "~/components/EvidenceScene3D";

const WORD_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

interface FileUploaderProps {
  maxUploadBytes: number;
  onFileSelect: (file: File | null) => void;
  onValidationError?: (message: string) => void;
}

const FileUploader = ({
  maxUploadBytes,
  onFileSelect,
  onValidationError,
}: FileUploaderProps) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fromBuild, setFromBuild] = useState(false);
  const mountProps = useRef({ onFileSelect, maxUploadBytes });
  // A PDF compiled in Build arrives preselected once; the user still submits it.
  useEffect(() => {
    const file = takePendingUpload();
    const { onFileSelect: select, maxUploadBytes: limit } = mountProps.current;
    if (!file || file.type !== "application/pdf" || file.size > limit) return;
    setSelectedFile(file);
    setFromBuild(true);
    select(file);
  }, []);
  const onDrop = useCallback(
    <T extends File>(
      acceptedFiles: T[],
      fileRejections: readonly FileRejection[],
    ) => {
      const rejection = fileRejections[0];
      if (rejection) {
        setSelectedFile(null);
        onFileSelect(null);
        onValidationError?.(
          rejection.errors[0]?.message ??
            "Please select a valid PDF or Word (.docx) file.",
        );
        return;
      }

      onValidationError?.("");
      setFromBuild(false);
      const nextFile = acceptedFiles[0] ?? null;
      setSelectedFile(nextFile);
      onFileSelect(nextFile);
    },
    [onFileSelect, onValidationError],
  );

  const { getRootProps, getInputProps, inputRef, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: { "application/pdf": [".pdf"], [WORD_TYPE]: [".docx"] },
    maxSize: maxUploadBytes,
  });

  return (
    <div className="file-dropzone-shell">
      <div
        {...getRootProps({
          className: `file-dropzone${isDragActive ? " is-drag-active" : ""}${selectedFile ? " has-file" : ""}`,
        })}
      >
        <input
          {...getInputProps({
            "aria-label": "Upload resume file (PDF or Word)",
          })}
        />
        {selectedFile ? (
          <div
            className="file-dropzone-selected"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="file-type-mark" aria-hidden="true">
              {selectedFile.type === WORD_TYPE ? "DOC" : "PDF"}
            </span>
            <div className="file-dropzone-file-details">
              <p>{selectedFile.name}</p>
              <span>
                {formatSize(selectedFile.size)}{" "}
                {selectedFile.type === WORD_TYPE ? "Word" : "PDF"}
                {fromBuild && (
                  <span className="file-from-build"> · From Build</span>
                )}
              </span>
            </div>
            <div className="file-dropzone-actions">
              <button
                type="button"
                className="file-dropzone-replace"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  inputRef.current?.click();
                }}
              >
                Replace
              </button>
              <button
                type="button"
                className="file-dropzone-remove"
                aria-label="Remove selected resume"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setSelectedFile(null);
                  setFromBuild(false);
                  if (inputRef.current) inputRef.current.value = "";
                  onFileSelect(null);
                  onValidationError?.("");
                }}
              >
                <img src="/icons/cross.svg" alt="" />
              </button>
            </div>
          </div>
        ) : (
          <div className="file-dropzone-empty">
            <EvidenceScene3D
              variant="upload"
              active={isDragActive}
              compact
              className="upload-drop-scene"
            />
            <p>
              <strong>
                {isDragActive
                  ? "Drop your resume here"
                  : "Choose a PDF or Word file"}
              </strong>
              <span> or drag and drop it into the tray</span>
            </p>
            <span className="file-dropzone-meta">
              PDF or Word (.docx), up to {formatSize(maxUploadBytes)}.
              Text-based files work best.
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default FileUploader;
