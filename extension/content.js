// VRChat Video Converter - YouTube Player In-Bar Integration

let selectedResolution = "1080";
let inPlayerPopup = null;

// 初期化
function init() {
  injectVrcButton();
  loadSavedResolution();
}

// 保存された解像度設定を復元
function loadSavedResolution() {
  if (chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(["selectedResolution"], (result) => {
      if (result && result.selectedResolution) {
        selectedResolution = result.selectedResolution;
        updatePillsUI();
      }
    });
  }
}

// 再生バーの右側アイコン一覧の先頭（一番左）にVRCボタンを挿入
function injectVrcButton() {
  const rightControls = document.querySelector(".ytp-right-controls");
  if (!rightControls) return;

  let btn = document.getElementById("vrc-player-button");
  if (!btn) {
    btn = document.createElement("button");
    btn.id = "vrc-player-button";
    btn.className = "ytp-button vrc-player-button";
    btn.setAttribute("aria-label", "VRChat リンク変換 (4K/1080p)");
    btn.setAttribute("title", "VRChat リンク変換 (4K/1080p)");
    // VRChat公式フキダシ形状ロゴ (32x32完全準拠・内部ブルー版)
    btn.innerHTML = `
      <svg height="32" width="32" viewBox="0 0 32 32" version="1.1">
        <path d="M 5.5 5 L 26.5 5 A 3 3 0 0 1 29.5 8 L 29.5 18 A 3 3 0 0 1 26.5 21 L 25.5 21 L 27.5 25.5 L 21.5 21 L 5.5 21 A 3 3 0 0 1 2.5 18 L 2.5 8 A 3 3 0 0 1 5.5 5 Z" 
              fill="#0284c7" 
              stroke="#000000" 
              stroke-width="1.6" 
              stroke-linejoin="round"
              style="filter: drop-shadow(0.8px 1px 0px #000000);" />
        <text x="16" y="13" 
              dominant-baseline="central"
              text-anchor="middle"
              font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" 
              font-size="9.5" 
              font-weight="900" 
              fill="#ffffff" 
              letter-spacing="0.4">VRC</text>
      </svg>
    `;

    // クリックでインプレーヤーポップアップを開閉
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleInPlayerPopup();
    });
  }

  // 右側のアイコン一覧（自動再生、字幕、歯車等）の「一番左（先頭）」に配置
  if (rightControls.firstChild !== btn) {
    rightControls.insertBefore(btn, rightControls.firstChild);
  }
}

// ポップアップの開閉
function toggleInPlayerPopup() {
  if (inPlayerPopup && inPlayerPopup.parentNode) {
    closePopup();
  } else {
    openPopup();
  }
}

