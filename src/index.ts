#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  getIndexPath,
  getDocsRoot,
  loadIndex,
} from "./loadIndex.js";
import type { McpIndex } from "./types.js";

const indexPath = getIndexPath();
const docsRoot = getDocsRoot(indexPath);
const indexEntries: McpIndex = loadIndex(indexPath);

const server = new McpServer({
  name: "vitepress-docs",
  version: "1.0.0",
});

/**
 * Simple search: keyword match in title and snippet/content (case-insensitive).
 */
function searchEntries(query: string, entries: McpIndex, limit = 20): McpIndex {
  const q = query.trim().toLowerCase();
  if (!q) {
    return entries.slice(0, limit);
  }
  const terms = q.split(/\s+/).filter(Boolean);
  const scored = entries.map((entry) => {
    const title = (entry.title ?? "").toLowerCase();
    const text = ((entry.snippet ?? entry.content ?? "") + " " + title).toLowerCase();
    const score = terms.reduce(
      (acc, term) => acc + (text.includes(term) ? 1 : 0),
      0
    );
    return { entry, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored
    .filter(({ score }) => score > 0)
    .slice(0, limit)
    .map(({ entry }) => entry);
}

/**
 * Resolve and validate path: must be under docsRoot, no directory traversal.
 */
function resolveDocPath(relativePath: string): string | null {
  let normalized = path.normalize(relativePath);
  if (normalized.startsWith("." + path.sep)) {
    normalized = normalized.slice(path.sep.length + 1);
  }
  if (normalized.includes("..") || path.isAbsolute(normalized)) {
    return null;
  }
  const resolved = path.resolve(docsRoot, normalized);
  const realRoot = path.resolve(docsRoot);
  if (!resolved.startsWith(realRoot)) {
    return null;
  }
  return resolved;
}

server.registerTool(
  "search_docs",
  {
    description:
      "VitePressのドキュメントからキーワード検索を行い、該当するページのパス・タイトル・スニペットを返します。",
    inputSchema: z.object({
      query: z.string().describe("検索キーワード"),
    }),
  },
  async ({ query }) => {
    const results = searchEntries(query, indexEntries);
    const summary = results.map(
      (e) =>
        `- ${e.title}\n  path: ${e.path}\n  ${(e.snippet ?? e.content ?? "").slice(0, 200)}...`
    );
    return {
      content: [
        {
          type: "text",
          text:
            results.length === 0
              ? "該当するドキュメントはありませんでした。"
              : `検索結果 (${results.length} 件):\n\n` + summary.join("\n\n"),
        },
      ],
    };
  }
);

server.registerTool(
  "read_doc_page",
  {
    description:
      "指定したパスのドキュメント（MarkdownまたはHTML）の内容を読み取って返します。path は VITEPRESS_DOCS_ROOT からの相対パスです。",
    inputSchema: z.object({
      path: z.string().describe("ドキュメントの相対パス（例: guide/getting-started.md）"),
    }),
  },
  async ({ path: relativePath }) => {
    const resolved = resolveDocPath(relativePath);
    if (!resolved) {
      return {
        content: [
          {
            type: "text",
            text: "無効なパスです。'..' や絶対パスは使用できません。",
          },
        ],
        isError: true,
      };
    }
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      return {
        content: [
          {
            type: "text",
            text: `ファイルが見つかりません: ${relativePath}`,
          },
        ],
        isError: true,
      };
    }
    const content = fs.readFileSync(resolved, "utf-8");
    return {
      content: [
        {
          type: "text",
          text: content,
        },
      ],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
