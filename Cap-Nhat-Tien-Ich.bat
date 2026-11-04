@echo off
chcp 65001 >nul
title Cập Nhật Tiện Ích Trợ Lý Nhận Xét vnEdu
color 0b

echo ======================================================================
echo   CÔNG CỤ CẬP NHẬT 1-CHẠM TIỆN ÍCH TRỢ LÝ NHẬN XÉT VNEDU
echo   Tự động tải toàn bộ tính năng và dữ liệu mới nhất từ GitHub
echo ======================================================================
echo.

set "TARGET_DIR=%~dp0"
set "ZIP_URL=https://github.com/mrlute88/trolibebut/archive/refs/heads/main.zip"
set "TEMP_ZIP=%TEMP%\vnedu_update_%RANDOM%.zip"
set "TEMP_DIR=%TEMP%\vnedu_extract_%RANDOM%"

echo [1/3] Đang tải bản mã nguồn mới nhất từ GitHub...
curl.exe -L -s -o "%TEMP_ZIP%" "%ZIP_URL%"

if not exist "%TEMP_ZIP%" (
    echo Đang thử tải bằng PowerShell dự phòng...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -Uri '%ZIP_URL%' -OutFile '%TEMP_ZIP%'"
)

if not exist "%TEMP_ZIP%" (
    color 0c
    echo.
    echo ❌ [LỖI] Không thể kết nối hoặc tải bản cập nhật từ GitHub.
    echo Vui lòng kiểm tra lại kết nối mạng Internet của máy tính.
    echo.
    pause
    exit /b 1
)

echo [2/3] Đang giải nén và cập nhật các tính năng tiện ích...
if not exist "%TEMP_DIR%" mkdir "%TEMP_DIR%"
tar.exe -xf "%TEMP_ZIP%" -C "%TEMP_DIR%" 2>nul
if not exist "%TEMP_DIR%\trolibebut-main" (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path '%TEMP_ZIP%' -DestinationPath '%TEMP_DIR%' -Force"
)

if exist "%TEMP_DIR%\trolibebut-main" (
    robocopy "%TEMP_DIR%\trolibebut-main" "%TARGET_DIR%" /E /XF "Cap-Nhat-Tien-Ich.bat" /NFL /NDL /NJH /NJS >nul
) else (
    robocopy "%TEMP_DIR%" "%TARGET_DIR%" /E /XF "Cap-Nhat-Tien-Ich.bat" /NFL /NDL /NJH /NJS >nul
)

echo [3/3] Đang dọn dẹp các tệp tạm...
del /f /q "%TEMP_ZIP%" >nul 2>&1
rd /s /q "%TEMP_DIR%" >nul 2>&1

color 0a
echo.
echo ======================================================================
echo   ✓ ĐÃ CẬP NHẬT THÀNH CÔNG TOÀN BỘ TÍNH NĂNG MỚI NHẤT!
echo ======================================================================
echo.
echo Thầy/Cô chỉ cần thực hiện 2 bước đơn giản để áp dụng ngay:
echo.
echo  👉 Bước 1: Mở trình duyệt (Chrome, Cốc Cốc, Edge), vào trang Quản lý tiện ích:
echo              chrome://extensions   (hoặc edge://extensions)
echo.
echo  👉 Bước 2: Bấm nút TẢI LẠI (biểu tượng mũi tên xoay tròn 🔄)
echo              ở ô tiện ích "Trợ lý nhận xét vnEdu".
echo.
echo  👉 Bước 3: Quay lại trang vnEdu và bấm F5 để sử dụng tính năng mới!
echo ======================================================================
echo.
pause
