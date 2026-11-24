// Only web and mail links from a PDF become clickable; everything else stays text.
export function safePdfHref(uri: string): string | null {
  try {
    const url = new URL(uri.trim());
    if (!["http:", "https:", "mailto:"].includes(url.protocol)) return null;
    if (url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}
