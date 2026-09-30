# MORIKAWA RYOTA Portfolio

森川亮太のポートフォリオ。Astroで静的HTMLを生成し、GitHub Pagesで公開します。

**作品の修正は `works/<作品名>/index.md` を開いてください。** 作品名・担当・画像の順番・説明文を、この1ファイルで編集できます。画像は隣の `img/` に置きます。

**作品の追加をCodexへ依頼するときは [作品追加・Instagram更新ガイド](docs/works-guide.md) を参照してください。** 投稿URLや素材を渡すだけで進める依頼文、Codexに任せる命名・必要項目・取得から公開までの手順をまとめています。

## ファイル構成

```text
works/
  大森元貴『催し』 Behind the Song & the Scenes/
    index.md           ← 公開ページの編集元
    img/               ← この作品の画像
      01.jpg
    instagram.json     ← 最後に取得した投稿の記録（自動更新・通常は編集不要）
  その他の作品/
    index.md
    img/
src/
  pages/
    index.astro        ← トップページ
    about.astro        ← プロフィール・お問い合わせ
    works.astro        ← 作品一覧
    works/[path]/index.astro  ← slugの公開URL・旧URLからの転送
  components/works/
    WorkPage.astro         ← 作品詳細の共通構成
    WorkHeading.astro      ← タイトル・日付・担当
    WorkGallery.astro      ← ギャラリー
    WorkDescription.astro  ← 説明・元投稿へのリンク
  layouts/SiteLayout.astro  ← ヘッダー・フッター・共通HTML
  components/SeoHead.astro  ← 検索/SNS用のhead出力
  lib/seo.ts               ← ページ種別ごとの構造化データ・作品説明
  lib/work-urls.ts         ← 作品・画像URLの共通生成
  lib/works.ts             ← 公開作品・画像寸法の読み込み
  config/site.ts           ← トップの代表作・カテゴリ名・本人情報
  content.config.ts        ← 作品データの入力ルール
  styles/main.css          ← 全ページ共通のスタイル
  scripts/                 ← スライドショー・カテゴリ絞り込み
public/
  assets/              ← 共通ロゴ・プロフィール画像
  CNAME                ← 独自ドメイン
scripts/               ← 取り込み・作品追加・ビルド検証
```

共通のHTMLを78作品にコピーする必要はありません。作品ごとの情報はMarkdown、全体の見た目はAstroで管理します。`instagram.json` は取得元と手修正を比較するための記録です。サイト本文には使わず、公開用の `dist/` にも含めません。ただし公開GitHubリポジトリにコミットしたファイルは誰でも読めるため、非公開情報を入れないでください。

## 起動・確認

Node.js 24を推奨します（最低22.12.0）。

```bash
npm ci
npm run dev
```

表示されたローカルURLをブラウザで開きます。MarkdownやAstroを保存すると反映されます。

```bash
npm run verify    # 型・内容、回帰テスト、ビルド、全内部リンク・画像、開発・公開プレビューのHTTP配信を検証
npm run preview   # 公開する dist/ をプレビュー
```

`dist/`、`node_modules/`、`.astro/` は自動生成物なので編集・コミットしません。`python3 -m http.server` でリポジトリ直下を配信する旧手順は使いません。

## 作品詳細のどこを修正するか

| 変更したい場所 | `index.md` の編集箇所 |
| --- | --- |
| ページタイトル・一覧リンクの名前 | `title` |
| 公開URL `/works/○○/` の○○部分 | `slug`（公開後は固定） |
| PHOTO / MOVIE / PRODUCTION STAFF | `categories` |
| 日付・一覧の新しい順 | `publishedAt`（タイムゾーン付き、通常は `+09:00`） |
| 冒頭の紹介文・検索/SNS向け説明 | `summary` |
| 自分が担当した業務 | `role` |
| クライアント | `client` |
| 一覧サムネイル | `images` の先頭の画像 |
| ギャラリーの順番 | `images` の並び順 |
| 画像を説明する代替テキスト | 各画像の `alt` |
| 画像下の注釈 | 各画像の `caption` |
| 概要・担当の詳細・クレジット | 2つ目の `---` より下のMarkdown本文 |
| 元投稿・公式サイトへのリンク | `source` と `sourceLabel`（省略可能） |
| 一時的に公開から外す | `draft: true` |

