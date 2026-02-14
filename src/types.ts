/**
 * One entry in mcp-index.json (output from VitePress buildEnd).
 * path is relative to VITEPRESS_DOCS_ROOT.
 */
export interface McpIndexEntry {
  path: string;
  title: string;
  snippet?: string;
  content?: string;
}

export type McpIndex = McpIndexEntry[];
