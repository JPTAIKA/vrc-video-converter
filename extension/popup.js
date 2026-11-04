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
  clipEnable: document.getElementById("clipEnable"),
  clipInputsBox: document.getElementById("clipInputsBox"),
  clipBadge: document.getElementById("clipBadge"),
  clipStart: document.getElementById("clipStart"),
  clipEnd: document.getElementById("clipEnd"),
  btnSetStart: document.getElementById("btnSetStart"),
  btnSetEnd: document.getElementById("btnSetEnd"),
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

  // 区間指定イベント
  elements.clipEnable.addEventListener("change", async () => {
    if (elements.clipEnable.checked) {
      elements.clipInputsBox.classList.remove("hidden");
      elements.clipBadge.classList.remove("hidden");
      if (!elements.clipStart.value) {
        elements.clipStart.value = await getCurrentPlayerTimeFromTab();
      }
    } else {
      elements.clipInputsBox.classList.add("hidden");
      elements.clipBadge.classList.add("hidden");
    }
  });

  elements.btnSetStart.addEventListener("click", async () => {
    elements.clipStart.value = await getCurrentPlayerTimeFromTab();
  });

  elements.btnSetEnd.addEventListener("click", async () => {
    elements.clipEnd.value = await getCurrentPlayerTimeFromTab();
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

// 動画再生位置 (MM:SS または HH:MM:SS) をタブ内のvideoタグから取得
async function getCurrentPlayerTimeFromTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return "00:00";
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const video = document.querySelector("video");
        return video && !isNaN(video.currentTime) ? Math.floor(video.currentTime) : 0;
      }
    });
    if (results && results[0] && typeof results[0].result === "number") {
      return formatSecondsToTimestamp(results[0].result);
    }
  } catch (e) {
    console.warn("動画再生位置の取得に失敗しました:", e);
  }
  return "00:00";
}

function formatSecondsToTimestamp(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function parseTimeToSeconds(val) {
  if (!val) return null;
  val = String(val).trim();
  if (val.includes(":")) {
    const parts = val.split(":").map(p => parseInt(p.trim(), 10)).filter(n => !isNaN(n));
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return null;
  }
  const n = parseInt(val, 10);
  return isNaN(n) ? null : n;
}

function getClipTimes() {
  if (!elements.clipEnable || !elements.clipEnable.checked) {
    return { startTime: null, endTime: null, enabled: false };
  }
  const startVal = elements.clipStart ? elements.clipStart.value.trim() : null;
  const endVal = elements.clipEnd ? elements.clipEnd.value.trim() : null;
  return { startTime: startVal || null, endTime: endVal || null, enabled: true };
}

function formatClipLabel(startSec, endSec) {
  const s = startSec !== null && startSec !== undefined ? formatSecondsToTimestamp(startSec) : "00:00";
  const e = endSec !== null && endSec !== undefined ? formatSecondsToTimestamp(endSec) : "末尾";
  return `${s} 〜 ${e}`;
}

// 1. 高画質/指定解像度 変換ハンドラ - Native Messagingで完全自動実行
async function handleHqConvert() {
  if (!currentVideoUrl) return;

  const resName = selectedResolution === "2160" ? "4K" : `${selectedResolution}p`;
  const clip = getClipTimes();

  let loadingMsg = `${resName} ストリームを生成中...`;
  let loadingSub = `※ ${resName} 映像と音声を高速結合しています (約2〜10秒)`;
  if (clip.enabled) {
    const sStr = clip.startTime || "00:00";
    const eStr = clip.endTime || "末尾";
    loadingMsg = `${resName} 区間切り出し中 (${sStr}〜${eStr})...`;
    loadingSub = `※ 指定区間のみを高速抽出・結合しています (約2〜5秒)`;
  }

  hideBoxes();
  elements.loadingBox.classList.remove("hidden");
  elements.loadingText.textContent = loadingMsg;
  elements.loadingSubtext.textContent = loadingSub;
  elements.btnHqConvert.disabled = true;

  try {
    chrome.runtime.sendNativeMessage(
      "vrc_video_converter",
      {
        url: currentVideoUrl,
        mode: "hq",
        resolution: selectedResolution,
        start_time: clip.startTime,
        end_time: clip.endTime
      },
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
          let qualityLabel = `${resName} (${response.quality || "VRChat最適化"})`;
          let metaNote = `※ ${resName} ストリームです。VRChatプレイヤーに貼り付けて再生してください！`;

          if (response.clipped || clip.enabled) {
            const clipRange = formatClipLabel(response.start_sec, response.end_sec);
            qualityLabel = `${resName} クリップ [${clipRange}]`;
            metaNote = `※ 指定区間 (${clipRange}) を高速切り出したVRChat用ストリームです。`;
          }

          displaySuccess({
            quality: qualityLabel,
            stream_url: response.stream_url,
            meta: metaNote
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
  const clip = getClipTimes();
  let cleanUrl = `https://www.youtube.com/watch?v=${currentVideoId}`;
  let clipNote = "※ 余計なパラメータを除去した標準形式です。ワールド内の全員が正常に視聴できます。";
  let qualityBadge = "VRChat標準 (全員同期)";

  if (clip.enabled && clip.startTime) {
    const startSec = parseTimeToSeconds(clip.startTime);
    if (startSec !== null && startSec > 0) {
      cleanUrl += `&t=${startSec}s`;
      qualityBadge = `通常リンク (開始: ${formatSecondsToTimestamp(startSec)})`;
      clipNote = `※ 開始位置 (${formatSecondsToTimestamp(startSec)}〜) を付与した標準YouTubeリンクです。`;
    }
  }

  displaySuccess({
    quality: qualityBadge,
    stream_url: cleanUrl,
    meta: clipNote
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
