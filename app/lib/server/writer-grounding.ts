import type { ResumeWriterZod } from "./schema";
import {
  assessWritingSupport,
  buildWritingSupportDocument,
} from "./writing-support";

/** Retain reconstructed source transformations; callers still own trust/consent. */
export function groundWriterSuggestions(
  writer: ResumeWriterZod,
  resumeText: string,
): ResumeWriterZod {
  let document: ReturnType<typeof buildWritingSupportDocument>;
  try {
    document = buildWritingSupportDocument(resumeText);
  } catch {
    return { summary: null, bullets: [] };
  }
  if (!document.anchors.length) return { summary: null, bullets: [] };
  const summary =
    writer.summary &&
    assessWritingSupport(document, {
      kind: "summary",
      proposed: writer.summary,
    }).state === "supported"
      ? writer.summary
      : null;
  const bullets = writer.bullets.filter(
    (suggestion) =>
      assessWritingSupport(document, {
        kind: "rewrite",
        original: suggestion.original,
        proposed: suggestion.rewrite,
      }).state === "supported" &&
      assessWritingSupport(document, {
        kind: "editorial",
        original: suggestion.original,
        proposed: suggestion.reasoning,
      }).state === "supported",
  );
  return { summary, bullets };
}
