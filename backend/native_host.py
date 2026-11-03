import sys
import os
import json
import struct
import time
import subprocess
import urllib.request

# サーバープロセスの管理
server_process = None

def send_message(message_dict):
    """Chrome拡張機能へJSONメッセージを送信 (4バイト長ヘッダー + UTF-8 JSON)"""
    encoded = json.dumps(message_dict).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("@I", len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()

def read_message():
    """Chrome拡張機能からJSONメッセージを受信"""
    raw_length = sys.stdin.buffer.read(4)
    if len(raw_length) == 0:
        return None
    message_length = struct.unpack("@I", raw_length)[0]
    message_bytes = sys.stdin.buffer.read(message_length)
    return json.loads(message_bytes.decode("utf-8"))

def is_server_running():
    try:
        res = urllib.request.urlopen("http://127.0.0.1:8000/health", timeout=1)
        return res.status == 200
    except Exception:
        return False

def ensure_server():
    global server_process
    if is_server_running():
        return True

    backend_dir = os.path.dirname(os.path.abspath(__file__))
    main_py = os.path.join(backend_dir, "main.py")

    flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
    server_process = subprocess.Popen(
        [sys.executable, main_py],
        cwd=backend_dir,
        creationflags=flags
    )

    # 起動待ち (最大8秒)
    for _ in range(16):
        time.sleep(0.5)
        if is_server_running():
            return True
    return False

def main():
    global server_process
    try:
        while True:
            msg = read_message()
            if msg is None:
                # Chromeが切断した（タブや拡張機能が閉じた）
                break

            action = msg.get("action")
            if action == "ping" or action == "ensure_server":
                ok = ensure_server()
                send_message({"status": "ready" if ok else "failed", "port": 8000})

            elif action == "convert":
                # サーバーが立ち上がっているか確認
                ensure_server()
                url = msg.get("url")
                # main.py API経由で変換
                try:
                    data = json.dumps({"url": url, "mode": "hq"}).encode("utf-8")
                    req = urllib.request.Request("http://127.0.0.1:8000/api/convert", data=data, headers={"Content-Type": "application/json"})
                    res = urllib.request.urlopen(req, timeout=45)
                    result = json.loads(res.read().decode("utf-8"))
                    send_message({"status": "success", "result": result})
                except Exception as e:
                    send_message({"status": "error", "message": str(e)})

            else:
                send_message({"status": "unknown_action"})

    finally:
        # Chrome終了時にサーバーを自動停止
        if server_process:
            try:
                server_process.terminate()
            except Exception:
                pass

if __name__ == "__main__":
    main()
