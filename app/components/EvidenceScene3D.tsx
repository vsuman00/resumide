import type { PointerEvent } from "react";

type SceneVariant =
  | "hero"
  | "workspace"
  | "upload"
  | "analysis"
  | "result"
  | "auth"
  | "privacy"
  | "error";

interface EvidenceScene3DProps {
  variant: SceneVariant;
  active?: boolean;
  compact?: boolean;
  className?: string;
  label?: string;
}

function updateTilt(event: PointerEvent<HTMLDivElement>) {
  if (event.pointerType === "touch") return;
  const rect = event.currentTarget.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width - 0.5;
  const y = (event.clientY - rect.top) / rect.height - 0.5;
  event.currentTarget.style.setProperty("--scene-rx", `${-y * 10}deg`);
  event.currentTarget.style.setProperty("--scene-ry", `${x * 13}deg`);
  event.currentTarget.style.setProperty("--scene-x", `${x * 10}px`);
  event.currentTarget.style.setProperty("--scene-y", `${y * 8}px`);
}

function resetTilt(event: PointerEvent<HTMLDivElement>) {
  for (const property of [
    "--scene-rx",
    "--scene-ry",
    "--scene-x",
    "--scene-y",
  ]) {
    event.currentTarget.style.removeProperty(property);
  }
}

const EvidenceScene3D = ({
  variant,
  active = false,
  compact = false,
  className = "",
  label,
}: EvidenceScene3DProps) => (
  <div
    className={`evidence-scene-3d is-${variant}${active ? " is-active" : ""}${compact ? " is-compact" : ""}${className ? ` ${className}` : ""}`}
    onPointerMove={updateTilt}
    onPointerLeave={resetTilt}
    aria-hidden={label ? undefined : true}
    role={label ? "img" : undefined}
    aria-label={label}
  >
    <div className="scene-glow" />
    <div className="scene-world">
      <span className="scene-orbit is-orbit-one" />
      <span className="scene-orbit is-orbit-two" />
      <span className="scene-plinth" />
      {variant === "upload" ? (
        <div className="scene-upload-object">
          <img src="/images/resume-upload-tray-3d.png" alt="" />
          <span className="scene-scan-beam" />
        </div>
      ) : (
        <div className="scene-document-stack">
          {(["source", "parse", "proof"] as const).map((layer) => (
            <span key={layer} className={`scene-document is-${layer}`}>
              <i />
              <i />
              <i />
            </span>
          ))}
        </div>
      )}
      {variant === "hero" ? <span className="scene-score-orb">92</span> : null}
      {variant === "workspace" ? <span className="scene-archive-slot" /> : null}
      {variant === "analysis" ? <span className="scene-scanner-ring" /> : null}
      {variant === "auth" ? (
        <span className="scene-lock">
          <i />
        </span>
      ) : null}
      {variant === "privacy" ? (
        <span className="scene-vault">
          <i />
        </span>
      ) : null}
      {variant === "error" ? (
        <>
          <span className="scene-route-line" />
          <span className="scene-question">?</span>
        </>
      ) : null}
      <span className="scene-chip is-chip-a">
        {
          {
            hero: "Source",
            workspace: "Saved",
            upload: "Private PDF",
            analysis: "Parsing",
            result: "Source",
            auth: "Private",
            privacy: "Export",
            error: "Recovery",
          }[variant]
        }
      </span>
      <span className="scene-chip is-chip-b">
        {
          {
            hero: "Proof",
            workspace: "Ready",
            upload: "Parse ready",
            analysis: "Evidence",
            result: "Evidence",
            auth: "Encrypted",
            privacy: "Control",
            error: "Safe",
          }[variant]
        }
      </span>
    </div>
  </div>
);

export default EvidenceScene3D;
