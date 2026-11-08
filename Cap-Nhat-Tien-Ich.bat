@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Cap Nhat Tien Ich Tro Ly Nhan Xet vnEdu
color 0b

echo ======================================================================
echo   CONG CU CAP NHAT TIEN ICH TRO LY NHAN XET VNEDU
echo   Tu dong tai ban moi tu may chu va dong bo vao trinh duyet
echo ======================================================================
echo.

set "TARGET_DIR=%~dp0"
if "%TARGET_DIR:~-1%"=="\" set "TARGET_DIR=%TARGET_DIR:~0,-1%"

set "ZIP_URL=https://github.com/mrlute88/trolibebut/archive/refs/heads/main.zip"
set "TEMP_ZIP=%TEMP%\vnedu_update_%RANDOM%.zip"
set "TEMP_DIR=%TEMP%\vnedu_extract_%RANDOM%"

echo [1/3] Dang tai ban ma nguon va du lieu moi nhat tu may chu...
curl.exe -L -k -s -o "%TEMP_ZIP%" "%ZIP_URL%"

if exist "%TEMP_ZIP%" (
    for %%%%I in ("%TEMP_ZIP%") do if %%%%~zI LEQ 500 del /f /q "%TEMP_ZIP%" >nul 2>&1
)

if not exist "%TEMP_ZIP%" (
    echo Dang thu tai bang phuong thuc du phong...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -Uri '%ZIP_URL%' -OutFile '%TEMP_ZIP%'"
)

if not exist "%TEMP_ZIP%" (
    color 0c
    echo.
    echo [LOI] Khong the ket noi hoac tai ban cap nhat tu may chu.
    echo Vui long kiem tra lai ket noi mang Internet cua may tinh.
    echo.
    pause
    exit /b 1
)

echo [2/3] Dang giai nen va cap nhat vao thu muc tien ich...
if not exist "%TEMP_DIR%" mkdir "%TEMP_DIR%"
tar.exe -xf "%TEMP_ZIP%" -C "%TEMP_DIR%" 2>nul
if not exist "%TEMP_DIR%\trolibebut-main" (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path '%TEMP_ZIP%' -DestinationPath '%TEMP_DIR%' -Force"
)

if exist "%TEMP_DIR%\trolibebut-main" (
    set "SOURCE_DIR=%TEMP_DIR%\trolibebut-main"
) else (
    set "SOURCE_DIR=%TEMP_DIR%"
)

robocopy "%SOURCE_DIR%" "%TARGET_DIR%" /E /XF "Cap-Nhat-Tien-Ich.bat" /NFL /NDL /NJH /NJS >nul
if errorlevel 8 (
    xcopy "%SOURCE_DIR%\*" "%TARGET_DIR%\" /E /Y /Q >nul 2>&1
)

del /f /q "%TEMP_ZIP%" >nul 2>&1
rd /s /q "%TEMP_DIR%" >nul 2>&1

if not exist "%TARGET_DIR%\manifest.json" (
    color 0c
    echo.
    echo [LOI] Khong the ghi tep vao thu muc hien tai.
    echo Vui long kiem tra quyen ghi hoac thu chay file voi quyen Administrator.
    echo.
    pause
    exit /b 1
)

echo.
echo [3/3] Dang nhan dien trinh duyet va mo trang Quan ly Tien ich...

set "OPENED=0"

tasklist /fi "imagename eq msedge.exe" 2>nul | findstr /i "msedge.exe" >nul
if not errorlevel 1 (
    echo   * Phat hien Microsoft Edge dang mo -^> Mo trang edge://extensions
    start msedge.exe "edge://extensions"
    set "OPENED=1"
)

tasklist /fi "imagename eq chrome.exe" 2>nul | findstr /i "chrome.exe" >nul
if not errorlevel 1 (
    echo   * Phat hien Google Chrome dang mo -^> Mo trang chrome://extensions
    start chrome.exe "chrome://extensions"
    set "OPENED=1"
)

tasklist /fi "imagename eq browser.exe" 2>nul | findstr /i "browser.exe" >nul
if not errorlevel 1 (
    echo   * Phat hien Coc Coc dang mo -^> Mo trang coccoc://extensions
    start browser.exe "coccoc://extensions"
    set "OPENED=1"
)

tasklist /fi "imagename eq coccoc.exe" 2>nul | findstr /i "coccoc.exe" >nul
if not errorlevel 1 (
    if "%OPENED%"=="0" (
        echo   * Phat hien Coc Coc dang mo -^> Mo trang coccoc://extensions
        start coccoc.exe "coccoc://extensions"
        set "OPENED=1"
    )
)

if "%OPENED%"=="0" (
    echo   * Mo trang Quan ly Tien ich mac dinh...
    start msedge.exe "edge://extensions" 2>nul || start chrome.exe "chrome://extensions" 2>nul
)

:: Hien thi thong bao hop thoai Windows truc tiep den giao vien
powershell -NoProfile -ExecutionPolicy Bypass -Command "[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null; [System.Windows.Forms.MessageBox]::Show('Ban moi cua Tien ich Tro ly vnEdu da duoc cap nhat vao may tinh thanh cong!' + [Environment]::NewLine + [Environment]::NewLine + '👉 Thay/Co hay chuyen sang the trinh duyet vua mo (trang Tien ich) va bam nut [Tai lai / Reload] (bieu tuong mui ten xoay tron) de hoan tat nhe!', 'Cap Nhat Thanh Cong - Tro Ly Nhan Xet vnEdu', 0, 64)" >nul 2>&1

color 0a
echo.
echo ======================================================================
echo   DA CAP NHAT TIEN ICH THANH CONG!
echo ======================================================================
echo.
echo   * BUOC HOAN TAT CHO THAY/CO:
echo   1. The quan ly tien ich da duoc mo san tren trinh duyet.
echo   2. Thay/Co chi can bam vao bieu tuong [Tai lai / Reload] (mui ten xoay tron)
echo      tai tien ich "Tro ly nhan xet vnEdu" la su dung duoc ngay!
echo.
echo ======================================================================
echo Nhan phim bat ky de dong cua so nay.
pause >nul
exit /b 0
