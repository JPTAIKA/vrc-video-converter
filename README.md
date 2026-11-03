# VRChat 動画リンク変換 & 高画質ストリーミング システム

YouTubeの動画リンクを、VRChat内プレイヤー（AVPro / Unity Video）で再生可能なURLにワンクリックで変換・クリップボードコピーするChrome拡張機能およびバックエンドAPIサーバーです。

---

## 🌟 主な特徴と機能

1. **通常変換モード（<=720p / 即時抽出）**
   - サーバーディスクを消費せず、YouTubeの直結ストリームURLを瞬時に抽出してクリップボードにコピーします。
   - VRChat側でのYouTube 403 Forbidden（Bot判定・アクセス拒否）を回避して安定再生できます。

2. **高画質変換モード（1080p / 一時キャッシュ配信）**
   - YouTubeの1080p・4K動画は「映像」と「音声」が別ストリーム（DASH）で配信されているため、そのままではVRChatで再生できません。
   - 本システムのバックエンドサーバーが一時的に映像と音声を結合（mux）して単一のMP4ファイルを生成し、VRChatプレイヤーが要求する **HTTP 206 Partial Content (Rangeリクエスト)** に対応したストリームURLを発行します。

3. **他ユーザーへの配布を見据えた安全設計（セキュリティ対策）**
   - **SSRF / 不正URLインジェクション対策**: YouTube公式URL（watch/shorts）のみを厳格にバリデーションし、正規化URLに再構築。
   - **パストラバーサル防止**: ファイルIDの厳格な正規表現チェックにより、サーバー内部ファイルへのアクセスを完全遮断。
   - **DoS / リソース枯渇対策**: IPごとのレートリミット（分間最大10回）および動画長制限（最大30分）。
   - **ディスク保護 & TTL自動クリーンアップ**: 一時ファイルは1時間（変更可能）で自動削除。ディスク上限（1.5GB）到達時は古いファイルから自動廃棄。
   - **秘密情報の分離**: 拡張機能内に機密APIキーや認証情報を埋め込まない安全設計。

---

## 📂 ディレクトリ構成

```text
vrc-video-converter/
├── extension/                 # Chrome拡張機能 (Manifest V3)
│   ├── manifest.json
│   ├── popup.html             # 拡張機能のメインポップアップ
│   ├── popup.js               # タブURL取得・API通信・自動コピー
│   ├── popup.css              # VRChat調ダークUIデザイン
│   ├── options.html           # サーバーURL設定画面
│   ├── options.js             # 接続テスト・設定保存ロジック
│   ├── options.css
│   └── icons/                 # 各サイズのアプリアイコン
│
├── backend/                   # 変換＆配信バックエンドAPI (Python / FastAPI)
│   ├── main.py                # FastAPI本体 (Rangeリクエスト・CORS対応)
│   ├── downloader.py          # yt-dlp & ffmpeg多重化・キャッシュ管理
│   ├── security.py            # SSRF防止・レート制限・サニタイズ
│   ├── config.py              # サーバー・制限値設定
│   ├── requirements.txt       # Python依存ライブラリ
│   ├── Dockerfile             # ffmpeg同梱コンテナ設定 (Render等向け)
│   └── render.yaml            # Render.com 無料デプロイ構成
└── README.md
```

---

## 🚀 導入手順

### 1. Chrome拡張機能のインストール（利用者共通）

1. Google Chromeを開き、アドレスバーに `chrome://extensions/` を入力して開きます。
2. 右上の「**デベロッパーモード**」をオンにします。
3. 左上に表示される「**パッケージ化されていない拡張機能を読み込む**」をクリックします。
4. 本リポジトリの `extension` フォルダを選択します。
5. ツールバーにパズルピースアイコン（拡張機能）が表示されるので、「VRChat 動画リンク変換」をピン留めします。

---

### 2. バックエンドサーバーの起動・デプロイ

高画質モード（1080p）を利用するには、`ffmpeg` がインストールされたバックエンドサーバーが必要です。

#### A. ローカルPCで動かす場合（自分専用）
```bash
cd backend
pip install -r requirements.txt
# ※ ffmpeg がWindows/MacのPATHに通っている必要があります
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```
- Chrome拡張機能の設定（⚙️アイコン）で `http://localhost:8000` を設定し「接続テスト」を押してください。

#### B. 無料クラウドサーバー（Render.comなど）にデプロイする場合（他ユーザーと共有可能）
1. GitHubに本リポジトリ（または `backend` フォルダ）をプッシュします。
2. [Render.com](https://render.com/) にログインし、**New +** > **Web Service** を選択。
3. リポジトリを連携し、Environmentに **Docker** を選択（`Dockerfile` から自動ビルドされます）。
4. Planを **Free** に設定してデプロイ。
5. 発行されたURL（例: `https://vrc-stream-helper.onrender.com`）を、Chrome拡張機能の設定画面（⚙️）に入力して保存します。

---

## 🎮 使い方

1. ブラウザで再生したい **YouTubeの動画ページ** を開きます。
2. ツールバーの **「VRC」拡張機能アイコン** をクリックします。
3. モードを選択:
   - **⚡ 通常変換 (<=720p)**: 待ち時間なし（1秒以内）。YouTube拒否を回避する直リンクをコピー。
   - **🚀 高画質変換 (1080p)**: サーバーで音声と映像を結合（約15〜30秒）。1080p MP4リンクを生成。
4. 自動でクリップボードにコピーされるので、VRChat内の動画プレイヤー（iwaSync, USharpVideo, ProTV等）のURL入力欄にそのまま貼り付け（Paste）してください。

---

## 🛡️ 他ユーザー配布時の注意点・技術的アドバイス

- **YouTube側のIPブロック対策**:
  YouTubeは、AWSやRenderなどの一般的なデータセンターIPからの動画取得に対し、一時的に403 ForbiddenやBot確認（PoToken要求）を課す場合があります。
  もし無料クラウド上で頻繁にブロックされる場合は、個人契約の安価なVPS（さくらのVPS、ConoHa、Oracle Cloud Free Tier等）で運用するか、`yt-dlp` のCookieオプション（`--cookies`）をサーバー側に配置することを検討してください。
- **著作権・利用規約への配慮**:
  動画の一時キャッシュはユーザー個人がVRChatで一時視聴する目的に限定し、長時間の保存や第三者への無断再配布サイト化を行わないよう、設定ファイルのTTL（`CACHE_TTL_SECONDS: 3600`）および動画長制限（`MAX_VIDEO_DURATION_SECONDS: 1800`）を適切に維持してください。
