#!/bin/sh
# Renderが指定するポート環境変数 (未指定の場合は8000)
APP_PORT="${PORT:-8000}"

# YouTube PO Token (Proof-of-Origin) サーバーを起動 (ポート4416)
bgutil-pot server --port 4416 &

# メインAPIサーバーをRender指定のポートで起動
exec uvicorn main:app --host 0.0.0.0 --port "$APP_PORT"