例：

```markdown
---
workId: manual-sample-project
slug: artist-title
title: 作品タイトル
categories:
  - photo
publishedAt: "2026-10-01T12:00:00+09:00"
draft: false
summary: アーティスト写真の撮影を担当した作品です。
role: スチール撮影
client: ""
images:
  - file: img/01.jpg
    alt: 作品に合わせた具体的な画像の説明
  - file: img/02.jpg
    alt: 2枚目の画像の説明
    caption: 画像の下に表示する注釈
source: https://example.com/project
sourceLabel: 公式サイト
---

## 作品について

この作品の概要を記載します。

## 担当したこと

撮影した内容や自分の担当範囲を記載します。

## クレジット

公開可能な担当者や制作会社を記載します。
```

`summary`・`role`・`client` は空欄なら表示されません。既存作品の説明は移行前の内容を保持しています。作品に応じて見出しを追加でき、全作品で同じ文章形式に揃える必要はありません。

画像はJPEG・PNG・WebP・AVIFに対応し、寸法は自動取得します。ファイル名は `01.jpg` などが扱いやすいです。`images` に登録した画像だけを公開します。先頭を変えると作品一覧の画像が変わります。SNS共有には下記の共通OGP画像を使います。本文中で画像を参照する場合も `images` に登録してください。

### 公開URLの決め方

各 `index.md` の `slug` から **`/works/<slug>/`** を生成します。`.html` は表示されません。

```yaml
slug: omori-moyooshi
```

この作品の公開URLは `https://m-ryohta.com/works/omori-moyooshi/` です。日本語の作品フォルダ名はそのままで構いません。

- アーティスト名＋短い作品名を基本にします（例：`kanae-minority`、`nogizaka-fortissimo`）。
- 英小文字・数字・単語の間のハイフンのみ、64文字以内。`/` や拡張子は書きません。
- 同名作品の写真と映像などは `-photo`・`-making` で区別します。重複や別作品の旧URLとの衝突は検証エラーになります。
- `slug: ""` は下書きのみ許可します。公開前に必ず記入してください。
- 一覧・トップからのリンク、canonical、OGP、構造化データ、サイトマップは同じ `slug` を参照します。

**公開済みの `slug`・作品フォルダ名・`workId` は維持してください。** `slug` は公開URL・一覧への戻り先（`/works/#<slug>`）、フォルダ名は画像URLと移行前URLの転送、`workId` は投稿の重複判定・代表作の指定に使用します。表示名だけなら `title` を変更します。公開後に `slug` を変える必要がある場合は、その変更前のURLからの転送も別途追加してください。

## 1. Instagramから取得して更新する（通常の運用）

このリポジトリはInstagramのログイン・クロール自体を自動実行しません。Codexのブラウザ操作などで本人の対象投稿から画像・本文・日時を取得し、ローカルに保存した結果を取り込みます。閲覧者のブラウザからInstagramを取得する処理もありません。

### 取得する情報

本人の投稿 `https://www.instagram.com/m_ichirinka/` の対象URL、投稿日時、本文、掲載する画像を取得します。画像はカルーセルの掲載順で保存します。動画投稿は掲載用のカバー画像を使います。取得できない投稿を既存サイトから削除しないでください。

生のダウンロードやexportはリポジトリ外、またはGit管理されない `.imports/` に保存します。Cookie・トークン・非公開情報をリポジトリに入れないでください。

### export.json の形式

```json
[
  {
    "url": "https://www.instagram.com/p/POST_SHORTCODE/",
    "date": "2026-10-01T03:00:00Z",
    "title": "作品タイトル",
    "slug": "artist-title",
    "categories": ["photo"],
    "caption": "【Still work】\n作品タイトル\n\n撮影を担当しました。",
    "files": [
      { "path": "/tmp/portfolio-import/01.jpg", "cover": false },
      { "path": "/tmp/portfolio-import/02.jpg", "cover": false }
    ]
  }
]
```

