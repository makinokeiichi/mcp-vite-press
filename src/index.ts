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

/** Allowed file extensions for read_doc_page (case-insensitive). */
const ALLOWED_EXTENSIONS = new Set([".md", ".html", ".htm", ".txt"]);
/** Max file size for read_doc_page (2MB). */
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;

const indexPath = getIndexPath();
if (indexPath === null) {
  console.error(
    "mcp-vite-press: mcp-index.json が見つかりません。VITEPRESS_INDEX_PATH を設定するか、カレントディレクトリに mcp-index.json を配置してください。"
  );
  process.exit(1);
}
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
 * Uses realpath to prevent escaping docsRoot via symlinks.
 */
function resolveDocPath(relativePath: string): string | null {
  const normalized = path.normalize(relativePath).replace(/^(\.\/)+/, "");
  if (normalized.includes("..") || path.isAbsolute(normalized)) {
    return null;
  }
  const resolved = path.resolve(docsRoot, normalized);
  let realRoot: string;
  let realTarget: string;
  try {
    realRoot = fs.realpathSync(docsRoot);
    realTarget = fs.realpathSync(resolved);
  } catch {
    return null;
  }
  const relative = path.relative(realRoot, realTarget);
  if (
    relative === ".." ||
    relative.startsWith(".." + path.sep) ||
    path.isAbsolute(relative)
  ) {
    return null;
  }
  return realTarget;
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
      "指定したパスのドキュメント（.md / .html / .htm / .txt、上限2MB）の内容を読み取って返します。path は VITEPRESS_DOCS_ROOT からの相対パスです。",
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
    const ext = path.extname(resolved).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return {
        content: [
          {
            type: "text",
            text: `許可されていない拡張子です: ${relativePath}（許可: .md, .html, .htm, .txt）`,
          },
        ],
        isError: true,
      };
    }
    const stat = fs.statSync(resolved);
    if (stat.size > MAX_FILE_SIZE_BYTES) {
      return {
        content: [
          {
            type: "text",
            text: `ファイルが大きすぎます: ${relativePath}（上限: ${MAX_FILE_SIZE_BYTES} bytes）`,
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
