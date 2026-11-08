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

:: 1. Ghi nho vi tri thu muc hien tai vao he thong
reg add "HKCU\Software\vnedu-updater" /v "LastPath" /t REG_SZ /d "%~dp0Cap-Nhat-Tien-Ich.bat" /f >nul 2>&1

:: 2. Cai dat trinh khoi chay thong minh vao %LOCALAPPDATA% de luon tim duoc tien ich du co di chuyen sang o dia khac
if not exist "%LOCALAPPDATA%\vnedu-updater" mkdir "%LOCALAPPDATA%\vnedu-updater" >nul 2>&1
if exist "%~dp0vnedu-updater-launcher.bat" (
    copy /y "%~dp0vnedu-updater-launcher.bat" "%LOCALAPPDATA%\vnedu-updater\vnedu-updater-launcher.bat" >nul 2>&1
)

:: 3. Dang ky giao thuc vnedu-updater de web/tien ich co the mo file bat nay
reg add "HKCU\Software\Classes\vnedu-updater" /ve /t REG_SZ /d "URL:vnedu-updater Protocol" /f >nul 2>&1
reg add "HKCU\Software\Classes\vnedu-updater" /v "URL Protocol" /t REG_SZ /d "" /f >nul 2>&1
if exist "%LOCALAPPDATA%\vnedu-updater\vnedu-updater-launcher.bat" (
    reg add "HKCU\Software\Classes\vnedu-updater\shell\open\command" /ve /t REG_SZ /d "cmd.exe /c start \"Cap Nhat vnEdu\" \"%LOCALAPPDATA%\vnedu-updater\vnedu-updater-launcher.bat\"" /f >nul 2>&1
) else (
    reg add "HKCU\Software\Classes\vnedu-updater\shell\open\command" /ve /t REG_SZ /d "cmd.exe /c start \"Cap Nhat vnEdu\" \"%~dp0Cap-Nhat-Tien-Ich.bat\"" /f >nul 2>&1
)

set "ZIP_URL=https://github.com/mrlute88/trolibebut/archive/refs/heads/main.zip"
set "TEMP_ZIP=%TEMP%\vnedu_update_%RANDOM%.zip"
set "TEMP_DIR=%TEMP%\vnedu_extract_%RANDOM%"

echo [1/3] Dang tai ban ma nguon va du lieu moi nhat tu may chu...
curl.exe -L -k -s -o "%TEMP_ZIP%" "%ZIP_URL%"

if exist "%TEMP_ZIP%" (
    for %%I in ("%TEMP_ZIP%") do if %%~zI LEQ 500 del /f /q "%TEMP_ZIP%" >nul 2>&1
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
    exit
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

robocopy "%SOURCE_DIR%" "%TARGET_DIR%" /E /XF "Cap-Nhat-Tien-Ich.bat" "vnedu-updater-launcher.bat" /NFL /NDL /NJH /NJS >nul
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
    exit
)

echo.
echo [3/3] Hoan tat cap nhat ma nguon va du lieu moi nhat!
color 0a
echo.
echo ======================================================================
echo   DA CAP NHAT TIEN ICH THANH CONG!
echo ======================================================================
echo.
echo   * BUOC HOAN TAT CHO THAY/CO:
echo   Thay/Co hay quay lai the web vnEdu dang mo va bam nut:
echo   [⚡ Nap lai tien ich ngay] o phia duoi de su dung ngay!
echo.
echo ======================================================================
echo Cua so se tu dong dong sau 2 giay...
powershell -NoProfile -Command "Start-Sleep -Seconds 2" >nul 2>&1
exit