- 対象投稿だけを渡せます。全件exportは不要です。
- 新規作品は `slug` が必須です。Codexが作品名を参考に短い名前を付けます。既存作品の再取得では省略可能で、指定しても保存済みの `slug` を維持します。
- `title`・`categories` は指定を推奨します。省略時、新規作品は本文から推定、既存作品は前回の値を引き継ぎます。判定できない場合はエラーで停止します。
- 旧形式の `files[].source` も受け付けますが、保存はしません。`detailCaption` があれば `caption` より優先します。
- `date` はタイムゾーン付きで指定します。取り込み時に日本時間へ揃えます。
- 新規作品のフォルダ名を指定する場合は `folder` を追加します。同名の別作品には連番が付きます。既存作品のフォルダは変更しません。

```bash
npm run import:instagram -- /tmp/portfolio-import/export.json --dry-run
npm run import:instagram -- /tmp/portfolio-import/export.json
npm run verify
```

### 再取得時の動作

| 状態 | 動作 |
| --- | --- |
| 新規投稿 | 作品フォルダ・`index.md`・画像・`instagram.json` を作成 |
| 同じ投稿の再取得 | 投稿IDで照合し、同じ作品フォルダを更新 |
| タイトル・キャプションの変更 | 保存済みの `slug` を維持し、公開URLを固定 |
| 前回取得後、編集していない項目・本文 | 新しい取得内容で更新 |
| 手で編集した項目・本文 | 編集内容を維持し、取得内容は `instagram.json` に保存 |
| 画像の順番・alt・caption を編集済み | `images` 全体を維持。取得画像は保存し、手動で反映可能 |
| 取得記録がない既存作品 | 公開内容を維持して取得記録のみ追加 |
| 今回取得していない作品・手動追加作品 | そのまま保持 |
| 壊れた入力・画像の読み込み失敗 | 書き込み開始前の検証で停止 |

「手動編集を保持」と表示された項目は、`instagram.json` の新しい取得内容と `index.md` を比較して反映します。画像が不要になっても自動では削除しません。公開から外れた画像は確認後に個別削除できます。

新しいダウンロード画像は回転情報を反映したJPEGへ変換し、EXIF等のメタデータを落として保存します。同じ画像は再利用します。移行前からある画像は今回変更していません。

## 2. Codexで作品を追加する（一部の運用）

```bash
npm run new:work -- "新しい作品タイトル" --slug artist-title
```

新しい作品フォルダと `draft: true` の編集用Markdownを作成します。`--slug` を省略すると空欄になります。画像を `img/` に置き、`images` と本文を記入し、`slug` を確認して公開するときに `draft: false` にします。Instagramや公式ページがない場合は `source` を省略できます。

Codexへの指示例：

> 「大森元貴『催し』」の作品を参考に、新しい作品を追加してください。担当はスチール撮影です。添付画像をこの順で掲載し、説明とクレジットは次の内容にしてください。

> 「○○」の作品詳細の2枚目を先頭にして、その画像の下に「撮影風景」と表示してください。本文の「担当したこと」だけ次の文章に変更してください。

Codex用の編集ルールは [AGENTS.md](AGENTS.md) にあります。

## 共通ページの編集

- トップの代表作：`src/config/site.ts` の `featuredWorkIds` を、作品の `workId` で指定します。配列順がスライド順です。
- プロフィール・連絡先：`src/pages/about.astro`。
- 作品詳細の並び・構成：`src/components/works/WorkPage.astro` と同じフォルダの各部品。
- 作品URL・旧URLからの転送：`src/pages/works/[path]/index.astro` と `src/components/WorkRedirect.astro`。
- 共通の検索/SNS情報：`src/components/SeoHead.astro`。構造化データと作品説明の生成は `src/lib/seo.ts`。
- 作品・画像URLの生成：`src/lib/work-urls.ts` の `workHref` / `imageHref`。
- 画像寸法の取得：`src/lib/works.ts`。一覧・代表作は `getCoverImage` で先頭だけ、詳細は `getImages` でギャラリー全体を読みます。
- サイトURL：`astro.config.mjs` の `site`。ドメインを変える場合は `public/CNAME` と検証スクリプトも確認します。

