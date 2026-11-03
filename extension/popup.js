const LOCAL_SERVER_URL = "http://127.0.0.1:8000";
const REMOTE_SERVER_URL = "https://vrc-video-converter.onrender.com";

let currentVideoUrl = null;
let currentVideoId = null;
let activeServerUrl = LOCAL_SERVER_URL;
let isLocalServerRunning = false;

// DOM要素
const elements = {
  notYoutubeAlert: document.getElementById("notYoutubeAlert"),
  youtubeActiveBox: document.getElementById("youtubeActiveBox"),
  videoTitle: document.getElementById("videoTitle"),
  videoUrl: document.getElementById("videoUrl"),
  btnHqConvert: document.getElementById("btnHqConvert"),
  btnCleanConvert: document.getElementById("btnCleanConvert"),
  loadingBox: document.getElementById("loadingBox"),
  loadingText: document.getElementById("loadingText"),
  loadingSubtext: document.getElementById("loadingSubtext"),
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
  // サーバーの死活確認
  await detectServer();

  // 現在のアクティブタブを取得
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && isYouTubeUrl(tab.url)) {
    currentVideoUrl = tab.url;
    currentVideoId = extractVideoId(tab.url);

    elements.videoTitle.textContent = tab.title || "YouTube Video";
    elements.videoUrl.textContent = tab.url;
    elements.notYoutubeAlert.classList.add("hidden");
    elements.youtubeActiveBox.classList.remove("hidden");
    elements.btnHqConvert.disabled = false;
    elements.btnCleanConvert.disabled = false;
  } else {
    elements.notYoutubeAlert.classList.remove("hidden");
    elements.youtubeActiveBox.classList.add("hidden");
    elements.btnHqConvert.disabled = true;
    elements.btnCleanConvert.disabled = true;
  }

  // イベント登録
  elements.btnHqConvert.addEventListener("click", handleHqConvert);
  elements.btnCleanConvert.addEventListener("click", handleCleanConvert);
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
      (host.includes("youtube.com") && (parsed.pathname.startsWith("/watch") || parsed.pathname.startsWith("/shorts") || parsed.pathname.startsWith("/live"))) ||
      (host === "youtu.be" && parsed.pathname.length > 1)
    );
  } catch {
    return false;
  }
}

// Video IDの抽出
function extractVideoId(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.toLowerCase() === "youtu.be") {
      return parsed.pathname.slice(1).split("?")[0].split("/")[0];
    }
    if (parsed.pathname.startsWith("/shorts/")) {
      return parsed.pathname.replace("/shorts/", "").split("?")[0].split("/")[0];
    }
    if (parsed.pathname.startsWith("/live/")) {
      return parsed.pathname.replace("/live/", "").split("?")[0].split("/")[0];
    }
    return parsed.searchParams.get("v");
  } catch {
    return null;
  }
}

// サーバー自動検出 (ローカル優先、無ければクラウド)
async function detectServer() {
  // 1. ローカルサーバー (127.0.0.1:8000) を確認
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200);
    const res = await fetch(`${LOCAL_SERVER_URL}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      activeServerUrl = LOCAL_SERVER_URL;
      isLocalServerRunning = true;
      elements.serverStatusText.textContent = "● 1080pサーバー稼働中 (ローカル超高速)";
      elements.serverStatusText.style.color = "#10b981";
      return;
    }
  } catch (e) {}

  // 2. クラウドサーバー確認 (オプション)
  try {
    const stored = await chrome.storage.sync.get(["serverUrl"]);
    const remoteUrl = (stored.serverUrl || REMOTE_SERVER_URL).replace(/\/+$/, "");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${remoteUrl}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      activeServerUrl = remoteUrl;
      elements.serverStatusText.textContent = `● クラウドサーバー接続中 (${new URL(remoteUrl).hostname})`;
      elements.serverStatusText.style.color = "#06b6d4";
      return;
    }
  } catch (e) {}

  // サーバー未起動時
  isLocalServerRunning = false;
  elements.serverStatusText.textContent = "▲ 1080pサーバー未起動 (bat起動で有効化)";
  elements.serverStatusText.style.color = "#f59e0b";
}

// 1. 高画質 (1080p) 変換ハンドラ
async function handleHqConvert() {
  if (!currentVideoUrl) return;

  hideBoxes();
  elements.loadingBox.classList.remove("hidden");
  elements.loadingText.textContent = "1080p高画質ストリームを生成中...";
  elements.loadingSubtext.textContent = "※ 映像と音声を高速結合しています (約3〜5秒)";

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);

    const res = await fetch(`${activeServerUrl}/api/convert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: currentVideoUrl,
        mode: "hq"
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || `エラー (${res.status})`);
    }

    displaySuccess({
      quality: "1080p Full HD (最高画質)",
      stream_url: data.stream_url,
      meta: "※ 1080p高画質ストリームです。VRChatプレイヤーに貼り付けて再生してください！"
    });

    await copyToClipboard(data.stream_url);

  } catch (err) {
    if (!isLocalServerRunning) {
      displayError("1080p高画質サーバーが起動していません。「【VRC1080p起動】Chrome連動.bat」をダブルクリックして起動してください。（※Chrome起動中のみ動作します）");
    } else {
      displayError(`高画質変換エラー: ${err.message}`);
    }
  } finally {
    elements.loadingBox.classList.add("hidden");
  }
}

// 2. 通常リンク変換 (全員同期)
async function handleCleanConvert() {
  if (!currentVideoId) {
    displayError("動画IDを検出できませんでした。");
    return;
  }

  hideBoxes();
  const cleanUrl = `https://www.youtube.com/watch?v=${currentVideoId}`;

  displaySuccess({
    quality: "VRChat標準 (全員同期)",
    stream_url: cleanUrl,
    meta: "※ 余計なパラメータを除去した標準形式です。ワールド内の全員が正常に視聴できます。"
  });

  await copyToClipboard(cleanUrl);
}

// 成功表示
function displaySuccess(data) {
  elements.resultQuality.textContent = data.quality;
  elements.resultUrlInput.value = data.stream_url;
  elements.resultMeta.textContent = data.meta || "";
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
    console.warn("クリップボード書き込みエラー:", e);
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
