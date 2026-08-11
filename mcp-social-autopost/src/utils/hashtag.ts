export function formatHashtags(tags: string[], separator = " "): string {
  return tags
    .map((t) => {
      const trimmed = t.trim();
      if (!trimmed) return "";
      return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
    })
    .filter(Boolean)
    .join(separator);
}

export function formatVkHashtags(tags: string[]): string {
  return formatHashtags(tags, " ");
}

export function formatTenchatHashtags(tags: string[]): string {
  return formatHashtags(tags, " ");
}
