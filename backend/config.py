import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # サーバー設定
    HOST: str = "0.0.0.0"
    PORT: int = int(os.getenv("PORT", 8000))
    BASE_URL: str = os.getenv("BASE_URL", "")  # 例: https://vrc-stream-helper.onrender.com (空の場合はリクエストのHostヘッダーを使用)

    # キャッシュ & ファイルストレージ設定
    CACHE_DIR: str = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache")
    CACHE_TTL_SECONDS: int = 3600  # 1時間で自動削除
    MAX_CACHE_SIZE_MB: int = 1500  # 最大キャッシュ容量 (無料鯖のディスク枯渇防止)
    
    # 制限と安全対策 (他ユーザー配布時の悪用・無料枠即死防止)
    MAX_VIDEO_DURATION_SECONDS: int = 1800  # 最大30分 (長尺配信の無制限DLを阻止)
    MAX_CONCURRENT_DOWNLOADS: int = 2       # 同時DL数制限 (CPU/帯域のパンク防止)
    RATE_LIMIT_PER_MINUTE: int = 10         # 1IPあたりの分間最大リクエスト数

    # Cookie設定 (クラウドIPのBot対策用)
    YOUTUBE_COOKIES: str = os.getenv("YOUTUBE_COOKIES", "")
    COOKIES_FILE: str = os.getenv("COOKIES_FILE", os.path.join(os.path.dirname(os.path.abspath(__file__)), "cookies.txt"))

    # 許可するYouTubeドメイン
    ALLOWED_DOMAINS: list[str] = [
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "music.youtube.com",
        "youtu.be"
    ]

settings = Settings()
