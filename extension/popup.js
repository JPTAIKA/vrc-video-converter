let currentVideoUrl = null;
let currentVideoId = null;

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

  // ネイティブエンジンの死活確認 (ping)
  pingNativeHost();
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

// ネイティブ連携の疎通確認
function pingNativeHost() {
  try {
    chrome.runtime.sendNativeMessage("vrc_video_converter", { action: "ping" }, (response) => {
      if (chrome.runtime.lastError) {
        elements.serverStatusText.textContent = "▲ レジストリ反映待ち (chrome://restart で再起動)";
        elements.serverStatusText.style.color = "#f59e0b";
      } else if (response && response.status === "ready") {
        elements.serverStatusText.textContent = "● 1080pエンジン自動連動中 (準備完了)";
        elements.serverStatusText.style.color = "#10b981";
      }
    });
  } catch (e) {
    elements.serverStatusText.textContent = "● 1080pエンジン待機中";
    elements.serverStatusText.style.color = "#06b6d4";
  }
}

// 1. 高画質 (1080p) 変換ハンドラ - Native Messagingで完全自動実行
async function handleHqConvert() {
  if (!currentVideoUrl) return;

  hideBoxes();
  elements.loadingBox.classList.remove("hidden");
  elements.loadingText.textContent = "1080p高画質ストリームを生成中...";
  elements.loadingSubtext.textContent = "※ Chromeが裏で自動処理しています (約3〜5秒)";
  elements.btnHqConvert.disabled = true;

  try {
    chrome.runtime.sendNativeMessage(
      "vrc_video_converter",
      { url: currentVideoUrl, mode: "hq" },
      async (response) => {
        elements.loadingBox.classList.add("hidden");
        elements.btnHqConvert.disabled = false;

        if (chrome.runtime.lastError) {
          const err = chrome.runtime.lastError.message;
          displayError(`自動起動エラー: ${err}\n※ レジストリを認識させるため、Chromeのアドレスバーに chrome://restart と入力してEnterを押してください。`);
          return;
        }

        if (!response) {
          displayError("エンジンからの応答がありませんでした。");
          return;
        }

        if (response.status === "success" && response.stream_url) {
          displaySuccess({
            quality: "1080p Full HD (最高画質)",
            stream_url: response.stream_url,
            meta: "※ 1080p高画質ストリームです。VRChatプレイヤーに貼り付けて再生してください！"
          });
          await copyToClipboard(response.stream_url);
        } else {
          displayError(response.detail || "1080p生成に失敗しました。");
        }
      }
    );
  } catch (err) {
    elements.loadingBox.classList.add("hidden");
    elements.btnHqConvert.disabled = false;
    displayError(`エラー: ${err.message}`);
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
