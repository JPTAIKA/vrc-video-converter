#!/bin/sh
# YouTube PO Token (Proof-of-Origin) サーバーを起動 (ポート4416)
bgutil-pot server --port 4416 &

# メインAPIサーバーを起動
exec uvicorn main:app --host 0.0.0.0 --port 8000
