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

  // YouTubeタブの公式プレイヤーAPIおよびメタデータからライブ配信状態を正確に取得
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

            // 1. duration または endDate が存在すれば録画・プレミア公開終了済み・アーカイブ
            const durationMeta = document.querySelector('meta[itemprop="duration"]');
            if (durationMeta && durationMeta.getAttribute("content")) return false;

            const endDateMeta = document.querySelector('meta[itemprop="endDate"]');
            if (endDateMeta && endDateMeta.getAttribute("content")) return false;

            // 2. YouTube公式プレイヤーAPI
            const player = document.getElementById("movie_player");
            if (player) {
              if (typeof player.getVideoData === "function") {
                const data = player.getVideoData();
                if (data && typeof data.isLive === "boolean") {
                  return data.isLive;
                }
              }
              if (player.classList.contains("ytp-live") || player.querySelector(".ytp-live-badge")) {
                return true;
              }
            }

            // 3. 生配信メタタグ (endDateが存在しない場合)
            const liveBroadcastMeta = document.querySelector('meta[itemprop="isLiveBroadcast"][content="True"]');
            if (liveBroadcastMeta) return true;

            // 4. YouTube内部レスポンス
            if (window.ytInitialPlayerResponse) {
              const vd = window.ytInitialPlayerResponse.videoDetails;
              if (vd) {
                if (vd.isLive === true) return true;
                if (vd.isLiveContent === false) return false;
              }
              const mf = window.ytInitialPlayerResponse.microformat?.playerMicroformatRenderer?.liveBroadcastDetails;
              if (mf && typeof mf.isLiveNow === "boolean") {
                return mf.isLiveNow;
              }
            }

            // 5. videoタグのduration判定
            const video = document.querySelector("#movie_player video, video");
            if (video && (video.duration === Infinity || isNaN(video.duration))) {
              return true;
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
    return true; // 非同期レスポンスを維持
  }
});
