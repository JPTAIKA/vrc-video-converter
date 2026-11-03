const DEFAULT_SERVER_URL = "http://localhost:8000";

const elements = {
  serverUrlInput: document.getElementById("serverUrlInput"),
  btnTest: document.getElementById("btnTest"),
  btnSave: document.getElementById("btnSave"),
  saveMessage: document.getElementById("saveMessage"),
  testStatus: document.getElementById("testStatus"),
};

// 初期読み込み
document.addEventListener("DOMContentLoaded", async () => {
  const stored = await chrome.storage.sync.get(["serverUrl"]);
  elements.serverUrlInput.value = stored.serverUrl || DEFAULT_SERVER_URL;

  elements.btnTest.addEventListener("click", testConnection);
  elements.btnSave.addEventListener("click", saveSettings);
});

// 接続テスト
async function testConnection() {
  const url = (elements.serverUrlInput.value || "").trim().replace(/\/+$/, "");
  if (!url) {
    showStatus("サーバーURLを入力してください。", "error");
    return;
  }

  showStatus("接続を確認中...", "");
  try {
    const res = await fetch(`${url}/health`, { method: "GET" });
    if (!res.ok) {
      throw new Error(`HTTPステータス: ${res.status}`);
    }
    const data = await res.json();
    if (data.status === "ok") {
      showStatus("✓ サーバーへの接続に成功しました！正常に稼働しています。", "success");
    } else {
      showStatus("⚠️ サーバーから予期しないレスポンスが返されました。", "error");
    }
  } catch (err) {
    showStatus(`✕ 接続できませんでした: ${err.message}`, "error");
  }
}

// 設定保存
async function saveSettings() {
  const url = (elements.serverUrlInput.value || "").trim().replace(/\/+$/, "");
  await chrome.storage.sync.set({ serverUrl: url });

  elements.saveMessage.classList.remove("hidden");
  setTimeout(() => {
    elements.saveMessage.classList.add("hidden");
  }, 2500);
}

function showStatus(message, type) {
  elements.testStatus.textContent = message;
  elements.testStatus.className = "test-status";
  if (type) {
    elements.testStatus.classList.add(type);
  } else {
    elements.testStatus.style.background = "#1e293b";
    elements.testStatus.style.color = "#94a3b8";
  }
  elements.testStatus.classList.remove("hidden");
}
