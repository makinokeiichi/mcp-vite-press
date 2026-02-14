import fs from "fs";
import path from "path";
import type { McpIndex } from "./types.js";

const DEFAULT_INDEX_FALLBACKS = ["./mcp-index.json", "./dist/mcp-index.json"];

/**
 * Resolve path to mcp-index.json from env or fallbacks.
 * Returns null if no index file exists (avoids using cwd as docs root when index is missing).
 */
export function getIndexPath(): string | null {
  const fromEnv = process.env.VITEPRESS_INDEX_PATH;
  if (fromEnv) {
    const resolved = path.resolve(fromEnv);
    return fs.existsSync(resolved) ? resolved : null;
  }
  const cwd = process.cwd();
  for (const fallback of DEFAULT_INDEX_FALLBACKS) {
    const resolved = path.resolve(cwd, fallback);
    if (fs.existsSync(resolved)) {
      return resolved;
    }
  }
  return null;
}

/**
 * Resolve VITEPRESS_DOCS_ROOT. If not set, use directory of index file.
 */
export function getDocsRoot(indexPath: string): string {
  const fromEnv = process.env.VITEPRESS_DOCS_ROOT;
  if (fromEnv) {
    return path.resolve(fromEnv);
  }
  return path.dirname(indexPath);
}

/**
 * Load and parse mcp-index.json. Returns empty array if file missing or invalid.
 */
export function loadIndex(indexPath: string): McpIndex {
  if (!fs.existsSync(indexPath)) {
    return [];
  }
  const raw = fs.readFileSync(indexPath, "utf-8");
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) {
      return [];
    }
    return data.filter(
      (entry: unknown): entry is McpIndex[number] =>
        typeof entry === "object" &&
        entry !== null &&
        "path" in entry &&
        "title" in entry &&
        typeof (entry as McpIndex[number]).path === "string" &&
        typeof (entry as McpIndex[number]).title === "string"
    );
  } catch {
    return [];
  }
}
