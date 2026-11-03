import re
import time
from urllib.parse import urlparse, parse_qs
from fastapi import HTTPException
from config import settings

# YouTubeのVideo IDは英数字と一部記号(-_)で構成される11文字
YOUTUBE_VIDEO_ID_REGEX = re.compile(r"^[a-zA-Z0-9_-]{11}$")
FILE_ID_REGEX = re.compile(r"^[a-zA-Z0-9_-]{11}_[a-zA-Z0-9_]+$")

def extract_and_validate_youtube_url(url: str) -> tuple[str, str]:
    """
    URLを検証し、SSRF攻撃や不正なURL混入を防ぎます。
    安全性が確認できた場合のみ、(video_id, canonical_url) を返します。
    """
    if not url or len(url) > 2048:
        raise HTTPException(status_code=400, detail="無効なURL形式です。")

    try:
        parsed = urlparse(url)
    except Exception:
        raise HTTPException(status_code=400, detail="URLの解析に失敗しました。")

    # 1. スキーム検証 (httpsのみ許可)
    if parsed.scheme != "https":
        raise HTTPException(status_code=400, detail="HTTPSのURLのみ対応しています。")

    # 2. ホスト名検証 (YouTube公式ドメインのみ許可)
    hostname = (parsed.hostname or "").lower()
    if hostname not in settings.ALLOWED_DOMAINS:
        raise HTTPException(status_code=400, detail="YouTube以外のURLは許可されていません。")

    # 3. Video IDの抽出
    video_id = None
    if hostname == "youtu.be":
        # 例: https://youtu.be/dQw4w9WgXcQ
        path_parts = parsed.path.strip("/").split("/")
        if path_parts:
            video_id = path_parts[0]
    else:
        # 例: https://www.youtube.com/watch?v=dQw4w9WgXcQ
        if parsed.path.startswith("/watch"):
            qs = parse_qs(parsed.query)
            v_list = qs.get("v")
            if v_list:
                video_id = v_list[0]
        elif parsed.path.startswith("/shorts/"):
            # 例: https://www.youtube.com/shorts/dQw4w9WgXcQ
            path_parts = parsed.path.strip("/").split("/")
            if len(path_parts) >= 2:
                video_id = path_parts[1]

    if not video_id or not YOUTUBE_VIDEO_ID_REGEX.match(video_id):
        raise HTTPException(status_code=400, detail="有効なYouTube動画IDが見つかりませんでした。")

    # 正規化された安全なURLを再構築して返す（外部からの危険なクエリパラメータを完全排除）
    canonical_url = f"https://www.youtube.com/watch?v={video_id}"
    return video_id, canonical_url


def validate_file_id(file_id: str) -> bool:
    """
    ファイルIDのパストラバーサル (../など) 攻撃を防止
    """
    return bool(FILE_ID_REGEX.match(file_id))


class InMemoryRateLimiter:
    """
    IPアドレスごとの簡単なスライディングウィンドウ式レートリミッター
    他ユーザー配布時のDoS攻撃や無料鯖のリソース枯渇を防ぐ
    """
    def __init__(self, max_requests: int = 10, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.requests: dict[str, list[float]] = {}

    def check_rate_limit(self, client_ip: str) -> bool:
        now = time.time()
        timestamps = self.requests.get(client_ip, [])
        # 期限切れの履歴を削除
        valid_timestamps = [t for t in timestamps if now - t < self.window_seconds]
        if len(valid_timestamps) >= self.max_requests:
            self.requests[client_ip] = valid_timestamps
            return False

        valid_timestamps.append(now)
        self.requests[client_ip] = valid_timestamps
        return True

rate_limiter = InMemoryRateLimiter(
    max_requests=settings.RATE_LIMIT_PER_MINUTE,
    window_seconds=60
)
