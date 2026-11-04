@echo off
chcp 65001 >nul
title Cap Nhat Tien Ich Tro Ly Nhan Xet vnEdu
color 0b

echo ======================================================================
echo   CONG CU CAP NHAT 1-CHAM TIEN ICH TRO LY NHAN XET VNEDU
echo   Tu dong tai ma nguon moi, khoi phuc cac tab va phong to trinh duyet
echo ======================================================================
echo.

set "TARGET_DIR=%~dp0"
if "%TARGET_DIR:~-1%"=="\" set "TARGET_DIR=%TARGET_DIR:~0,-1%"

set "ZIP_URL=https://github.com/mrlute88/trolibebut/archive/refs/heads/main.zip"
set "TEMP_ZIP=%TEMP%\vnedu_update_%RANDOM%.zip"
set "TEMP_DIR=%TEMP%\vnedu_extract_%RANDOM%"

echo [1/4] Dang tai ban ma nguon moi nhat tu GitHub...
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

echo [2/4] Dang giai nen va cap nhat cac tinh nang tien ich...
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

echo [3/4] Dang nhan dien trinh duyet dang su dung...

set "BROWSER_EXE="
set "BROWSER_NAME="
set "BROWSER_TITLE="

tasklist /fi "imagename eq chrome.exe" 2>nul | find /i "chrome.exe" >nul
if not errorlevel 1 (
    set "BROWSER_EXE=chrome"
    set "BROWSER_NAME=Google Chrome"
    set "BROWSER_TITLE=Chrome"
)

if "%BROWSER_EXE%"=="" (
    tasklist /fi "imagename eq msedge.exe" 2>nul | find /i "msedge.exe" >nul
    if not errorlevel 1 (
        set "BROWSER_EXE=msedge"
        set "BROWSER_NAME=Microsoft Edge"
        set "BROWSER_TITLE=Edge"
    )
)

if "%BROWSER_EXE%"=="" (
    tasklist /fi "imagename eq browser.exe" 2>nul | find /i "browser.exe" >nul
    if not errorlevel 1 (
        set "BROWSER_EXE=browser"
        set "BROWSER_NAME=Coc Coc"
        set "BROWSER_TITLE=Coc Coc"
    )
)

if "%BROWSER_EXE%"=="" (
    set "BROWSER_EXE=chrome"
    set "BROWSER_NAME=Google Chrome"
    set "BROWSER_TITLE=Chrome"
)

echo Phat hien: %BROWSER_NAME%
echo Dang dong trinh duyet de giai phong phien ban cu...
taskkill /f /im %BROWSER_EXE%.exe >nul 2>&1
timeout /t 1 >nul

:: Xu ly file Preferences de loai bo trang thai bao loi crash
powershell -NoProfile -ExecutionPolicy Bypass -Command "$paths = @('%LOCALAPPDATA%\Google\Chrome\User Data\Default\Preferences', '%LOCALAPPDATA%\Microsoft\Edge\User Data\Default\Preferences', '%LOCALAPPDATA%\CocCoc\Browser\User Data\Default\Preferences'); foreach ($p in $paths) { if (Test-Path $p) { try { $t = [System.IO.File]::ReadAllText($p); if ($t -match 'exit_type') { $t = $t -replace '\""exit_type\"":\""Crashed\""', '\""exit_type\"":\""Normal\""' -replace '\""exited_cleanly\"":false', '\""exited_cleanly\"":true'; [System.IO.File]::WriteAllText($p, $t); } } catch {} } }"

echo [4/4] Dang khoi dong lai %BROWSER_NAME%, khoi phuc the va phong to cua so...

:: Khoi dong lai trinh duyet o che do phong to va khoi phuc cac tab dang lam viec
start "" /MAX "%BROWSER_EXE%" --start-maximized --restore-last-session

:: Tu dong kich hoat cua so, phong to cuc dai va bam nut Restore (neu co xuat hien hop thoai)
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject wscript.shell; for ($i = 0; $i -lt 25; $i++) { Start-Sleep -Milliseconds 200; $p = Get-Process -Name '%BROWSER_EXE%' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1; if ($p -or $ws.AppActivate('%BROWSER_TITLE%')) { if ($p) { $ws.AppActivate($p.Id); } Start-Sleep -Milliseconds 500; $ws.SendKeys('%%{SPACE}x'); Start-Sleep -Milliseconds 400; $ws.SendKeys('{ENTER}'); break; } }"

color 0a
echo.
echo ======================================================================
echo   DA HOAN TAT CAP NHAT VA KHOI PHUC TRINH DUYET 100%% TU DONG!
echo ======================================================================
echo.
echo Cua so %BROWSER_NAME% da duoc phong to va nap tien ich phien ban moi nhat.
echo Thay/Co co the tiep tuc su dung vnEdu ngay lap tuc ma khong can bam gi them.
echo.
timeout /t 3 >nul
exit /b 0