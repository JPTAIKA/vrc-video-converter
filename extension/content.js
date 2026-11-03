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
    // VRChat公式のフキダシ形状ロゴ (内部をホワイトから鮮やかなブルーにした特製バージョン)
    btn.innerHTML = `
      <svg height="100%" version="1.1" viewBox="0 0 36 36" width="100%">
        <path d="M 8.5 10 L 27.5 10 A 3 3 0 0 1 30.5 13 L 30.5 20.5 A 3 3 0 0 1 27.5 23.5 L 26 23.5 L 28.2 27.5 L 22.5 23.5 L 8.5 23.5 A 3 3 0 0 1 5.5 20.5 L 5.5 13 A 3 3 0 0 1 8.5 10 Z" 
              fill="#0284c7" 
              stroke="#000000" 
              stroke-width="1.8" 
              stroke-linejoin="round"
              style="filter: drop-shadow(0.8px 1.2px 0px #000000);" />
        <text x="17.2" y="19.5" 
              font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" 
              font-size="8.8" 
              font-weight="900" 
              fill="#ffffff" 
              text-anchor="middle" 
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

  inPlayerPopup.innerHTML = `
    <div class="vrc-popup-header">
      <div class="vrc-header-title-box">
        <span class="vrc-logo-badge">VRC 1080p/4K</span>
        <span class="vrc-popup-title">リンク変換</span>
      </div>
      <button class="vrc-btn-close" id="vrc-close-popup" title="閉じる">✕</button>
    </div>

    <!-- 画質選択 -->
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

    <!-- アクションボタン -->
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

    <div id="vrc-dynamic-area"></div>
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

  // プレイヤー内に配置
  player.appendChild(inPlayerPopup);

  // ポップアップ内クリックがプレイヤーに伝播して再生/停止するのを防止
  inPlayerPopup.addEventListener("click", (e) => e.stopPropagation());
  inPlayerPopup.addEventListener("mousedown", (e) => e.stopPropagation());
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
              <div class="vrc-result-header">✓ コピー完了 (${resName})</div>
              <div class="vrc-result-msg">VRChat内のプレイヤーにペーストしてください！</div>
            </div>
          `;
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
      <div class="vrc-result-header">✓ 通常リンクをコピー完了</div>
      <div class="vrc-result-msg">Publicインスタンス等で全員に同期されます。</div>
    </div>
  `;
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

// DOMの変更を監視して再生バーが現れたらボタンを挿入
const observer = new MutationObserver(() => {
  if (!document.getElementById("vrc-player-button") && document.querySelector(".ytp-right-controls")) {
    injectVrcButton();
  }
});

observer.observe(document.body, { childList: true, subtree: true });

// 初期実行
init();