function openPopup() {
  const player = document.getElementById("movie_player") || document.querySelector(".html5-video-player");
  const btn = document.getElementById("vrc-player-button");
  if (!player) return;

  // 既存があれば削除
  closePopup();

  inPlayerPopup = document.createElement("div");
  inPlayerPopup.id = "vrc-inplayer-popup";

  // ボタンの位置に合わせてポップアップの右位置を動的調整
  if (btn) {
    const btnRect = btn.getBoundingClientRect();
    const playerRect = player.getBoundingClientRect();
    const rightOffset = playerRect.right - btnRect.right - 10;
    inPlayerPopup.style.right = `${Math.max(12, Math.round(rightOffset))}px`;
  }

  const resName = selectedResolution === "2160" ? "4K" : `${selectedResolution}p`;
  const meta = getCurrentVideoMeta();

  inPlayerPopup.innerHTML = `
    <div class="vrc-popup-header">
      <div class="vrc-header-title-box">
        <span class="vrc-logo-badge">VRC 1080p/4K</span>
        <span class="vrc-popup-title">動画リンク変換</span>
      </div>
      <button class="vrc-btn-close" id="vrc-close-popup" title="閉じる">✕</button>
    </div>

    <!-- 現在の動画情報カード -->
    <div class="vrc-video-card">
      <div class="vrc-section-label">現在の動画</div>
      <div class="vrc-video-title" title="${escapeHtml(meta.title)}">${escapeHtml(meta.title)}</div>
      <div class="vrc-video-url" title="${escapeHtml(meta.url)}">${escapeHtml(meta.url)}</div>
    </div>

    <!-- 画質選択エリア -->
    <div class="vrc-res-section">
      <div class="vrc-res-header-row">
        <span class="vrc-res-label">画質を選択</span>
        <span class="vrc-res-badge" id="vrc-badge-label">${getBadgeLabel(selectedResolution)}</span>
      </div>
      <div class="vrc-pills-row">
        <button type="button" class="vrc-pill-btn ${selectedResolution === '2160' ? 'active' : ''}" data-res="2160">
          <span class="vrc-pill-title">4K</span>
          <span class="vrc-pill-sub">超精細</span>
        </button>
        <button type="button" class="vrc-pill-btn ${selectedResolution === '1080' ? 'active' : ''}" data-res="1080">
          <span class="vrc-pill-title">1080p</span>
          <span class="vrc-pill-sub">FHD</span>
        </button>
        <button type="button" class="vrc-pill-btn ${selectedResolution === '720' ? 'active' : ''}" data-res="720">
          <span class="vrc-pill-title">720p</span>
          <span class="vrc-pill-sub">HD</span>
        </button>
        <button type="button" class="vrc-pill-btn ${selectedResolution === '480' ? 'active' : ''}" data-res="480">
          <span class="vrc-pill-title">480p</span>
          <span class="vrc-pill-sub">SD</span>
        </button>
        <button type="button" class="vrc-pill-btn ${selectedResolution === '360' ? 'active' : ''}" data-res="360">
          <span class="vrc-pill-title">360p</span>
          <span class="vrc-pill-sub">軽量</span>
        </button>
      </div>
    </div>

    <!-- アクションボタンエリア -->
    <div class="vrc-actions-box">
      <button type="button" class="vrc-action-btn vrc-btn-primary" id="vrc-btn-convert">
        <span class="vrc-btn-icon">🚀</span>
        <div class="vrc-btn-text">
          <span class="vrc-btn-title" id="vrc-btn-res-title">${resName} 変換してコピー</span>
          <span class="vrc-btn-desc">高画質・映像+音声多重化ストリーム</span>
        </div>
      </button>

      <button type="button" class="vrc-action-btn vrc-btn-secondary" id="vrc-btn-clean">
        <span class="vrc-btn-icon">🌐</span>
        <div class="vrc-btn-text">
          <span class="vrc-btn-title">通常リンク (全員同期)</span>
          <span class="vrc-btn-desc">Public部屋向け・標準YouTubeリンク</span>
        </div>
      </button>
    </div>

    <!-- 結果・ステータス動的表示エリア -->
    <div id="vrc-dynamic-area"></div>

    <!-- フッター (サーバー状態) -->
    <div class="vrc-popup-footer">
      <span id="vrc-server-status" class="vrc-server-status">● サーバー確認中...</span>
      <span class="vrc-footer-tag">VRChat 1080p/4K</span>
    </div>
  `;

  // イベント登録
  inPlayerPopup.querySelector("#vrc-close-popup").addEventListener("click", closePopup);

  // ピル切り替え
  const pills = inPlayerPopup.querySelectorAll(".vrc-pill-btn");
  pills.forEach((p) => {
    p.addEventListener("click", () => {
      const res = p.getAttribute("data-res");
      setResolution(res);
    });
  });

  // 高画質変換
  inPlayerPopup.querySelector("#vrc-btn-convert").addEventListener("click", handleConvertHq);

  // 通常リンクコピー
  inPlayerPopup.querySelector("#vrc-btn-clean").addEventListener("click", handleCopyClean);

  // サーバー死活確認
  pingServer();

  // プレイヤー内に配置
  player.appendChild(inPlayerPopup);

  // ポップアップ内クリックがプレイヤーに伝播して再生/停止するのを防止
  inPlayerPopup.addEventListener("click", (e) => e.stopPropagation());
  inPlayerPopup.addEventListener("mousedown", (e) => e.stopPropagation());
}

