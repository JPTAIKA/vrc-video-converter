import os
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

from config import settings
from security import (
    extract_and_validate_youtube_url, 
    validate_file_id, 
    rate_limiter
)
from downloader import (
    get_quick_stream_info, 
    download_high_quality, 
    clean_expired_cache
)


# 定期クリーンアップタスク (TTL超過ファイルの自動削除)
async def periodic_cache_cleanup():
    while True:
        try:
            await asyncio.sleep(600) # 10分ごと
            clean_expired_cache()
        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"[Cleanup Error] {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 起動時: 環境変数にCookieがあればファイルとして書き出し
    if settings.YOUTUBE_COOKIES:
        try:
            with open(settings.COOKIES_FILE, "w", encoding="utf-8") as f:
                f.write(settings.YOUTUBE_COOKIES)
            print("[Cookies] Loaded YOUTUBE_COOKIES from environment variable.")
        except Exception as e:
            print(f"[Cookies Error] {e}")

    clean_expired_cache()
    task = asyncio.create_task(periodic_cache_cleanup())
    yield
    # 終了時
    task.cancel()


app = FastAPI(
    title="VRChat Video Stream Helper API",
    description="VRChat向けYouTubeリンク変換＆高画質ストリーミングAPI",
    version="1.0.0",
    lifespan=lifespan
)

# Chrome拡張機能からのリクエストを許可するCORS設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # 拡張機能のchrome-extension://オリジンからのアクセスを許可
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


class ConvertRequest(BaseModel):
    url: str = Field(..., description="YouTubeの動画URL")
    mode: str = Field(default="quick", description="変換モード ('quick' または 'hq')")


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "vrc-video-converter", "version": "1.0.9"}

@app.get("/api/debug_cookies")
def debug_cookies():
    cookie_file_exists = os.path.exists(settings.COOKIES_FILE)
    lines_count = 0
    first_few_chars = ""
    if cookie_file_exists:
        try:
            with open(settings.COOKIES_FILE, "r", encoding="utf-8") as f:
                lines = f.readlines()
                lines_count = len(lines)
                first_few_chars = lines[0][:40] if lines else ""
        except Exception as e:
            first_few_chars = str(e)
    return {
        "env_var_set": bool(settings.YOUTUBE_COOKIES),
        "env_var_len": len(settings.YOUTUBE_COOKIES),
        "file_exists": cookie_file_exists,
        "file_lines": lines_count,
        "first_line_sample": first_few_chars
    }

@app.get("/api/debug_download")
def debug_download(v: str = "OWDcn7hl16A"):
    import yt_dlp, traceback
    url = f"https://www.youtube.com/watch?v={v}"
    
    # テスト1: Cookieあり、デフォルトクライアント
    res1 = {}
    try:
        opts1 = {
            'cookiefile': settings.COOKIES_FILE if os.path.exists(settings.COOKIES_FILE) else None,
            'format': 'bestvideo[height<=1080][vcodec^=avc1]+bestaudio[acodec^=mp4a]/best',
            'quiet': True,
            'skip_download': True,
        }
        with yt_dlp.YoutubeDL(opts1) as ydl:
            info = ydl.extract_info(url, download=False)
            res1 = {"status": "ok", "format": info.get('format_id'), "vcodec": info.get('vcodec')}
    except Exception as e:
        res1 = {"status": "error", "error": str(e)[:120], "trace": traceback.format_exc()[-200:]}

    # テスト2: Cookieなし、visionos
    res2 = {}
    try:
        opts2 = {
            'extractor_args': {'youtube': {'player_client': ['visionos']}},
            'format': 'bestvideo[height<=1080][vcodec^=avc1]+bestaudio[acodec^=mp4a]/best',
            'quiet': True,
            'skip_download': True,
        }
        with yt_dlp.YoutubeDL(opts2) as ydl:
            info = ydl.extract_info(url, download=False)
            res2 = {"status": "ok", "format": info.get('format_id'), "vcodec": info.get('vcodec')}
    except Exception as e:
        res2 = {"status": "error", "error": str(e)[:120], "trace": traceback.format_exc()[-200:]}

    return {"with_cookie": res1, "visionos_no_cookie": res2}


