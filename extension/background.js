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
});
