import type { DeviceFileEntry } from "../types";

/**
 * Filename-based heuristic for organizing a flat /Books folder into
 * per-author subfolders. This is NOT true metadata extraction (that would
 * mean parsing each EPUB's OPF package document, which means downloading
 * every file in full over serial just to read a few hundred bytes of
 * metadata — impractical). Instead it recognizes common naming
 * conventions ("Title - Author", "Author - Title", "Author, First - Title")
 * and falls back to "Unknown Author" when nothing matches. Always review
 * the proposed plan before committing it — the heuristic will sometimes
 * guess wrong on unconventional filenames.
 */

export interface ParsedBookName {
  author: string;
  title: string;
}

export const UNKNOWN_AUTHOR = "Unknown Author";

const NAME_LIKE = /^[A-Z][\p{L}.'-]*(?:\s+[A-Z][\p{L}.'-]*){0,3}$/u;
const NAME_LIKE_COMMA = /^[A-Z][\p{L}'-]+,\s*[A-Z][\p{L}.'-]*(?:\s+[A-Z][\p{L}.'-]*)?$/u;
const ISBN_RE = /^\d{9,13}[\dXx]?$/;
// Standard Ebooks-style downloads, e.g. "herman-melville_moby-dick.epub".
const SLUG_UNDERSCORE_RE = /^([a-z0-9]+(?:-[a-z0-9]+)*)_([a-z0-9]+(?:-[a-z0-9]+)*)$/;

function looksLikeName(segment: string): boolean {
  const trimmed = segment.trim();
  return NAME_LIKE.test(trimmed) || NAME_LIKE_COMMA.test(trimmed);
}

function normalizeCommaForm(name: string): string {
  const match = name.match(/^([\p{L}'-]+),\s*(.+)$/u);
  return match ? `${match[2]} ${match[1]}` : name;
}

function titleCaseFromSlug(slug: string): string {
  return slug
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function parseAuthorFromFilename(rawFilename: string): ParsedBookName {
  const withoutExt = rawFilename.replace(/\.[a-zA-Z0-9.]+$/, "");
  let parts = withoutExt
    .split(/\s+-\s+|\s+–\s+/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length > 1 && ISBN_RE.test(parts[0].replace(/[^0-9Xx]/g, ""))) {
    parts = parts.slice(1);
  }

  if (parts.length <= 1) {
    const slugMatch = withoutExt.match(SLUG_UNDERSCORE_RE);
    if (slugMatch) {
      return { author: titleCaseFromSlug(slugMatch[1]), title: titleCaseFromSlug(slugMatch[2]) };
    }
    return { author: UNKNOWN_AUTHOR, title: titleCaseFromSlug(parts[0] ?? withoutExt) || rawFilename };
  }

  const [first, second, ...rest] = parts;
  const firstIsName = looksLikeName(first);
  const secondIsName = looksLikeName(second);

  // "Author - Title" only when the first segment looks name-like and the
  // second doesn't; every other case (including "both look name-like" and
  // "neither does") defaults to the more common "Title - Author" order.
  const authorIsFirst = firstIsName && !secondIsName;
  const author = authorIsFirst ? first : second;
  const title = (authorIsFirst ? [second, ...rest] : [first, ...rest]).join(" - ") || withoutExt;

  return { author: normalizeCommaForm(author), title };
}

export interface ReorganizeItem {
  file: DeviceFileEntry;
  currentPath: string;
  author: string;
  title: string;
  targetPath: string;
  include: boolean;
}

function sanitizeFolderName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "").trim() || UNKNOWN_AUTHOR;
}

/** Builds a reviewable move plan for every non-directory file directly inside `booksDir`. */
export function buildReorganizePlan(booksDir: string, files: DeviceFileEntry[]): ReorganizeItem[] {
  const dir = booksDir.replace(/\/+$/, "");
  return files
    .filter((f) => !f.isDirectory)
    .map((f) => {
      const { author, title } = parseAuthorFromFilename(f.name);
      const safeAuthor = sanitizeFolderName(author);
      return {
        file: f,
        currentPath: `${dir}/${f.name}`,
        author: safeAuthor,
        title,
        targetPath: `${dir}/${safeAuthor}/${f.name}`,
        include: true,
      };
    });
}

export interface ReorganizeGroup {
  author: string;
  items: ReorganizeItem[];
}

export function groupByAuthor(items: ReorganizeItem[]): ReorganizeGroup[] {
  const map = new Map<string, ReorganizeItem[]>();
  for (const item of items) {
    const list = map.get(item.author) ?? [];
    list.push(item);
    map.set(item.author, list);
  }
  return Array.from(map.entries())
    .map(([author, groupItems]) => ({ author, items: groupItems }))
    .sort((a, b) => a.author.localeCompare(b.author));
}
