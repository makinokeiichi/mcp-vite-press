# mcp-vite-press

VitePress ドキュメントを MCP サーバーとして公開し、Cursor や Claude Code などの AI エージェントが「必要な仕様を自律的に検索・参照」できるようにするためのサーバーです。AI の回答精度向上とトークン節約を目的としています。

## セットアップ

```bash
npm install
npm run build
```

### 環境変数

| 変数名 | 説明 |
|--------|------|
| `VITEPRESS_INDEX_PATH` | `mcp-index.json` の絶対パス。未指定時はカレントの `./mcp-index.json` または `./dist/mcp-index.json` を参照します。 |
| `VITEPRESS_DOCS_ROOT` | ドキュメントのルート（`read_doc_page` でファイルを解決する際の基準）。未指定時はインデックスファイルのディレクトリを使います。 |

## 起動

```bash
npm run mcp:start
# または
npm start
```

## 導入イメージ（Cursor で使う場合）

1. このリポジトリをクローンし、`npm install` と `npm run build` を実行する。
2. VitePress 側でビルド時に `mcp-index.json` を出力する（下記「VitePress 側の用意」を参照）。
3. **Cursor の MCP 設定**で、`VITEPRESS_INDEX_PATH` と `VITEPRESS_DOCS_ROOT` を **`env` で指定**する。  
   自前の VitePress プロジェクトの `dist` を参照する例：

```json
{
  "mcpServers": {
    "vitepress-docs": {
      "command": "node",
      "args": ["/path/to/mcp-vite-press/dist/index.js"],
      "cwd": "/path/to/mcp-vite-press",
      "env": {
        "VITEPRESS_INDEX_PATH": "/path/to/your-vitepress/dist/mcp-index.json",
        "VITEPRESS_DOCS_ROOT": "/path/to/your-vitepress/dist"
      }
    }
  }
}
```

- `command` / `args` / `cwd` は、この MCP サーバー（mcp-vite-press）の実行パスに合わせてください。
- `env` のパスは、**あなたの VitePress プロジェクトのビルド出力**（例: `dist`）を指すようにしてください。

## Cursor の MCP 設定（最小例）

環境変数が不要な場合（カレントディレクトリに `mcp-index.json` がある場合）の最小例です。

```json
{
  "mcpServers": {
    "vitepress-docs": {
      "command": "node",
      "args": ["./dist/index.js"],
      "cwd": "/path/to/mcp-vite-press"
    }
  }
}
```

## VitePress 側の用意

MCP サーバーは、VitePress のビルド時に出力する **`mcp-index.json`** を読み込みます。VitePress の `config.mts`（または `config.ts`）で `buildEnd` フックを使い、次の形式の JSON を出力してください。

```ts
// .vitepress/config.mts の例
import path from 'path'
import type { UserConfig } from 'vitepress'

export default {
  // ...
  buildEnd: async ({ outDir }) => {
    const pages = [] // ビルド済みページ一覧をここで収集
    // 例: 各ページの path, title, snippet を配列に詰める
    const index = pages.map((p) => ({
      path: p.path,   // VITEPRESS_DOCS_ROOT からの相対パス（例: "guide/index.md"）
      title: p.title,
      snippet: p.snippet ?? '',
    }))
    const fs = await import('fs')
    fs.writeFileSync(
      path.join(outDir, 'mcp-index.json'),
      JSON.stringify(index, null, 2),
      'utf-8'
    )
  },
} satisfies UserConfig
```

- 各エントリの `path` は **`VITEPRESS_DOCS_ROOT` からの相対パス**にしてください（先頭の `/` なし、`..` なし）。
- `path` で指定したファイルが、実行時に `VITEPRESS_DOCS_ROOT + path` で実際に存在するようにしてください。

## 提供ツール

| ツール名 | 説明 |
|----------|------|
| `search_docs` | キーワードでインデックスを検索し、該当するドキュメントのパス・タイトル・スニペットを返します。 |
| `read_doc_page` | 指定した相対パスのドキュメント（Markdown など）の内容を読み取って返します。 |

## 動作確認

- [ ] `npm run build` のあと `node dist/index.js`（または `npm run mcp:start`）でエラーなく起動する。
- [ ] Cursor の **Settings > MCP** に上記のとおり登録し、チャットで「docs から ○○ の仕様を探して」と指示して反応する。

## License

MIT
