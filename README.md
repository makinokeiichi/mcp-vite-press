# mcp-vite-press

VitePress ドキュメントを MCP サーバーとして公開し、Cursor や Claude Code などの AI エージェントが「必要な仕様を自律的に検索・参照」できるようにするためのサーバーです。AI の回答精度向上とトークン節約を目的としています。

### 情報の流れ（概要）

```
┌─────────────────┐     buildEnd      ┌──────────────────┐
│  VitePress      │ ───────────────► │ dist/            │
│  (docs/*.md)    │   mcp-index.json │ mcp-index.json   │
└────────┬────────┘                  └────────┬─────────┘
         │                                    │
         │ VITEPRESS_DOCS_ROOT                │ VITEPRESS_INDEX_PATH
         │ (ソースの docs/)                    │
         ▼                                    ▼
┌─────────────────────────────────────────────────────────┐
│  mcp-vite-press (MCP サーバー)                            │
│  search_docs → インデックス検索 → 候補の path を返す      │
│  read_doc_page(path) → DOCS_ROOT + path でファイル読取    │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────┐
│  Cursor / AI    │  必要な仕様を自律的に検索・参照
└─────────────────┘
```

## セットアップ

```bash
npm install
npm run build
```

### 環境変数

| 変数名                 | 説明                                                                                                                                                                                                             |
|------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `VITEPRESS_INDEX_PATH` | `mcp-index.json` の絶対パス（ビルド後の `dist/` 内を指定）。未指定時は**実行時のカレントディレクトリ（CWD）**の `./mcp-index.json` または `./dist/mcp-index.json` を参照します。                                 |
| `VITEPRESS_DOCS_ROOT`  | ドキュメントのルート（`read_doc_page` がファイルを解決する際の基準）。Markdown の実体がある**ソース側のディレクトリ**（例: `docs/`）を指定してください。未指定時はインデックスファイルのディレクトリを使います。 |

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
   - **`VITEPRESS_INDEX_PATH`**: ビルド後に出力される **`dist/mcp-index.json`** の絶対パス。
   - **`VITEPRESS_DOCS_ROOT`**: **Markdown の実体があるソース側のディレクトリ**（例: `docs/`）。`read_doc_page` がここを基準にファイルを読みにいきます。

```json
{
  "mcpServers": {
    "vitepress-docs": {
      "command": "node",
      "args": ["/path/to/mcp-vite-press/dist/index.js"],
      "cwd": "/path/to/mcp-vite-press",
      "env": {
        "VITEPRESS_INDEX_PATH": "/path/to/your-vitepress/dist/mcp-index.json",
        "VITEPRESS_DOCS_ROOT": "/path/to/your-vitepress/docs"
      }
    }
  }
}
```

- `command` / `args` / `cwd` は、この MCP サーバー（mcp-vite-press）の実行パスに合わせてください。
- `VITEPRESS_INDEX_PATH` はビルド出力（`dist`）内のインデックス、`VITEPRESS_DOCS_ROOT` はソースの `docs` を指すようにすると、検索と実体読み込みの両方が確実に動作します。

## Cursor の MCP 設定（最小例）

環境変数が不要な場合（実行時のカレントディレクトリに `mcp-index.json` がある場合）の最小例です。

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

ビルド時に `mcp-index.json` を書き出すように、`.vitepress/config.mts`（または `config.ts`）で `buildEnd` フックを設定してください。以下は VitePress 公式の `createContentLoader` を使った**そのままコピペで動く例**です。出力すべき JSON の形は下記「3. インデックスのデータ構造」に従います。

```ts
// .vitepress/config.mts の例
import { defineConfig, createContentLoader } from 'vitepress'
import fs from 'node:fs'
import path from 'node:path'

export default defineConfig({
  // ... あなたの既存設定（title, themeConfig など）
  async buildEnd({ outDir }) {
    const loader = createContentLoader('**/*.md', { render: false, excerpt: true })
    const pages = await loader.load()
    const indexData = pages.map((p) => ({
      // p.url（例: /guide/）を VITEPRESS_DOCS_ROOT 基準のファイルパス（例: guide/index.md）に変換
      path: p.url.replace(/^\//, '').replace(/\/$/, '/index').replace(/\.html$/, '') + '.md',
      title: p.frontmatter?.title ?? p.title ?? 'Untitled',
      snippet: p.excerpt ?? p.frontmatter?.description ?? '',
    }))
    fs.writeFileSync(path.join(outDir, 'mcp-index.json'), JSON.stringify(indexData, null, 2), 'utf-8')
  },
})
```

- 各エントリの `path` は **`VITEPRESS_DOCS_ROOT` からの相対パス**にしてください（先頭の `/` なし、`..` なし）。**この `path` を基に `read_doc_page` がファイルを探します。** データ構造の一貫性が重要です。
- `path` で指定したファイルが、実行時に `VITEPRESS_DOCS_ROOT + path` で実際に存在するようにしてください（通常はソースの `docs/` を `VITEPRESS_DOCS_ROOT` に指定します。後述「2. 環境変数の設定」を参照）。
- **`createContentLoader` の第一引数**（例: `'**/*.md'`）は、VitePress の `srcDir` がデフォルト以外の構成の場合は、プロジェクトのディレクトリ構造に合わせて調整してください。

### 2. 環境変数の設定

- **`VITEPRESS_INDEX_PATH`**: ビルド後に出力される **`dist/mcp-index.json`** の絶対パス。
- **`VITEPRESS_DOCS_ROOT`**: **ソース側のドキュメントルート**（Markdown が置いてある `docs/` など）。`read_doc_page` はここを基準に指定された `path` のファイルを読みます。

```bash
VITEPRESS_INDEX_PATH="/path/to/your-vitepress/dist/mcp-index.json"
VITEPRESS_DOCS_ROOT="/path/to/your-vitepress/docs"
```

Cursor の MCP 設定では、上記「導入イメージ」のとおり `env` にこれらの値を設定してください。未指定時は**実行時のカレントディレクトリ（CWD）**の `./mcp-index.json` または `./dist/mcp-index.json` を参照します。

### 3. インデックスのデータ構造（スキーマ）

本サーバーは次の形式の JSON を期待します。配列の各要素は以下です。

| フィールド | 必須 | 説明                                                                                                                      |
|------------|------|---------------------------------------------------------------------------------------------------------------------------|
| `path`     | 必須 | VITEPRESS_DOCS_ROOT からの相対パス（先頭 `/` なし、`..` なし）。**このパスを基に `read_doc_page` がファイルを探します。** |
| `title`    | 必須 | ページタイトル                                                                                                            |
| `snippet`  | 任意 | 検索用テキスト（短い抜粋）。`search_docs` でヒット対象になります。                                                        |
| `content`  | 任意 | 検索用テキスト（長文可）。`snippet` がない場合に検索に使われます。                                                        |

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

| ツール名        | 説明                                                                                           |
|-----------------|------------------------------------------------------------------------------------------------|
| `search_docs`   | キーワードでインデックスを検索し、該当するドキュメントのパス・タイトル・スニペットを返します。 |
| `read_doc_page` | 指定した相対パスのドキュメント（Markdown など）の内容を読み取って返します。                    |

## 動作確認

- [ ] `npm run build` のあと `node dist/index.js`（または `npm run mcp:start`）でエラーなく起動する。
- [ ] Cursor の **Settings > MCP** に上記のとおり登録し、チャットで「docs から ○○ の仕様を探して」と指示して反応する。

## License

MIT
