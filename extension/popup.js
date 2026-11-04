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
  liveAlertBox: document.getElementById("liveAlertBox"),
  timelineHighlight: document.getElementById("timelineHighlight"),
  timelinePlayhead: document.getElementById("timelinePlayhead"),
  sliderStart: document.getElementById("sliderStart"),
  sliderEnd: document.getElementById("sliderEnd"),
  timelineLblStart: document.getElementById("timelineLblStart"),
  timelineLblRange: document.getElementById("timelineLblRange"),
  timelineLblTotal: document.getElementById("timelineLblTotal"),
  timelineSliderBox: document.getElementById("timelineSliderBox"),
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
  let isLive = false;

  if (tab && isYouTubeUrl(tab.url)) {
    currentVideoUrl = tab.url;
    currentVideoId = extractVideoId(tab.url);

    elements.videoTitle.textContent = tab.title || "YouTube Video";
    elements.videoUrl.textContent = tab.url;
    elements.notYoutubeAlert.classList.add("hidden");
    elements.youtubeActiveBox.classList.remove("hidden");

    isLive = await checkIsLiveStreamFromTab();
    if (isLive) {
      if (elements.liveAlertBox) elements.liveAlertBox.classList.remove("hidden");
      elements.btnHqConvert.disabled = true;
      elements.btnCleanConvert.disabled = true;
      elements.clipEnable.disabled = true;
      elements.serverStatusText.textContent = "🔴 ライブ配信中 (変換無効)";
      elements.serverStatusText.style.color = "#ef4444";
    } else {
      if (elements.liveAlertBox) elements.liveAlertBox.classList.add("hidden");
      elements.btnHqConvert.disabled = false;
      elements.btnCleanConvert.disabled = false;
      elements.clipEnable.disabled = false;
    }
  } else {
    elements.notYoutubeAlert.classList.remove("hidden");
    elements.youtubeActiveBox.classList.add("hidden");
    elements.btnHqConvert.disabled = true;
    elements.btnCleanConvert.disabled = true;
  }

  // 区間指定イベント
  if (!isLive) {
    elements.clipEnable.addEventListener("change", async () => {
      if (elements.clipEnable.checked) {
        elements.clipInputsBox.classList.remove("hidden");
        elements.clipBadge.classList.remove("hidden");
        if (!elements.clipStart.value) {
          elements.clipStart.value = await getCurrentPlayerTimeFromTab();
        }
        await setupPopupTimeline();
      } else {
        elements.clipInputsBox.classList.add("hidden");
        elements.clipBadge.classList.add("hidden");
      }
    });

    await setupPopupTimeline();
  }

  // イベント登録
  if (!isLive) {
    elements.btnHqConvert.addEventListener("click", handleHqConvert);
    elements.btnCleanConvert.addEventListener("click", handleCleanConvert);
    pingNativeHost();
  }

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

// ライブ配信判定
async function checkIsLiveStreamFromTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id || !tab.url) return false;

    // Shortsはライブ配信ではない
    if (tab.url.includes("/shorts/")) return false;

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        if (window.location.pathname.startsWith("/shorts/")) return false;
        if (window.location.pathname.startsWith("/live/")) return true;

        // 1. プレイヤー内のライブバッジ確認
        const liveBadge = document.querySelector("#movie_player .ytp-live-badge, .html5-video-player .ytp-live-badge, .ytp-live-badge");
        if (liveBadge) return true;

        // 2. プレイヤー本体およびタイム表示の ytp-live クラス
        const liveEl = document.querySelector("#movie_player.ytp-live, .html5-video-player.ytp-live, .ytp-time-display.ytp-live, .ytp-live");
        if (liveEl) return true;

        // 3. 再生時間インジケーターの「ライブ」表記
        const timeDisplay = document.querySelector(".ytp-time-display");
        if (timeDisplay && timeDisplay.textContent.includes("ライブ")) return true;

        // 4. 視聴数表示の「人が視聴中」判定
        const viewCountEl = document.querySelector("ytd-watch-metadata #view-count, #count.ytd-video-view-count-renderer, #info-text");
        if (viewCountEl && (viewCountEl.textContent.includes("人が視聴中") || viewCountEl.textContent.toLowerCase().includes("watching"))) return true;

        // 5. ライブチャット枠の存在
        const chatFrame = document.querySelector("ytd-live-chat-frame");
        if (chatFrame) return true;

        return false;
      }
    });
    return results && results[0] && results[0].result === true;
  } catch (e) {
    return false;
  }
}

async function getVideoDurationFromTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return 300;
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const activeShort = document.querySelector("ytd-reel-video-renderer[is-active] video");
        const video = activeShort || document.querySelector("#movie_player video, .html5-video-player video") || document.querySelector("video");
        return video && isFinite(video.duration) && video.duration > 0 ? Math.floor(video.duration) : 300;
      }
    });
    return (results && results[0] && typeof results[0].result === "number") ? results[0].result : 300;
  } catch (e) {
    return 300;
  }
}

async function getCurrentVideoSecondsFromTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return 0;
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const activeShort = document.querySelector("ytd-reel-video-renderer[is-active] video");
        const video = activeShort || document.querySelector("#movie_player video, .html5-video-player video") || document.querySelector("video");
        return video && !isNaN(video.currentTime) ? Math.floor(video.currentTime) : 0;
      }
    });
    return (results && results[0] && typeof results[0].result === "number") ? results[0].result : 0;
  } catch (e) {
    return 0;
  }
}

let isPopupTimelineInitialized = false;