タイトル・description・canonical・OGP・JSON-LD・サイトマップを生成します。構造化データには本人のプロフィールや作品との関係を記述し、未確認の担当業務は補完しません。

JSON-LDはトップに `WebSite`、作品一覧に `CollectionPage` / `ItemList`、プロフィールに `ProfilePage` / `Person`、作品詳細に `WebPage` / `CreativeWork` / `BreadcrumbList` を出力します。一覧の作品順・件数・URLは画面と同じ公開データを使います。JSON-LDの埋め込みは共通関数でHTMLをエスケープし、作品名に `<` が含まれても元の文字列を保持します。

SNS共有用のタイトル・説明はページごとに設定し、OGPとX（Twitter）で同じ内容を使います。トップ・作品一覧は `website`、プロフィールは `profile`（姓名）、作品詳細は `article`（`publishedAt` の掲載日時、本人プロフィールへの著者リンク、カテゴリ）を出力します。作品の説明は `summary` を優先し、空欄なら作品名・記入済みの担当・カテゴリから生成します。

OGP画像は全ページ共通で `public/assets/images/ichirinka-og.png` を使います。faviconと同じロゴを中央に配置した1200×630pxのPNGを、縮小・切り抜きせず横長のまま配信します。設定は `src/config/site.ts` の `socialImage` にまとめ、HTTPSの絶対URL・形式・実際の幅と高さ・代替テキストを出力します。画像を差し替えた場合は実際の寸法・形式・代替テキストも合わせて更新してください。

正方形の表示を優先するため、X（Twitter）は `twitter:card=summary` とし、`twitter:image`・`twitter:image:alt` も明示します。ロゴと文字は画像中央の正方形内に収めてあります。OGPには横長画像の実寸を記載し、正方形への切り抜きは各媒体に任せます。最終的な表示比率・切り抜きは各媒体の仕様で決まり、サイトから正方形表示を強制する設定はありません。作品ギャラリー・一覧サムネイル・プロフィール写真は各ページの画像を使います。

## GitHub Pagesでの公開

`.github/workflows/deploy.yml` が、検証してから `dist/` をデプロイします。

1. GitHubの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** に設定します。
2. 独自ドメイン `m-ryohta.com` の設定を維持します。
3. 変更を `main` にpushすると検証・ビルド・公開が実行されます。PRでは検証だけ実行します。

作品詳細の正規URLは `/works/<slug>/` です。既存の `/works/<作品フォルダ>/index.html`（同じフォルダの末尾 `/` も含む）は、新URLを指すcanonicalと即時meta refreshを持つ転送ページになります。GitHub Pagesの静的配信なので、HTTP 301ではなくHTMLによる転送です。サイトマップには新しい正規URLのみを載せます。

固定ページも、トップ `/`・プロフィール `/about/`・作品一覧 `/works/` に統一しています。ヘッダーや「WORKS」も末尾 `/` のURLを使います。旧 `/about.html`・`/works.html` には新URLへ即時転送するHTMLを生成します。トップの `/index.html` は `/` と同じファイルで、正規URLは `/` です。

ページ内の画像は `/works/<slug>/img/<ファイル名>` を参照します。作品フォルダ名に `&`・`:`・`#` が含まれていても、開発サーバー・公開プレビューで同じURLから表示できます。画像の編集場所は引き続き `works/<作品名>/img/` です。旧画像URLも公開出力に残しています。`#` を含む既存作品名は専用の読み込み処理とビルド完了処理で対応しています。

`npm run verify` はファイルの存在確認に加え、開発サーバーと公開プレビューを一時起動し、全公開ページ内の画像・OGP画像・構造化データの画像をHTTP経由で取得して検証します。ビルド済みの状態なら `npm run verify:http` で配信検証だけを実行できます。

今回の移行で巨大な `data/instagram-works.json` とPython製HTML生成処理、手管理の生成HTMLは廃止しました。公開用ファイルの生成は `npm run build` に統一しています。