@app.post("/api/convert")
async def convert_video(req: ConvertRequest, request: Request):
    # 1. レート制限の確認 (DDoS・過負荷防止)
    client_ip = request.client.host if request.client else "unknown"
    if not rate_limiter.check_rate_limit(client_ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="リクエストが多すぎます。しばらく時間をおいて再度お試しください。"
        )

    # 2. 安全なURLの検証と抽出 (SSRF対策)
    video_id, canonical_url = extract_and_validate_youtube_url(req.url)

    # ベースURLの解決 (Renderなどの環境変数、またはホストヘッダー)
    base_url = settings.BASE_URL.rstrip("/")
    if not base_url:
        host = request.headers.get("host", f"{settings.HOST}:{settings.PORT}")
        scheme = request.headers.get("x-forwarded-proto", "http")
        base_url = f"{scheme}://{host}"

    # 3. モードに応じた処理
    if req.mode == "hq":
        # 【高画質モード】一時ダウンロード・多重化
        result = await download_high_quality(canonical_url, video_id)
        stream_url = f"{base_url}/stream/{result['file_id']}.mp4"
        return {
            "status": "success",
            "mode": "hq",
            "title": result.get("title", ""),
            "quality": result.get("quality", "1080p High Quality"),
            "stream_url": stream_url,
            "expires_in": settings.CACHE_TTL_SECONDS,
            "cached": result.get("cached", False)
        }
    else:
        # 【通常モード】軽量・即時ストリーム抽出
        # イベントループをブロックしないようスレッドプールで実行
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, get_quick_stream_info, canonical_url)
        return {
            "status": "success",
            "mode": "quick",
            "title": result.get("title", ""),
            "quality": result.get("quality", "Standard (<=720p)"),
            "stream_url": result["stream_url"],
            "cached": False
        }


@app.get("/stream/{file_id}.mp4")
async def stream_video(file_id: str, request: Request):
    """
    VRChatプレイヤー (AVPro / Unity Video) が要求する
    HTTP 206 Partial Content (Rangeリクエスト) に完全対応したストリーミング配信
    """
    # パストラバーサル防止
    if not validate_file_id(file_id):
        raise HTTPException(status_code=400, detail="不正なファイルIDです。")

    file_path = os.path.join(settings.CACHE_DIR, f"{file_id}.mp4")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="動画ファイルが存在しないか、有効期限が切延しました。")

    file_size = os.path.getsize(file_path)
    range_header = request.headers.get("range")

    # Rangeリクエストの処理 (シークやチャンク再生に必須)
    if range_header:
        # 例: bytes=0-1048575 または bytes=1048576-
        range_value = range_header.replace("bytes=", "").strip()
        parts = range_value.split("-")
        start = int(parts[0]) if parts[0] else 0
        end = int(parts[1]) if len(parts) > 1 and parts[1] else file_size - 1

        if start >= file_size or end >= file_size or start > end:
            return Response(
                status_code=416,
                headers={"Content-Range": f"bytes */{file_size}"}
            )

        content_length = end - start + 1

        def iterfile():
            with open(file_path, "rb") as f:
                f.seek(start)
                bytes_left = content_length
                chunk_size = 1024 * 1024 # 1MB chunks
                while bytes_left > 0:
                    read_bytes = min(chunk_size, bytes_left)
                    data = f.read(read_bytes)
                    if not data:
                        break
                    bytes_left -= len(data)
                    yield data

        headers = {
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(content_length),
            "Content-Type": "video/mp4",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=3600"
        }
        return StreamingResponse(iterfile(), status_code=206, headers=headers)

    # Rangeヘッダーがない場合 (全ファイル返却)
    def iter_full():
        with open(file_path, "rb") as f:
            chunk_size = 1024 * 1024
            while chunk := f.read(chunk_size):
                yield chunk

    headers = {
        "Accept-Ranges": "bytes",
        "Content-Length": str(file_size),
        "Content-Type": "video/mp4",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=3600"
    }
    return StreamingResponse(iter_full(), status_code=200, headers=headers)
