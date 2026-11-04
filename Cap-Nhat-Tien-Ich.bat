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
echo Thay/Co chi can thuc hien 2 buoc don gian de ap dung ngay:
echo.
echo  [Buoc 1] Mo trinh duyet (Chrome, Coc Coc, Edge), vao trang Quan ly tien ich:
echo           chrome://extensions   (hoac edge://extensions)
echo.
echo  [Buoc 2] Bam nut TAI LAI (bieu tuong mui ten xoay tron)
echo           o o tien ich "Tro ly nhan xet vnEdu".
echo.
echo  [Buoc 3] Quay lai trang vnEdu va bam F5 de su dung tinh nang moi!
echo ======================================================================
echo.
pause