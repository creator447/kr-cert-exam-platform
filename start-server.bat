@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Node.js 버전 확인 중...
node -v
if errorlevel 1 (
  echo.
  echo [오류] Node.js가 설치되지 않았거나 PATH에 없습니다.
  echo https://nodejs.org 에서 LTS 버전을 설치한 뒤, 터미널을 새로 열어주세요.
  pause
  exit /b 1
)
echo.
echo 서버 시작 시도: http://localhost:3000
echo.
node server.js
if errorlevel 1 (
  echo.
  echo [안내] 포트 3000이 이미 사용 중이면 서버가 이미 켜져 있을 수 있습니다.
  echo 브라우저에서 http://localhost:3000 을 먼저 열어보세요.
  echo.
)
pause
