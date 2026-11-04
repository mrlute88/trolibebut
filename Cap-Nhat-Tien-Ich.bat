@echo off
chcp 65001 >nul
title Cap Nhat Tien Ich Tro Ly Nhan Xet vnEdu
color 0b

echo ======================================================================
echo   CONG CU CAP NHAT 1-CHAM TIEN ICH TRO LY NHAN XET VNEDU
echo   Tu dong tai toan bo tinh nang va du lieu moi nhat tu GitHub
echo ======================================================================
echo.

set "TARGET_DIR=%~dp0"
if "%TARGET_DIR:~-1%"=="\" set "TARGET_DIR=%TARGET_DIR:~0,-1%"

set "ZIP_URL=https://github.com/mrlute88/trolibebut/archive/refs/heads/main.zip"
set "TEMP_ZIP=%TEMP%\vnedu_update_%RANDOM%.zip"
set "TEMP_DIR=%TEMP%\vnedu_extract_%RANDOM%"

echo [1/3] Dang tai ban ma nguon moi nhat tu GitHub...
curl.exe -L -k -s -o "%TEMP_ZIP%" "%ZIP_URL%"

if not exist "%TEMP_ZIP%" (
    echo Dang thu tai bang PowerShell du phong...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -Uri '%ZIP_URL%' -OutFile '%TEMP_ZIP%'"
)

if not exist "%TEMP_ZIP%" (
    color 0c
    echo.
    echo [LOI] Khong the ket noi hoac tai ban cap nhat tu GitHub.
    echo Vui long kiem tra lai ket noi mang Internet cua may tinh.
    echo.
    pause
    exit /b 1
)

echo [2/3] Dang giai nen va cap nhat cac tinh nang tien ich...
if not exist "%TEMP_DIR%" mkdir "%TEMP_DIR%"
tar.exe -xf "%TEMP_ZIP%" -C "%TEMP_DIR%" 2>nul
if not exist "%TEMP_DIR%\trolibebut-main" (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path '%TEMP_ZIP%' -DestinationPath '%TEMP_DIR%' -Force"
)

if exist "%TEMP_DIR%\trolibebut-main" (
    robocopy "%TEMP_DIR%\trolibebut-main" "%TARGET_DIR%" /E /XF "Cap-Nhat-Tien-Ich.bat" /NFL /NDL /NJH /NJS >nul
    if errorlevel 8 (
        xcopy "%TEMP_DIR%\trolibebut-main\*" "%TARGET_DIR%\" /E /Y /Q >nul 2>&1
    )
) else (
    robocopy "%TEMP_DIR%" "%TARGET_DIR%" /E /XF "Cap-Nhat-Tien-Ich.bat" /NFL /NDL /NJH /NJS >nul
    if errorlevel 8 (
        xcopy "%TEMP_DIR%\*" "%TARGET_DIR%\" /E /Y /Q >nul 2>&1
    )
)

echo [3/3] Dang don dep cac tep tam...
if exist "%TEMP_ZIP%" del /f /q "%TEMP_ZIP%" >nul 2>&1
if exist "%TEMP_DIR%" rd /s /q "%TEMP_DIR%" >nul 2>&1

if not exist "%TARGET_DIR%\manifest.json" (
    color 0c
    echo.
    echo [LOI] Khong the ghi tep vao thu muc hien tai.
    echo Vui long kiem tra quyen ghi hoac thu chay file voi quyen Administrator.
    echo.
    pause
    exit /b 1
)

color 0a
echo.
echo ======================================================================
echo   DA CAP NHAT THANH CONG TOAN BO TINH NANG MOI NHAT!
echo ======================================================================
echo.

set "BROWSER_EXE="
set "BROWSER_EXT_URL="
set "BROWSER_NAME="

tasklist /fi "imagename eq chrome.exe" 2>nul | find /i "chrome.exe" >nul
if not errorlevel 1 (
    set "BROWSER_EXE=chrome"
    set "BROWSER_EXT_URL=chrome://extensions"
    set "BROWSER_NAME=Google Chrome"
)

if "%BROWSER_EXE%"=="" (
    tasklist /fi "imagename eq msedge.exe" 2>nul | find /i "msedge.exe" >nul
    if not errorlevel 1 (
        set "BROWSER_EXE=msedge"
        set "BROWSER_EXT_URL=edge://extensions"
        set "BROWSER_NAME=Microsoft Edge"
    )
)

if "%BROWSER_EXE%"=="" (
    tasklist /fi "imagename eq browser.exe" 2>nul | find /i "browser.exe" >nul
    if not errorlevel 1 (
        set "BROWSER_EXE=browser"
        set "BROWSER_EXT_URL=coccoc://extensions"
        set "BROWSER_NAME=Coc Coc"
    )
)

if "%BROWSER_EXE%"=="" (
    set "BROWSER_EXE=chrome"
    set "BROWSER_EXT_URL=chrome://extensions"
    set "BROWSER_NAME=Trinh duyet"
)

echo Phat hien trinh duyet dang su dung: %BROWSER_NAME%
echo.
echo Thay/Co hay chon 1 trong cac cach de ap dung tien ich moi:
echo.
echo  [1] Tu dong khoi dong lai trinh duyet (Tu dong 100%% - Khong can bam gi,
echo      trinh duyet se dong va mo lai ngay lap tuc, khoi phuc day du cac tab).
echo.
echo  [2] Tu dong mo trang Quan ly tien ich (%BROWSER_EXT_URL%
echo      de Thay/Co bam nut TAI LAI bieu tuong mui ten xoay tron).
echo.
echo  [3] De sau (Tu tay lam moi khi thuan tien).
echo.
echo ======================================================================
choice /C 123 /N /M "Bam phim [1], [2] hoac [3] tren ban phim: "

if "%ERRORLEVEL%"=="1" goto :ACTION_RESTART
if "%ERRORLEVEL%"=="2" goto :ACTION_OPEN_EXT
goto :ACTION_LATER

:ACTION_RESTART
echo.
echo Dang khoi dong lai %BROWSER_NAME% va khoi phuc toan bo cac tab...
taskkill /f /im %BROWSER_EXE%.exe >nul 2>&1
timeout /t 1 >nul
start "" "%BROWSER_EXE%" --restore-last-session
echo.
echo ======================================================================
echo   DA KHOI DONG LAI TRINH DUYET VA NAP TIEN ICH MOI THANH CONG!
echo ======================================================================
timeout /t 3 >nul
exit /b 0

:ACTION_OPEN_EXT
echo.
echo Dang mo trang Quan ly tien ich: %BROWSER_EXT_URL%
start "" "%BROWSER_EXE%" "%BROWSER_EXT_URL%"
echo.
echo Thay/Co chi can bam nut TAI LAI (bieu tuong xoay tron) tai tien ich!
echo Sau do quay lai trang vnEdu va bam F5 de su dung.
echo.
pause
exit /b 0

:ACTION_LATER
echo.
echo Hoan tat cap nhat ma nguon. Thay/Co co the tu khoi dong lai trinh duyet sau.
pause
exit /b 0