import { buildWritingSupportDocument } from "./writing-support";

export interface RewriteSource {
  id: number;
  text: string;
}

/** Select exact shared support units, including their admitted line wraps.
 * Selection is not support: unknown scopes and duplicate originals still abstain. */
export function buildRewriteSources(source: string): RewriteSource[] {
  const units = buildWritingSupportDocument(source).anchors;
  const blocks = units
    .filter((anchor) => /^\s*[•●·▪–—-]\s*\p{L}/u.test(anchor.span.text))
    .map((anchor) => anchor.span.text)
    .filter((text) => text.length >= 25 && text.length <= 500);
  if (!blocks.length) {
    for (const { span } of units) {
      if (
        span.text.length >= 35 &&
        span.text.length <= 500 &&
        !/@|https?:\/\//iu.test(span.text)
      )
        blocks.push(span.text);
    }
  }
  return [...new Set(blocks)].slice(0, 32).map((text, id) => ({ id, text }));
}