async function setupPopupTimeline() {
  if (!elements.sliderStart || !elements.sliderEnd) return;

  const duration = await getVideoDurationFromTab();
  const currentSec = await getCurrentVideoSecondsFromTab();

  elements.sliderStart.max = duration;
  elements.sliderEnd.max = duration;
  if (elements.timelineLblTotal) {
    elements.timelineLblTotal.textContent = formatSecondsToTimestamp(duration);
  }

  if (elements.timelinePlayhead) {
    const playheadPct = duration > 0 ? (currentSec / duration) * 100 : 0;
    elements.timelinePlayhead.style.left = `${Math.min(100, Math.max(0, playheadPct))}%`;
  }

  function getTimes() {
    let s = parseTimeToSeconds(elements.clipStart.value);
    let e = parseTimeToSeconds(elements.clipEnd.value);
    if (s === null) s = 0;
    if (e === null) e = duration;
    s = Math.max(0, Math.min(s, duration));
    e = Math.max(0, Math.min(e, duration));
    if (s >= e) s = Math.max(0, e - 1);
    return { s, e };
  }

  function updateVisuals(s, e) {
    elements.sliderStart.value = s;
    elements.sliderEnd.value = e;
    const leftPct = duration > 0 ? (s / duration) * 100 : 0;
    const widthPct = duration > 0 ? ((e - s) / duration) * 100 : 100;
    if (elements.timelineHighlight) {
      elements.timelineHighlight.style.left = `${leftPct}%`;
      elements.timelineHighlight.style.width = `${widthPct}%`;
    }
    if (elements.timelineLblStart) elements.timelineLblStart.textContent = formatSecondsToTimestamp(s);
    if (elements.timelineLblRange) {
      const rangeSec = e - s;
      elements.timelineLblRange.textContent = `選択: ${formatSecondsToTimestamp(s)} 〜 ${formatSecondsToTimestamp(e)} (${formatSecondsToTimestamp(rangeSec)})`;
    }
  }

  if (!isPopupTimelineInitialized) {
    isPopupTimelineInitialized = true;

    elements.sliderStart.addEventListener("input", () => {
      let s = parseInt(elements.sliderStart.value, 10);
      let e = parseInt(elements.sliderEnd.value, 10);
      if (s >= e) {
        s = Math.max(0, e - 1);
        elements.sliderStart.value = s;
      }
      elements.clipStart.value = formatSecondsToTimestamp(s);
      updateVisuals(s, e);
    });

    elements.sliderEnd.addEventListener("input", () => {
      let s = parseInt(elements.sliderStart.value, 10);
      let e = parseInt(elements.sliderEnd.value, 10);
      if (e <= s) {
        e = Math.min(duration, s + 1);
        elements.sliderEnd.value = e;
      }
      elements.clipEnd.value = formatSecondsToTimestamp(e);
      updateVisuals(s, e);
    });

    elements.clipStart.addEventListener("input", () => {
      const { s, e } = getTimes();
      updateVisuals(s, e);
    });

    elements.clipEnd.addEventListener("input", () => {
      const { s, e } = getTimes();
      updateVisuals(s, e);
    });

    if (elements.timelineSliderBox) {
      elements.timelineSliderBox.addEventListener("mousemove", (ev) => {
        const rect = elements.timelineSliderBox.getBoundingClientRect();
        const clickRatio = (ev.clientX - rect.left) / rect.width;
        const mouseSec = clickRatio * duration;
        const s = parseInt(elements.sliderStart.value, 10);
        const e = parseInt(elements.sliderEnd.value, 10);
        if (Math.abs(mouseSec - s) < Math.abs(mouseSec - e)) {
          elements.sliderStart.style.zIndex = "4";
          elements.sliderEnd.style.zIndex = "3";
        } else {
          elements.sliderEnd.style.zIndex = "4";
          elements.sliderStart.style.zIndex = "3";
        }
      });
    }

    document.querySelectorAll(".btn-step").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.getAttribute("data-target");
        const delta = parseInt(btn.getAttribute("data-delta"), 10);
        let { s, e } = getTimes();
        if (target === "start") {
          s = Math.max(0, Math.min(s + delta, e - 1));
          elements.clipStart.value = formatSecondsToTimestamp(s);
        } else if (target === "end") {
          e = Math.min(duration, Math.max(e + delta, s + 1));
          elements.clipEnd.value = formatSecondsToTimestamp(e);
        }
        updateVisuals(s, e);
      });
    });

    elements.btnSetStart.addEventListener("click", async () => {
      const curr = await getCurrentVideoSecondsFromTab();
      let { s, e } = getTimes();
      s = Math.max(0, Math.min(curr, e - 1));
      elements.clipStart.value = formatSecondsToTimestamp(s);
      updateVisuals(s, e);
    });

    elements.btnSetEnd.addEventListener("click", async () => {
      const curr = await getCurrentVideoSecondsFromTab();
      let { s, e } = getTimes();
      e = Math.min(duration, Math.max(curr, s + 1));
      elements.clipEnd.value = formatSecondsToTimestamp(e);
      updateVisuals(s, e);
    });
  }

  const initial = getTimes();
  updateVisuals(initial.s, initial.e);
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

  const isLive = await checkIsLiveStreamFromTab();
  if (isLive) {
    displayError("現在ライブ配信中の動画は仕様上、変換および区間指定をご利用いただけません。配信終了後のアーカイブ動画にてご利用ください。");
    return;
  }

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

  const isLive = await checkIsLiveStreamFromTab();
  if (isLive) {
    displayError("現在ライブ配信中の動画は仕様上、変換および区間指定をご利用いただけません。配信終了後のアーカイブ動画にてご利用ください。");
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
