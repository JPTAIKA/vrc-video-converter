let currentVideoUrl = null;
let currentVideoId = null;
let selectedResolution = "1080";

// DOM要素
const elements = {
  notYoutubeAlert: document.getElementById("notYoutubeAlert"),
  youtubeActiveBox: document.getElementById("youtubeActiveBox"),
  videoTitle: document.getElementById("videoTitle"),
  videoUrl: document.getElementById("videoUrl"),
  resBadge: document.getElementById("resBadge"),
  btnResLabel: document.getElementById("btnResLabel"),
  pillBtns: document.querySelectorAll(".pill-btn"),
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
  // 保存された解像度設定を復元
  chrome.storage.local.get(["selectedResolution"], (result) => {
    if (result.selectedResolution) {
      applyResolution(result.selectedResolution);
    }
  });

  // ピルボタンのクリックイベント
  elements.pillBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const res = btn.getAttribute("data-res");
      applyResolution(res);
      chrome.storage.local.set({ selectedResolution: res });
    });
  });

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

// 解像度の適用
function applyResolution(res) {
  selectedResolution = res;
  elements.pillBtns.forEach((b) => {
    if (b.getAttribute("data-res") === res) {
      b.classList.add("active");
    } else {
      b.classList.remove("active");
    }
  });

  const labels = {
    "2160": "4K 超精細 (2160p)",
    "1080": "1080p 最高画質",
    "720": "720p 高画質",
    "480": "480p 標準",
    "360": "360p 軽量"
  };
  const btnLabels = {
    "2160": "4K",
    "1080": "1080p",
    "720": "720p",
    "480": "480p",
    "360": "360p"
  };
  if (elements.resBadge) elements.resBadge.textContent = labels[res] || `${res}p`;
  if (elements.btnResLabel) elements.btnResLabel.textContent = btnLabels[res] || `${res}p`;
}

// 1. 高画質/指定解像度 変換ハンドラ - Native Messagingで完全自動実行
async function handleHqConvert() {
  if (!currentVideoUrl) return;

  const resName = selectedResolution === "2160" ? "4K" : `${selectedResolution}p`;
  hideBoxes();
  elements.loadingBox.classList.remove("hidden");
  elements.loadingText.textContent = `${resName} ストリームを生成中...`;
  elements.loadingSubtext.textContent = `※ ${resName} 映像と音声を高速結合しています (約2〜10秒)`;
  elements.btnHqConvert.disabled = true;

  try {
    chrome.runtime.sendNativeMessage(
      "vrc_video_converter",
      { url: currentVideoUrl, mode: "hq", resolution: selectedResolution },
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
            quality: `${resName} (${response.quality || "VRChat最適化"})`,
            stream_url: response.stream_url,
            meta: `※ ${resName} ストリームです。VRChatプレイヤーに貼り付けて再生してください！`
          });
          await copyToClipboard(response.stream_url);
        } else {
          displayError(response.detail || `${resName} 生成に失敗しました。`);
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