// 現在の動画メタ情報を取得
function getCurrentVideoMeta() {
  let title = "";
  const titleEl = document.querySelector("h1.ytd-watch-metadata yt-formatted-string") ||
                  document.querySelector("h1.title yt-formatted-string") ||
                  document.querySelector(".ytp-title-link");
  if (titleEl && titleEl.textContent) {
    title = titleEl.textContent.trim();
  } else {
    title = document.title.replace(/ - YouTube$/, "").trim() || "YouTube Video";
  }
  const url = window.location.href;
  return { title, url };
}

// サーバー状態確認
function pingServer() {
  chrome.runtime.sendMessage({ action: "ping" }, (response) => {
    const statusEl = inPlayerPopup ? inPlayerPopup.querySelector("#vrc-server-status") : null;
    if (statusEl) {
      if (response && response.status === "ok") {
        statusEl.textContent = response.tunnel_url ? "● サーバー稼働中 (トンネル接続済み)" : "● サーバー稼働中 (ローカル8000)";
        statusEl.style.color = "#10b981";
      } else {
        statusEl.textContent = "● サーバー未検出";
        statusEl.style.color = "#f59e0b";
      }
    }
  });
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function closePopup() {
  if (inPlayerPopup && inPlayerPopup.parentNode) {
    inPlayerPopup.parentNode.removeChild(inPlayerPopup);
    inPlayerPopup = null;
  }
}

// 解像度ラベル取得
function getBadgeLabel(res) {
  const map = {
    "2160": "4K 超精細 (2160p)",
    "1080": "1080p 最高画質",
    "720": "720p 高画質",
    "480": "480p 標準",
    "360": "360p 軽量"
  };
  return map[res] || `${res}p`;
}

// 解像度変更
function setResolution(res) {
  selectedResolution = res;
  if (chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({ selectedResolution: res });
  }
  updatePillsUI();
}

function updatePillsUI() {
  if (!inPlayerPopup) return;

  const resName = selectedResolution === "2160" ? "4K" : `${selectedResolution}p`;
  const badge = inPlayerPopup.querySelector("#vrc-badge-label");
  const btnTitle = inPlayerPopup.querySelector("#vrc-btn-res-title");
  const pills = inPlayerPopup.querySelectorAll(".vrc-pill-btn");

  if (badge) badge.textContent = getBadgeLabel(selectedResolution);
  if (btnTitle) btnTitle.textContent = `${resName} 変換してコピー`;

  pills.forEach((p) => {
    if (p.getAttribute("data-res") === selectedResolution) {
      p.classList.add("active");
    } else {
      p.classList.remove("active");
    }
  });
}

// 高画質変換処理
async function handleConvertHq() {
  const dynamicArea = inPlayerPopup.querySelector("#vrc-dynamic-area");
  const btnConvert = inPlayerPopup.querySelector("#vrc-btn-convert");
  const resName = selectedResolution === "2160" ? "4K" : `${selectedResolution}p`;

  btnConvert.disabled = true;
  dynamicArea.innerHTML = `
    <div class="vrc-status-box">
      <div class="vrc-spinner"></div>
      <span class="vrc-status-text">${resName} 高画質ストリームを生成中... (約2〜5秒)</span>
    </div>
  `;

  try {
    chrome.runtime.sendMessage(
      {
        action: "convert",
        url: window.location.href,
        mode: "hq",
        resolution: selectedResolution
      },
      async (response) => {
        btnConvert.disabled = false;

        if (!response || response.status === "error") {
          const errDetail = response ? response.detail : "サーバーから応答がありませんでした。";
          dynamicArea.innerHTML = `
            <div class="vrc-error-box">
              ⚠️ ${errDetail}
            </div>
          `;
          return;
        }

        if (response.status === "success" && response.stream_url) {
          await copyToClipboard(response.stream_url);
          dynamicArea.innerHTML = `
            <div class="vrc-result-box">
              <div class="vrc-result-header">
                <span class="vrc-success-badge">✓ コピー完了</span>
                <span class="vrc-quality-label">${resName} (${response.quality || "VRChat最適化"})</span>
              </div>
              <div class="vrc-result-msg">VRChat内の動画プレイヤーにペーストしてください！</div>
              <div class="vrc-url-copy-box">
                <input type="text" class="vrc-url-input" id="vrc-result-input" readonly value="${escapeHtml(response.stream_url)}">
                <button type="button" class="vrc-btn-copy-small" id="vrc-btn-recopy">コピー</button>
              </div>
              <div class="vrc-result-meta">※ AVPro Video (VRChat) 互換ストリーム | Cloudflareトンネル経由</div>
            </div>
          `;

          const input = dynamicArea.querySelector("#vrc-result-input");
          const copyBtn = dynamicArea.querySelector("#vrc-btn-recopy");
          if (input) {
            input.addEventListener("click", () => input.select());
          }
          if (copyBtn && input) {
            copyBtn.addEventListener("click", async () => {
              await copyToClipboard(input.value);
              copyBtn.textContent = "済!";
              setTimeout(() => { if (copyBtn) copyBtn.textContent = "コピー"; }, 1500);
            });
          }
        }
      }
    );
  } catch (err) {
    btnConvert.disabled = false;
    dynamicArea.innerHTML = `
      <div class="vrc-error-box">
        ⚠️ エラー: ${err.message}
      </div>
    `;
  }
}

// 通常リンクコピー処理
async function handleCopyClean() {
  const dynamicArea = inPlayerPopup.querySelector("#vrc-dynamic-area");
  const videoId = extractVideoId(window.location.href);

  if (!videoId) {
    dynamicArea.innerHTML = `
      <div class="vrc-error-box">
        ⚠️ 動画IDを取得できませんでした。
      </div>
    `;
    return;
  }

  const cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;
  await copyToClipboard(cleanUrl);

  dynamicArea.innerHTML = `
    <div class="vrc-result-box">
      <div class="vrc-result-header">
        <span class="vrc-success-badge">✓ コピー完了</span>
        <span class="vrc-quality-label">通常リンク (全員同期)</span>
      </div>
      <div class="vrc-result-msg">Publicインスタンス等で全員に同期されます。</div>
      <div class="vrc-url-copy-box">
        <input type="text" class="vrc-url-input" id="vrc-clean-result-input" readonly value="${escapeHtml(cleanUrl)}">
        <button type="button" class="vrc-btn-copy-small" id="vrc-clean-btn-recopy">コピー</button>
      </div>
      <div class="vrc-result-meta">※ 余計なパラメータを除去した標準YouTubeリンクです。</div>
    </div>
  `;

  const input = dynamicArea.querySelector("#vrc-clean-result-input");
  const copyBtn = dynamicArea.querySelector("#vrc-clean-btn-recopy");
  if (input) {
    input.addEventListener("click", () => input.select());
  }
  if (copyBtn && input) {
    copyBtn.addEventListener("click", async () => {
      await copyToClipboard(input.value);
      copyBtn.textContent = "済!";
      setTimeout(() => { if (copyBtn) copyBtn.textContent = "コピー"; }, 1500);
    });
  }
}

// クリップボードコピー
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    // フォールバック
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }
}

