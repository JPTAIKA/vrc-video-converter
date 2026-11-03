// デフォルトのバックエンドAPI URL (Render無料ホスト等)
const DEFAULT_SERVER_URL = "https://vrc-video-converter.onrender.com";

let currentTabId = null;
let currentVideoUrl = null;
let currentVideoId = null;
let serverBaseUrl = DEFAULT_SERVER_URL;

// DOM要素
const elements = {
  notYoutubeAlert: document.getElementById("notYoutubeAlert"),
  youtubeActiveBox: document.getElementById("youtubeActiveBox"),
  videoTitle: document.getElementById("videoTitle"),
  videoUrl: document.getElementById("videoUrl"),
  btnCleanConvert: document.getElementById("btnCleanConvert"),
  btnStreamExtract: document.getElementById("btnStreamExtract"),
  btnHqConvert: document.getElementById("btnHqConvert"),
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
  // 保存されたサーバーURLの読み込み
  try {
    const stored = await chrome.storage.sync.get(["serverUrl"]);
    if (stored.serverUrl) {
      serverBaseUrl = stored.serverUrl.replace(/\/+$/, "");
    }
  } catch (e) {
    console.warn("Storage access failed, using default:", e);
  }

  // サーバーの疎通確認 (バックグラウンドで非同期実行)
  checkServerHealth();

  // 現在のアクティブタブを取得
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && isYouTubeUrl(tab.url)) {
    currentTabId = tab.id;
    currentVideoUrl = tab.url;
    currentVideoId = extractVideoId(tab.url);

    elements.videoTitle.textContent = tab.title || "YouTube Video";
    elements.videoUrl.textContent = tab.url;
    elements.notYoutubeAlert.classList.add("hidden");
    elements.youtubeActiveBox.classList.remove("hidden");
    elements.btnCleanConvert.disabled = false;
    elements.btnStreamExtract.disabled = false;
    elements.btnHqConvert.disabled = false;
  } else {
    elements.notYoutubeAlert.classList.remove("hidden");
    elements.youtubeActiveBox.classList.add("hidden");
    elements.btnCleanConvert.disabled = true;
    elements.btnStreamExtract.disabled = true;
    elements.btnHqConvert.disabled = true;
  }

  // ボタンイベント登録
  elements.btnCleanConvert.addEventListener("click", handleCleanConvert);
  elements.btnStreamExtract.addEventListener("click", handleStreamExtract);
  elements.btnHqConvert.addEventListener("click", handleHqConvert);
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

// サーバー稼働状態チェック (オプション)
async function checkServerHealth() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${serverBaseUrl}/health`, { method: "GET", signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      elements.serverStatusText.textContent = `● クラウドサーバー接続済 (${new URL(serverBaseUrl).hostname})`;
      elements.serverStatusText.style.color = "#10b981";
    } else {
      throw new Error();
    }
  } catch {
    elements.serverStatusText.textContent = "● 拡張機能単体モード (サーバー起動不要)";
    elements.serverStatusText.style.color = "#06b6d4";
  }
}

// 1. VRChat標準リンク変換 (全員視聴用・サーバー不要)
async function handleCleanConvert() {
  if (!currentVideoId) {
    displayError("動画IDを検出できませんでした。YouTubeの再生ページで再度お試しください。");
    return;
  }

  hideBoxes();
  // VRChatの動画プレイヤーで一番安定して全員に同期される正規URL
  const cleanUrl = `https://www.youtube.com/watch?v=${currentVideoId}`;

  displaySuccess({
    quality: "VRChat標準 (全員同期)",
    stream_url: cleanUrl,
    meta: "※ 余計なパラメータを除去した標準形式です。ワールド内の全員が正常に視聴できます。"
  });

  await copyToClipboard(cleanUrl);
}

