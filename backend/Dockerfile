FROM python:3.11-slim

# ffmpeg (映像と音声の結合・多重化に必須) と最小限の依存関係をインストール
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# キャッシュディレクトリのパーミッション確保
RUN mkdir -p /app/cache

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
