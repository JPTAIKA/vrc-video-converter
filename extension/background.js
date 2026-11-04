// VRChat Video Converter - Background Service Worker (Manifest V3)

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "convert") {
    try {
      chrome.runtime.sendNativeMessage(
        "vrc_video_converter",
        {
          url: request.url,
          mode: request.mode || "hq",
          resolution: request.resolution || "1080",
          start_time: request.start_time || null,
          end_time: request.end_time || null
        },
        (response) => {
          if (chrome.runtime.lastError) {
            sendResponse({
              status: "error",
              detail: `自動起動エラー: ${chrome.runtime.lastError.message}`
            });
          } else if (!response) {
            sendResponse({
              status: "error",
              detail: "ローカルエンジンからの応答がありませんでした。"
            });
          } else {
            sendResponse(response);
          }
        }
      );
    } catch (err) {
      sendResponse({ status: "error", detail: err.message });
    }
    return true; // 非同期レスポンスを維持
  }

  if (request.action === "ping") {
    try {
      chrome.runtime.sendNativeMessage(
        "vrc_video_converter",
        { action: "ping" },
        (response) => {
          if (chrome.runtime.lastError) {
            sendResponse({ status: "error" });
          } else {
            sendResponse(response || { status: "ready" });
          }
        }
      );
    } catch (e) {
      sendResponse({ status: "error" });
    }
    return true;
  }

  // YouTubeタブの公式プレイヤーAPIからライブ配信状態を正確に取得
  if (request.action === "check_is_live") {
    const tabId = sender.tab ? sender.tab.id : request.tabId;
    if (!tabId) {
      sendResponse({ is_live: false });
      return false;
    }
    chrome.scripting.executeScript(
      {
        target: { tabId },
        world: "MAIN",
        func: () => {
          try {
            if (window.location.pathname.startsWith("/shorts/")) return false;
            if (window.location.pathname.startsWith("/live/")) return true;

            const player = document.getElementById("movie_player");
            if (player && typeof player.getVideoData === "function") {
              const data = player.getVideoData();
              if (data && typeof data.isLive === "boolean") {
                return data.isLive;
              }
            }

            if (window.ytInitialPlayerResponse) {
              const vd = window.ytInitialPlayerResponse.videoDetails;
              if (vd) {
                if (vd.isLive === true || vd.isLiveContent === true) return true;
                if (vd.isLiveContent === false) return false;
              }
              const mf = window.ytInitialPlayerResponse.microformat?.playerMicroformatRenderer?.liveBroadcastDetails;
              if (mf && typeof mf.isLiveNow === "boolean") {
                return mf.isLiveNow;
              }
            }
          } catch (e) {}
          return false;
        }
      },
      (results) => {
        if (chrome.runtime.lastError || !results || !results[0]) {
          sendResponse({ is_live: false });
        } else {
          sendResponse({ is_live: !!results[0].result });
        }
      }
    );
    return true;
  }
});