// 2. 直結ストリーム (MP4) 抽出 (403・Bot拒否回避用・サーバー不要)
async function handleStreamExtract() {
  if (!currentTabId) {
    displayError("対象のYouTubeタブが見つかりません。");
    return;
  }

  hideBoxes();
  elements.loadingBox.classList.remove("hidden");
  elements.loadingText.textContent = "YouTubeページから直接ストリームを抽出中...";
  elements.loadingSubtext.textContent = "※ ブラウザ内で完結するため外部サーバーは使用しません";

  try {
    // アクティブなYouTubeタブのJavaScript環境で実行
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: currentTabId },
      world: "MAIN",
      func: pageExtractScript
    });

    const data = result?.result;
    if (!data || !data.success) {
      throw new Error(data?.error || "ストリームの抽出に失敗しました。");
    }

    let targetUrl = null;
    let targetQuality = "直結ストリーム";
    let metaNote = "";

    // 1. 直結MP4 (itag 22: 720p または itag 18: 360p)
    if (data.mp4Streams && data.mp4Streams.length > 0) {
      // 720p優先、無ければ先頭
      const bestMp4 = data.mp4Streams.find(s => s.itag === 22) || data.mp4Streams[0];
      targetUrl = bestMp4.url;
      targetQuality = `直結 MP4 (${bestMp4.quality || "720p"})`;
      metaNote = "※ YouTubeのBot制限を回避する直接ストリームです。外部サーバー不要で抽出しました。";
    } else if (data.hlsUrl) {
      // 2. HLS Manifest (.m3u8)
      targetUrl = data.hlsUrl;
      targetQuality = "直結 HLS (.m3u8)";
      metaNote = "※ VRChat (AVPro) 対応のHLSストリームです。";
    }

    if (targetUrl) {
      displaySuccess({
        quality: targetQuality,
        stream_url: targetUrl,
        meta: metaNote
      });
      await copyToClipboard(targetUrl);
    } else {
      // 直結URLが署名暗号化(cipher)されている場合の安全なフォールバック
      const cleanUrl = `https://www.youtube.com/watch?v=${currentVideoId || data.videoId}`;
      displaySuccess({
        quality: "VRChat標準 (フォールバック)",
        stream_url: cleanUrl,
        meta: "※ 直結URLはYouTube側で保護されているため、VRChat最適化URLをコピーしました。"
      });
      await copyToClipboard(cleanUrl);
    }

  } catch (err) {
    // エラー時でも標準URLにフォールバックしてユーザーの手を止めない
    if (currentVideoId) {
      const cleanUrl = `https://www.youtube.com/watch?v=${currentVideoId}`;
      displaySuccess({
        quality: "VRChat標準 (フォールバック)",
        stream_url: cleanUrl,
        meta: `※ ストリーム直接抽出 (${err.message}) のため、VRChat標準URLをコピーしました。`
      });
      await copyToClipboard(cleanUrl);
    } else {
      displayError(err.message || "ストリームの抽出に失敗しました。");
    }
  } finally {
    elements.loadingBox.classList.add("hidden");
  }
}

// YouTubeタブのMAINワールドで実行される抽出コード
function pageExtractScript() {
  try {
    let pr = null;

    // 1. YouTubeのプレイヤーAPIから取得
    const player = document.getElementById("movie_player");
    if (player && typeof player.getPlayerResponse === "function") {
      pr = player.getPlayerResponse();
    }

    // 2. グローバル変数から取得
    if (!pr && window.ytInitialPlayerResponse) {
      pr = window.ytInitialPlayerResponse;
    }

    // 3. scriptタグのテキストから取得 (フォールバック)
    if (!pr || !pr.streamingData) {
      const scripts = document.querySelectorAll("script");
      for (const s of scripts) {
        if (s.textContent && s.textContent.includes("ytInitialPlayerResponse")) {
          const match = s.textContent.match(/ytInitialPlayerResponse\s*=\s*({.+?});/);
          if (match) {
            try {
              pr = JSON.parse(match[1]);
              break;
            } catch (e) {}
          }
        }
      }
    }

    if (!pr || !pr.streamingData) {
      return { success: false, error: "動画のストリーミング情報が見つかりませんでした。" };
    }

    const sd = pr.streamingData;
    const mp4Streams = [];

    // 音声+映像結合済みのMP4 (formats)
    if (Array.isArray(sd.formats)) {
      for (const f of sd.formats) {
        if (f.url) {
          mp4Streams.push({
            itag: f.itag,
            quality: f.qualityLabel || `${f.height}p`,
            mimeType: f.mimeType,
            url: f.url
          });
        }
      }
    }

    return {
      success: true,
      title: pr.videoDetails?.title || document.title,
      videoId: pr.videoDetails?.videoId,
      mp4Streams: mp4Streams,
      hlsUrl: sd.hlsManifestUrl || null
    };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// 3. 高画質モード (Renderサーバー経由 / 1080p)
async function handleHqConvert() {
  if (!currentVideoUrl) return;

  hideBoxes();
  elements.loadingBox.classList.remove("hidden");
  elements.loadingText.textContent = "高画質 (1080p) を生成中... (約15〜30秒)";
  elements.loadingSubtext.textContent = "※ クラウドサーバーで映像と音声を結合しています";

  try {
    const res = await fetch(`${serverBaseUrl}/api/convert`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        url: currentVideoUrl,
        mode: "hq"
      })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.detail || `サーバーエラー (${res.status})`);
    }

    displaySuccess({
      quality: data.quality || "1080p High Quality",
      stream_url: data.stream_url,
      meta: `※ クラウドサーバーの一時MP4です（約${Math.round((data.expires_in || 3600) / 60)}分後に自動消去されます）。`
    });

    await copyToClipboard(data.stream_url);

  } catch (err) {
    displayError(err.message || "高画質変換に失敗しました。サーバーがスリープ中の可能性があります。");
  } finally {
    elements.loadingBox.classList.add("hidden");
  }
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
