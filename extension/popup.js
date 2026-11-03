// デフォルトのバックエンドAPI URL (ローカル開発または無料ホスト)
const DEFAULT_SERVER_URL = "http://localhost:8000";

let currentVideoUrl = null;
let serverBaseUrl = DEFAULT_SERVER_URL;

// DOM要素
const elements = {
  notYoutubeAlert: document.getElementById("notYoutubeAlert"),
  youtubeActiveBox: document.getElementById("youtubeActiveBox"),
  videoTitle: document.getElementById("videoTitle"),
  videoUrl: document.getElementById("videoUrl"),
  btnQuickConvert: document.getElementById("btnQuickConvert"),
  btnHqConvert: document.getElementById("btnHqConvert"),
  loadingBox: document.getElementById("loadingBox"),
  loadingText: document.getElementById("loadingText"),
  resultBox: document.getElementById("resultBox"),
  resultQuality: document.getElementById("resultQuality"),
  resultUrlInput: document.getElementById("resultUrlInput"),
  resultMeta: document.getElementById("resultMeta"),
  btnManualCopy: document.getElementById("btnManualCopy"),
  errorBox: document.getElementById("errorBox"),
  errorMessage: document.getElementById("errorMessage"),
  serverStatusText: document.getElementById("serverStatusText"),
  btnOptions: document.getElementById("btnOptions"),
};

// 初期化
document.addEventListener("DOMContentLoaded", async () => {
  // 設定からサーバーURLを取得
  const stored = await chrome.storage.sync.get(["serverUrl"]);
  if (stored.serverUrl) {
    serverBaseUrl = stored.serverUrl.replace(/\/+$/, "");
  }

  // サーバー死活チェック
  checkServerHealth();

  // 現在のアクティブタブを取得
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && isYouTubeUrl(tab.url)) {
    currentVideoUrl = tab.url;
    elements.videoTitle.textContent = tab.title || "YouTube Video";
    elements.videoUrl.textContent = tab.url;
    elements.notYoutubeAlert.classList.add("hidden");
    elements.youtubeActiveBox.classList.remove("hidden");
    elements.btnQuickConvert.disabled = false;
    elements.btnHqConvert.disabled = false;
  } else {
    elements.notYoutubeAlert.classList.remove("hidden");
    elements.youtubeActiveBox.classList.add("hidden");
    elements.btnQuickConvert.disabled = true;
    elements.btnHqConvert.disabled = true;
  }

  // イベント設定
  elements.btnQuickConvert.addEventListener("click", () => handleConvert("quick"));
  elements.btnHqConvert.addEventListener("click", () => handleConvert("hq"));
  elements.btnManualCopy.addEventListener("click", copyResultUrl);
  elements.btnOptions.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
});

// YouTube URLの判定
function isYouTubeUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return (
      (host.includes("youtube.com") && (parsed.pathname.startsWith("/watch") || parsed.pathname.startsWith("/shorts"))) ||
      (host === "youtu.be" && parsed.pathname.length > 1)
    );
  } catch {
    return false;
  }
}

// サーバー稼働状態チェック
async function checkServerHealth() {
  try {
    const res = await fetch(`${serverBaseUrl}/health`, { method: "GET" });
    if (res.ok) {
      elements.serverStatusText.textContent = `● サーバー接続中 (${new URL(serverBaseUrl).hostname})`;
      elements.serverStatusText.style.color = "#10b981";
    } else {
      throw new Error();
    }
  } catch {
    elements.serverStatusText.textContent = "▲ サーバー未接続 (オプションで確認)";
    elements.serverStatusText.style.color = "#ef4444";
  }
}

// 変換リクエストハンドラ
async function handleConvert(mode) {
  if (!currentVideoUrl) return;

  hideBoxes();
  elements.loadingBox.classList.remove("hidden");
  elements.btnQuickConvert.disabled = true;
  elements.btnHqConvert.disabled = true;

  if (mode === "hq") {
    elements.loadingText.textContent = "高画質 (1080p) を生成中... (約15〜30秒)";
  } else {
    elements.loadingText.textContent = "通常ストリームURLを取得中...";
  }

  try {
    const res = await fetch(`${serverBaseUrl}/api/convert`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        url: currentVideoUrl,
        mode: mode
      })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.detail || `サーバーエラー (${res.status})`);
    }

    // 成功処理
    displaySuccess(data);

    // 自動でクリップボードへコピー
    await copyToClipboard(data.stream_url);

  } catch (err) {
    displayError(err.message || "通信エラーが発生しました。");
  } finally {
    elements.loadingBox.classList.add("hidden");
    elements.btnQuickConvert.disabled = false;
    elements.btnHqConvert.disabled = false;
  }
}

// 成功表示
function displaySuccess(data) {
  elements.resultQuality.textContent = data.quality || (data.mode === "hq" ? "1080p High Quality" : "Standard");
  elements.resultUrlInput.value = data.stream_url;

  if (data.mode === "hq") {
    elements.resultMeta.textContent = `※ 一時ファイルは約${Math.round((data.expires_in || 3600) / 60)}分後に自動消去されます。`;
  } else {
    elements.resultMeta.textContent = "※ YouTube直結ストリームです。";
  }

  elements.resultBox.classList.remove("hidden");
}

// エラー表示
function displayError(msg) {
  elements.errorMessage.textContent = msg;
  elements.errorBox.classList.remove("hidden");
}

// クリップボード書き込み
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    console.warn("クリップボード自動書き込み失敗:", e);
  }
}

function copyResultUrl() {
  const val = elements.resultUrlInput.value;
  if (!val) return;
  copyToClipboard(val);
  elements.btnManualCopy.textContent = "済!";
  setTimeout(() => {
    elements.btnManualCopy.textContent = "コピー";
  }, 1500);
}

function hideBoxes() {
  elements.loadingBox.classList.add("hidden");
  elements.resultBox.classList.add("hidden");
  elements.errorBox.classList.add("hidden");
}
