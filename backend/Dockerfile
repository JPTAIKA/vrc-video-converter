FROM python:3.11-slim

# ffmpeg と必要ツールをインストール
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# PO Token (Proof-of-Origin) 自動生成バイナリ (Rust製) を配置
RUN curl -L -o /usr/local/bin/bgutil-pot https://github.com/jim60105/bgutil-ytdlp-pot-provider-rs/releases/download/v0.8.1/bgutil-pot-linux-x86_64 && \
    chmod +x /usr/local/bin/bgutil-pot

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /app/cache
RUN chmod +x entrypoint.sh

EXPOSE 8000
EXPOSE 10000

CMD ["./entrypoint.sh"]
