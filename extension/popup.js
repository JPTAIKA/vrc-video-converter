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

  // サーバー状態の確認
  await detectServer();
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

// サーバー待機
async function waitForServerReady(url, maxAttempts = 12) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1000);
      const res = await fetch(`${url}/health`, { signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) return true;
    } catch (e) {}
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

// Native MessagingでChromeから直接バックエンドを自動起動
let lastNativeErrorMessage = "";

function ensureServerViaNative() {
  return new Promise((resolve) => {
    try {
      lastNativeErrorMessage = "";
      chrome.runtime.sendNativeMessage("vrc_video_converter", { action: "ensure_server" }, async (response) => {
        if (chrome.runtime.lastError) {
          lastNativeErrorMessage = chrome.runtime.lastError.message || "Unknown error";
          console.warn("Native Messaging error:", lastNativeErrorMessage);
          resolve(false);
          return;
        }
        if (response && response.status === "ready") {
          const ready = await waitForServerReady(LOCAL_SERVER_URL);
          resolve(ready);
        } else {
          lastNativeErrorMessage = "ホストからの応答が不正です: " + JSON.stringify(response);
          resolve(false);
        }
      });
    } catch (e) {
      lastNativeErrorMessage = e.message || String(e);
      console.warn("Native error:", e);
      resolve(false);
    }
  });
}

// サーバー自動検出
async function detectServer() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1000);
    const res = await fetch(`${LOCAL_SERVER_URL}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      activeServerUrl = LOCAL_SERVER_URL;
      isLocalServerRunning = true;
      elements.serverStatusText.textContent = "● 1080pサーバー準備完了";
      elements.serverStatusText.style.color = "#10b981";
      return true;
    }
  } catch (e) {}

  isLocalServerRunning = false;
  elements.serverStatusText.textContent = "● クリック時に自動起動します";
  elements.serverStatusText.style.color = "#06b6d4";
  return false;
}

// 1. 高画質 (1080p) 変換ハンドラ
async function handleHqConvert() {
  if (!currentVideoUrl) return;

  hideBoxes();
  elements.loadingBox.classList.remove("hidden");
  elements.loadingText.textContent = "1080p変換エンジンを準備中...";
  elements.loadingSubtext.textContent = "※ Chromeが自動起動しています (約3〜5秒)";

  try {
    // サーバーがまだ応答していない場合、Chromeのネイティブ機能で自動起動
    if (!isLocalServerRunning) {
      const booted = await ensureServerViaNative();
      if (booted) {
        isLocalServerRunning = true;
        activeServerUrl = LOCAL_SERVER_URL;
        elements.serverStatusText.textContent = "● 1080pサーバー準備完了";
        elements.serverStatusText.style.color = "#10b981";
      } else {
        const extId = chrome.runtime.id;
        throw new Error(`自動起動エラー: ${lastNativeErrorMessage || "無応答"}。\n※ レジストリを反映させるため、Chromeのアドレスバーに chrome://restart と入力してEnterを押してください。`);
      }
    }

    elements.loadingText.textContent = "1080p高画質ストリームを生成中...";
    elements.loadingSubtext.textContent = "※ 映像と音声を高速結合中 (約3〜5秒)";

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

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
    displayError(`高画質変換エラー: ${err.message}`);
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
