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
2. VitePress 側でビルド時に `mcp-index.json` を出力する（下記「VitePressとの連携設定」を参照）。
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

## VitePressとの連携設定

`search_docs` ツールを有効にするには、VitePress 側で検索用インデックス（`mcp-index.json`）をビルド時に出力する必要があります。標準の `index.html` 等だけでは検索が機能しません。以下で「VitePress 側の準備」「環境変数の指定」「期待される JSON の形」を説明します。詳細な環境変数一覧は上記「環境変数」を参照してください。

### 1. VitePress側の設定（buildEnd）

ビルド時に `mcp-index.json` を書き出すように、`.vitepress/config.mts`（または `config.ts`）で `buildEnd` フックを設定してください。VitePress のバージョンやプラグインによってページ一覧の取得方法は異なるため、**出力すべき JSON の形は下記「3. インデックスのデータ構造」に従ってください。**

```ts
// .vitepress/config.mts の例
import path from 'path'
import fs from 'fs'
import type { UserConfig } from 'vitepress'

export default {
  // ...
  buildEnd: async ({ outDir }) => {
    const pages = [] // ビルド済みページ一覧をここで収集（VitePress の API に合わせて実装）
    const index = pages.map((p) => ({
      path: p.path,      // VITEPRESS_DOCS_ROOT からの相対パス（例: "guide/index.md"）
      title: p.title,
      snippet: p.snippet ?? '',  // 検索用。または content を使っても可
    }))
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

### 2. 環境変数の設定

MCP サーバー起動時に、**ビルド出力された** `mcp-index.json` への**絶対パス**を指定します。

```bash
VITEPRESS_INDEX_PATH="/path/to/your-vitepress/dist/mcp-index.json"
VITEPRESS_DOCS_ROOT="/path/to/your-vitepress/dist"
```

Cursor の MCP 設定では、上記「導入イメージ」のとおり `env` にこれらの値を設定してください。未指定時はカレントディレクトリの `./mcp-index.json` または `./dist/mcp-index.json` を参照します。

### 3. インデックスのデータ構造（スキーマ）

本サーバーは次の形式の JSON を期待します。配列の各要素は以下です。

| フィールド | 必須 | 説明 |
|------------|------|------|
| `path` | 必須 | VITEPRESS_DOCS_ROOT からの相対パス（先頭 `/` なし、`..` なし） |
| `title` | 必須 | ページタイトル |
| `snippet` | 任意 | 検索用テキスト（短い抜粋）。`search_docs` でヒット対象になります。 |
| `content` | 任意 | 検索用テキスト（長文可）。`snippet` がない場合に検索に使われます。 |

`snippet` と `content` の少なくともどちらかがあると、`search_docs` の検索精度が上がります。

**サンプル（mcp-index.json の 1 件分）:**

```json
[
  {
    "title": "環境構築",
    "path": "environment/tools.md",
    "snippet": "このページでは開発ツールの使い方について説明します..."
  }
]
```

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