// 動画IDの抽出
function extractVideoId(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.toLowerCase() === "youtu.be") {
      return parsed.pathname.slice(1).split("?")[0].split("/")[0];
    }
    if (parsed.pathname.startsWith("/shorts/")) {
      return parsed.pathname.replace("/shorts/", "").split("?")[0].split("/")[0];
    }
    return parsed.searchParams.get("v");
  } catch {
    return null;
  }
}

// 外部クリックでポップアップを閉じる
document.addEventListener("click", (e) => {
  const btn = document.getElementById("vrc-player-button");
  if (inPlayerPopup && !inPlayerPopup.contains(e.target) && (!btn || !btn.contains(e.target))) {
    closePopup();
  }
});

// ESCキーでポップアップを閉じる
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && inPlayerPopup) {
    closePopup();
  }
});

// YouTube SPA ページ遷移イベントを監視
window.addEventListener("yt-navigate-finish", () => {
  setTimeout(injectVrcButton, 400);
});

// DOMの変更を監視して再生バーが現れたらボタンを挿入 (常に一番左を維持)
const observer = new MutationObserver(() => {
  const rightControls = document.querySelector(".ytp-right-controls");
  const btn = document.getElementById("vrc-player-button");
  if (rightControls) {
    if (!btn || rightControls.firstChild !== btn) {
      injectVrcButton();
    }
  }
});

observer.observe(document.body, { childList: true, subtree: true });

// 初期実行
init();
