@echo off
chcp 65001 >nul
title VRChat 1080p 動画変換サーバー (Chrome連動)
cd /d "%~dp0backend"

echo =============================================================
echo   VRChat 1080p 高画質動画変換サーバー (Chrome連動モード)
echo =============================================================
echo.
echo [*] 1080p 変換サーバーを起動中...

:: 既存のポート8000プロセスがあれば念のためクリーンアップ
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000') do taskkill /F /PID %%a 2>nul

:: バックグラウンドでPythonサーバー起動
start /B "" python main.py

timeout /T 3 /NOBREAK >nul

:: Chromeが起動していなければ起動
tasklist /FI "IMAGENAME eq chrome.exe" 2>NUL | find /I /N "chrome.exe" >NUL
if "%ERRORLEVEL%"=="1" (
    echo [*] Chromeを起動します...
    start "" "chrome.exe"
)

echo.
echo [✔] 1080p変換サーバーが稼働しました！
echo.
echo -------------------------------------------------------------
echo  【使い方】
echo   1. ChromeでYouTubeを開き、拡張機能アイコンをクリック
echo   2. 「高画質 (1080p) 変換」を押すだけでURLがコピーされます
echo   3. VRChatの動画プレイヤーに貼り付ければ1080pで再生されます
echo.
echo  ※ Chromeが起動している間だけサーバーが動きます
echo  ※ Chromeを閉じると、このサーバーも自動的に安全終了します
echo  ※ このウィンドウは最小化しておいて大丈夫です
echo -------------------------------------------------------------
echo.

:LOOP
timeout /T 3 /NOBREAK >nul
tasklist /FI "IMAGENAME eq chrome.exe" 2>NUL | find /I /N "chrome.exe" >NUL
if "%ERRORLEVEL%"=="0" goto LOOP

echo.
echo [*] Chromeの終了を検知しました。サーバーを自動停止します...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000') do taskkill /F /PID %%a 2>nul
taskkill /F /IM cloudflared.exe 2>nul
echo [✔] すべてのサーバープロセスを安全に停止しました。
timeout /T 2 /NOBREAK >nul
exit
