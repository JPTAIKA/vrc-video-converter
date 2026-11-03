import os
import glob
import time
import asyncio
import hashlib
from typing import Optional
from fastapi import HTTPException
import yt_dlp

from config import settings

# 同時ダウンロード数を制限するセマフォ (無料サーバーのメモリ・CPU枯渇を防ぐ)
download_semaphore = asyncio.Semaphore(settings.MAX_CONCURRENT_DOWNLOADS)

# キャッシュディレクトリの作成
os.makedirs(settings.CACHE_DIR, exist_ok=True)

COMMON_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
}


def get_quick_stream_info(canonical_url: str) -> dict:
    """
    【通常モード】
    動画をサーバーに保存せず、VRChatが直接再生可能なストリームURLを抽出します。
    （サーバー負荷・ディスク消費ほぼゼロ、即時返却）
    """
    ydl_opts = {
        'http_headers': COMMON_HEADERS,
        'format': 'best[ext=mp4][vcodec^=avc1]/best[ext=mp4]/22/18/best', # H.264直リンク優先
        'noplaylist': True,
        'quiet': True,
        'no_warnings': True,
        'skip_download': True,
    }

    if os.path.exists(settings.COOKIES_FILE):
        ydl_opts['cookiefile'] = settings.COOKIES_FILE

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(canonical_url, download=False)
            if not info:
                raise HTTPException(status_code=404, detail="動画情報を取得できませんでした。")

            duration = info.get('duration') or 0
            if duration > settings.MAX_VIDEO_DURATION_SECONDS:
                raise HTTPException(
                    status_code=400, 
                    detail=f"動画の長さが制限({settings.MAX_VIDEO_DURATION_SECONDS // 60}分)を超えています。"
                )

            stream_url = info.get('url')
            if not stream_url:
                raise HTTPException(status_code=500, detail="再生可能なストリームURLが見つかりませんでした。")

            return {
                "title": info.get('title', 'Unknown Video'),
                "duration": duration,
                "stream_url": stream_url,
                "quality": f"{info.get('resolution') or 'Standard (<=720p)'}",
                "mode": "quick"
            }
    except yt_dlp.utils.DownloadError as e:
        raise HTTPException(status_code=502, detail=f"YouTubeからの取得に失敗しました: {str(e)[:100]}")


async def download_high_quality(canonical_url: str, video_id: str) -> dict:
    """
    【高画質モード (1080p対応)】
    YouTubeの1080p以上は映像と音声が分離しているため、
    サーバー側で一時的に結合(mux)してMP4として保存し、VRChat向けストリームとして提供します。
    """
    # 既存の有効なキャッシュがあるか確認
    pattern = os.path.join(settings.CACHE_DIR, f"{video_id}_*.mp4")
    existing_files = glob.glob(pattern)
    now = time.time()
    for f in existing_files:
        if now - os.path.getmtime(f) < settings.CACHE_TTL_SECONDS:
            filename = os.path.basename(f)
            file_id = os.path.splitext(filename)[0]
            return {
                "file_id": file_id,
                "cached": True,
                "mode": "hq"
            }

    # セマフォで同時実行数を制御
    async with download_semaphore:
        # キャッシュ容量の点検と掃除
        clean_expired_cache()

        # 一時ファイル用のユニークID
        hash_suffix = hashlib.md5(f"{video_id}_{time.time()}".encode()).hexdigest()[:8]
        file_id = f"{video_id}_{hash_suffix}"
        output_template = os.path.join(settings.CACHE_DIR, f"{file_id}.%(ext)s")

        ydl_opts = {
            'http_headers': COMMON_HEADERS,
            # VRChatプレイヤー (AVPro / Unity Video) 互換性のため H.264 (avc1) + AAC (mp4a) を最優先
            'format': 'bestvideo[height<=1080][vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[height<=1080][vcodec^=avc]+bestaudio[ext=m4a]/bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best',
            'merge_output_format': 'mp4',
            'outtmpl': output_template,
            'postprocessor_args': {
                # moov atomを先頭に配置（faststart）し、VRChatで即時ストリーミング再生を開始可能にする
                'ffmpeg': ['-movflags', '+faststart']
            },
            'noplaylist': True,
            'quiet': True,
            'no_warnings': True,
            'max_filesize': 500 * 1024 * 1024, # 500MB超は拒否 (無料鯖保護)
        }

        if os.path.exists(settings.COOKIES_FILE):
            ydl_opts['cookiefile'] = settings.COOKIES_FILE

        # 非同期ループをブロックしないよう別スレッドで実行
        loop = asyncio.get_running_loop()

        def _do_download():
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                # まず動画メタデータを確認
                info = ydl.extract_info(canonical_url, download=False)
                if not info:
                    raise HTTPException(status_code=404, detail="動画情報を取得できませんでした。")

                duration = info.get('duration') or 0
                if duration > settings.MAX_VIDEO_DURATION_SECONDS:
                    raise HTTPException(
                        status_code=400, 
                        detail=f"動画の長さが制限({settings.MAX_VIDEO_DURATION_SECONDS // 60}分)を超えています。"
                    )

                # 実際のダウンロードと結合処理
                ydl.download([canonical_url])
                return info

        try:
            info = await loop.run_in_executor(None, _do_download)
        except yt_dlp.utils.DownloadError as e:
            raise HTTPException(status_code=502, detail=f"動画のダウンロードに失敗しました: {str(e)[:100]}")

        target_file = os.path.join(settings.CACHE_DIR, f"{file_id}.mp4")
        if not os.path.exists(target_file):
            raise HTTPException(status_code=500, detail="ファイルの生成に失敗しました。")

        return {
            "title": info.get('title', 'Unknown Video'),
            "duration": info.get('duration', 0),
            "file_id": file_id,
            "quality": "1080p High Quality",
            "cached": False,
            "mode": "hq"
        }


def clean_expired_cache():
    """
    期限切れキャッシュの削除およびディスク容量オーバー時のFIFO削除
    """
    now = time.time()
    files = glob.glob(os.path.join(settings.CACHE_DIR, "*.mp4"))

    # 1. 有効期限切れ (TTL) のファイルを削除
    for f in files:
        try:
            if now - os.path.getmtime(f) > settings.CACHE_TTL_SECONDS:
                os.remove(f)
        except OSError:
            pass

    # 2. 合計容量がMAX_CACHE_SIZE_MBを超過している場合は古い順に削除
    current_files = glob.glob(os.path.join(settings.CACHE_DIR, "*.mp4"))
    total_size_mb = sum(os.path.getsize(f) for f in current_files if os.path.exists(f)) / (1024 * 1024)

    if total_size_mb > settings.MAX_CACHE_SIZE_MB:
        # 更新日時が古い順にソート
        sorted_files = sorted(current_files, key=lambda f: os.path.getmtime(f))
        for f in sorted_files:
            try:
                os.remove(f)
                total_size_mb = sum(os.path.getsize(x) for x in glob.glob(os.path.join(settings.CACHE_DIR, "*.mp4"))) / (1024 * 1024)
                if total_size_mb <= settings.MAX_CACHE_SIZE_MB * 0.8:
                    break
            except OSError:
                pass
