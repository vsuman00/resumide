import { getDocumentProxy } from "unpdf";
import { safeArtifactLink, type RenderPlan } from "./artifact-contract";

/** Read transient annotation metadata only. Targets are never promoted to
 * candidate facts, fetched, logged or returned in a verification report. */
export async function assertSourceLinksPreserved(
  source: Uint8Array,
  plan: RenderPlan,
): Promise<void> {
  const document = await getDocumentProxy(new Uint8Array(source));
  try {
    if (document.numPages > 10) throw new Error("SOURCE_LINK_CHECK_FAILED");
    const represented = new Set(
      plan.blocks.flatMap((block) => (block.link ? [block.link] : [])),
    );
    for (let index = 1; index <= document.numPages; index++) {
      const page = await document.getPage(index);
      for (const annotation of await page.getAnnotations()) {
        if (annotation.subtype !== "Link") continue;
        const target = annotation.url ?? annotation.unsafeUrl;
        // Internal page destinations do not represent external contact links.
        if (typeof target !== "string") continue;
        const safe = safeArtifactLink(target);
        if (!safe || !represented.has(safe))
          throw new Error("SOURCE_LINKS_NOT_PRESERVED");
      }
    }
  } finally {
    await document.destroy();
  }
}
