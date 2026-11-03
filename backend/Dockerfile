FROM python:3.11-slim

# ffmpeg と Deno (YouTube EJSチャレンジ解決用ランタイム) をインストール
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg curl unzip ca-certificates && \
    curl -fsSL https://deno.land/install.sh | sh && \
    rm -rf /var/lib/apt/lists/*

ENV DENO_INSTALL="/root/.deno"
ENV PATH="$DENO_INSTALL/bin:$PATH"

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# キャッシュディレクトリのパーミッション確保
RUN mkdir -p /app/cache

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
