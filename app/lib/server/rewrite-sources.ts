export interface RewriteSource {
  id: number;
  text: string;
}

/** Preserve exact source substrings, including PDF line wraps. Never let the model
 * reconstruct a quotation or combine unrelated contributions. */
export function buildRewriteSources(source: string): RewriteSource[] {
  const lines = Array.from(source.matchAll(/[^\n]+/gu));
  const starts = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /^\s*[•●·–—-]\s*\p{L}/u.test(line[0]));
  const blocks: string[] = [];
  for (const { line, index } of starts) {
    const start = line.index!;
    let end = start + line[0].length;
    let last = line[0];
    for (let i = index + 1; i < lines.length && !/[.!?]\s*$/u.test(last); i++) {
      const next = lines[i];
      if (
        /^\s*[•●·–—-]/u.test(next[0]) ||
        /^(?:(?:professional|technical|relevant|work)\s+)?(?:summary|skills|experience|education|projects|certifications|achievements|awards|publications)\s*$/iu.test(
          next[0].trim(),
        )
      )
        break;
      if (next.index! - end > 1 || next.index! + next[0].length - start > 500)
        break;
      end = next.index! + next[0].length;
      last = next[0];
    }
    const text = source.slice(start, end);
    if (text.length >= 25 && text.length <= 500) blocks.push(text);
  }
  if (!blocks.length) {
    for (const line of lines) {
      const text = line[0];
      if (
        text.length >= 35 &&
        text.length <= 500 &&
        !/@|https?:\/\//iu.test(text)
      )
        blocks.push(text);
    }
  }
  return [...new Set(blocks)].slice(0, 32).map((text, id) => ({ id, text }));
}
