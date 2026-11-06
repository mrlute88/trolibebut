@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Cap Nhat Tien Ich Tro Ly Nhan Xet vnEdu
color 0b

echo ======================================================================
echo   CONG CU CAP NHAT 1-CHAM TIEN ICH TRO LY NHAN XET VNEDU
echo   Tu dong tai ban moi tu GitHub va dong bo dong loat moi trinh duyet
echo ======================================================================
echo.

set "TARGET_DIR=%~dp0"
if "%TARGET_DIR:~-1%"=="\" set "TARGET_DIR=%TARGET_DIR:~0,-1%"

:: Tu dong dang ky giao thuc vnedu-updater de web/tien ich co the kich hoat truc tiep khi bam nut tren web
reg add "HKCU\Software\Classes\vnedu-updater" /ve /t REG_SZ /d "URL:vnedu-updater Protocol" /f >nul 2>&1
reg add "HKCU\Software\Classes\vnedu-updater" /v "URL Protocol" /t REG_SZ /d "" /f >nul 2>&1
reg add "HKCU\Software\Classes\vnedu-updater\shell\open\command" /ve /t REG_SZ /d "\"%~dp0Cap-Nhat-Tien-Ich.bat\" \"%%1\"" /f >nul 2>&1

set "ZIP_URL=https://github.com/mrlute88/trolibebut/archive/refs/heads/main.zip"
set "TEMP_ZIP=%TEMP%\vnedu_update_%RANDOM%.zip"
set "TEMP_DIR=%TEMP%\vnedu_extract_%RANDOM%"

echo [1/4] Dang tai ban ma nguon va du lieu moi nhat tu GitHub...
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
    ping 127.0.0.1 -n 4 >nul
    exit /b 1
)

echo [2/4] Dang giai nen va cap nhat cac tinh nang tien ich...
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

:: 1. Cap nhat thu muc goc cua file .bat
robocopy "%SOURCE_DIR%" "%TARGET_DIR%" /E /XF "Cap-Nhat-Tien-Ich.bat" /NFL /NDL /NJH /NJS >nul
if errorlevel 8 (
    xcopy "%SOURCE_DIR%\*" "%TARGET_DIR%\" /E /Y /Q >nul 2>&1
)

:: 2. Tu dong phat hien va dong bo dong loat vao tat ca thu muc tien ich da cai tren Chrome, Edge, Coc Coc
echo Dang quet va dong bo dong loat tat ca thu muc tien ich tren may tinh...
powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand CgAkAHMAcgBjACAAPQAgACQAZQBuAHYAOgBTAE8AVQBSAEMARQBfAEQASQBSAAoAJAB0AGEAcgBnAGUAdABSAG8AbwB0ACAAPQAgACQAZQBuAHYAOgBUAEEAUgBHAEUAVABfAEQASQBSAAoAaQBmACAAKAAtAG4AbwB0ACAAJABzAHIAYwAgAC0AbwByACAALQBuAG8AdAAgACgAVABlAHMAdAAtAFAAYQB0AGgAIAAkAHMAcgBjACkAKQAgAHsAIABlAHgAaQB0ACAAMAAgAH0ACgAKACQAdABhAHIAZwBlAHQARABpAHIAcwAgAD0AIABbAFMAeQBzAHQAZQBtAC4AQwBvAGwAbABlAGMAdABpAG8AbgBzAC4ARwBlAG4AZQByAGkAYwAuAEgAYQBzAGgAUwBlAHQAWwBzAHQAcgBpAG4AZwBdAF0AOgA6AG4AZQB3ACgAWwBTAHkAcwB0AGUAbQAuAFMAdAByAGkAbgBnAEMAbwBtAHAAYQByAGUAcgBdADoAOgBPAHIAZABpAG4AYQBsAEkAZwBuAG8AcgBlAEMAYQBzAGUAKQAKAAoAJABrAG4AbwB3AG4AUABhAHQAaABzACAAPQAgAEAAKAAKACAAIAAgACAAJwBEADoAXABFAHgAdABlAG4AcwBpAG8AbgBcAHQAcgBvAC0AbAB5AC0AbgBoAGEAbgAtAHgAZQB0AC0AdgBuAGUAZAB1AC0AYgBhAG4ALQBwAGgAYQB0AC0AaABhAG4AaAAnACwACgAgACAAIAAgACcARAA6AFwARQB4AHQAZQBuAHMAaQBvAG4AXAB0AHIAbwAtAGwAeQAtAG4AaABhAG4ALQB4AGUAdAAtAHYAbgBlAGQAdQAtAHYAMQAuADIALgAxACcALAAKACAAIAAgACAAJwBEADoAXABFAHgAdABlAG4AcwBpAG8AbgBcAGMAYQBjACAAcABoAGkAZQBuACAAYgBhAG4AXABhACAASwBoAGEAaQBcAHQAcgBvAC0AbAB5AC0AbgBoAGEAbgAtAHgAZQB0AC0AdgBuAGUAZAB1AC0AdgAxAC4AMgAuADEAJwAsAAoAIAAgACAAIAAnAEMAOgBcAFUAcwBlAHIAcwBcAGQAdQBjAHAAaABcAEQAbwB3AG4AbABvAGEAZABzAFwAdAByAG8ALQBsAHkALQBuAGgAYQBuAC0AeABlAHQALQB2AG4AZQBkAHUALQB2ADEALgAzAC4AMQAnAAoAKQAKAGYAbwByAGUAYQBjAGgAIAAoACQAawBwACAAaQBuACAAJABrAG4AbwB3AG4AUABhAHQAaABzACkAIAB7AAoAIAAgACAAIABpAGYAIAAoAFQAZQBzAHQALQBQAGEAdABoACAAIgAkAGsAcABcAG0AYQBuAGkAZgBlAHMAdAAuAGoAcwBvAG4AIgApACAAewAKACAAIAAgACAAIAAgACAAIABbAHYAbwBpAGQAXQAkAHQAYQByAGcAZQB0AEQAaQByAHMALgBBAGQAZAAoACQAawBwACkACgAgACAAIAAgAH0ACgB9AAoACgAkAHIAbwBvAHQAcwAgAD0AIABAACgACgAgACAAIAAgACIAJABlAG4AdgA6AEwATwBDAEEATABBAFAAUABEAEEAVABBAFwARwBvAG8AZwBsAGUAXABDAGgAcgBvAG0AZQBcAFUAcwBlAHIAIABEAGEAdABhACIALAAKACAAIAAgACAAIgAkAGUAbgB2ADoATABPAEMAQQBMAEEAUABQAEQAQQBUAEEAXABNAGkAYwByAG8AcwBvAGYAdABcAEUAZABnAGUAXABVAHMAZQByACAARABhAHQAYQAiACwACgAgACAAIAAgACIAJABlAG4AdgA6AEwATwBDAEEATABBAFAAUABEAEEAVABBAFwAQwBvAGMAQwBvAGMAXABCAHIAbwB3AHMAZQByAFwAVUBzAGUAcgAgAEQAYQB0AGEAIgAKACkACgAKAGYAbwByAGUAYQBjAGgAIAAoACQAcgAgAGkAbgAgACQAcgBvAG8AdABzACkAIAB7AAoAIAAgACAAIABpAGYAIAAoAFQAZQBzAHQALQBQAGEAdABoACAAJAByACkAIAB7AAoAIAAgACAAIAAgACAAIAAgACQAZgBpAGwAZQBzACAAPQAgAEcAZQB0AC0AQwBoAGkAbABkAEkAdABlAG0AIAAtAFAAYQB0AGgAIAAkAHIAIAAtAEYAaQBsAHQAZQByACAAJwAqAFAAcgBlAGYAZQByAGUAbgBjAGUAcwAnACAALQBSAGUAYwB1AHIAcwBlACAALQBEAGUAcAB0AGgAIAAyACAALQBFAHIAcgBvAHIAQQBjAHQAaQBvAG4AIABTAGkAbABlAG4AdABsAHkAQwBvAG4AdABpAG4AdQBlAAoAIAAgACAAIAAgACAAIAAgAGYAbwByAGUAYQBjAGgAIAAoACQAZgAgAGkAbgAgACQAZgBpAGwAZQBzACkAIAB7AAoAIAAgACAAIAAgACAAIAAgACAAIAAgACAAdAByAHkAIAB7AAoAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAkAGoAIAA9ACAARwBlAHQALQBDAG8AbgB0AGUAbgB0ACAAJABmAC4ARgB1AGwAbABOAGEAbQBlACAALQBSAGEAdwAgAC0ARQByAHIAbwByAEEAYwB0AGkAbwBuACAAUwB0AG8AcAAgAHwAIABDAG8AbgB2AGUAcgB0AEYAcgBvAG0ALQBKAHMAbwBuAAoAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAkAGUAeAB0AHMAIAA9ACAAJABqAC4AZQB4AHQAZQBuAHMAaQBvAG4AcwAuAHMAZQB0AHQAaQBuAGcAcwAKACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAaQBmACAAKAAkAGUAeAB0AHMAKQAgAHsACgAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAZgBvAHIAZQBhAGMAaAAgACgAJABwAHIAbwBwACAAaQBuACAAJABlAHgAdABzAC4AUABTAE8AYgBqAGUAYwB0AC4AUAByAG8AcABlAHIAdABpAGUAcwApACAAewAKACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACQAZQB4AHQAUABhAHQAaAAgAD0AIAAkAHAAcgBvAHAALgBWAGEAbAB1AGUALgBwAGEAdABoAAoAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAaQBmACAAKAAkAGUAeAB0AFAAYQB0AGgAIAAtAGEAbgBkACAAKAAkAGUAeAB0AFAAYQB0AGgAIAAtAGwAaQBrAGUAIAAnACoAdgBuAGUAZAB1ACoAJwAgAC0AbwByACAAJABlAHgAdABQAGEAdABoACAALQBsAGkAawBlACAAJwAqAHQAcgBvAC0AbAB5ACoAJwAgAC0AbwByACAAJABlAHgAdABQAGEAdABoACAALQBsAGkAawBlACAAJwAqAHQAcgBvAF8AbAB5ACoAJwApACkAIAB7AAoAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIABpAGYAIAAoAFQAZQBzAHQALQBQAGEAdABoACAAIgAkAGUAeAB0AFAAYQB0AGgAXABtAGEAbgBpAGYAZQBzAHQALgBqAHMAbwBuACIAKQAgAHsACgAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAWwB2AG8AaQBkAF0AJAB0AGEAcgBnAGUAdABEAGkAcgBzAC4AQQBkAGQAKAAkAGUAeAB0AFAAYQB0AGgAKQAKACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAfQAKACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAH0ACgAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAfQAKACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAfQAKACAAIAAgACAAIAAgACAAIAAgACAAIAAgAH0AIABjAGEAdABjAGgAIAB7AH0ACgAgACAAIAAgACAAIAAgACAAfQAKACAAIAAgACAAfQAKAH0ACgAKAGYAbwByAGUAYQBjAGgAIAAoACQAZAAgAGkAbgAgACQAdABhAHIAZwBlAHQARABpAHIAcwApACAAewAKACAAIAAgACAAaQBmACAAKAAkAHQAYQByAGcAZQB0AFIAbwBvAHQAIAAtAGEAbgBkACAAKAAkAGQALgBUAHIAaQBtAEUAbgBkACgAJwBcACcAKQAgAC0AaQBlAHEAIAAkAHQAYQByAGcAZQB0AFIAbwBvAHQALgBUAHIAaQBtAEUAbgBkACgAJwBcACcAKQApACkAIAB7ACAAYwBvAG4AdABpAG4AdQBlACAAfQAKACAAIAAgACAAVwByAGkAdABlAC0ASABvAHMAdAAgACIAIAAgAC0APgAgAEQAbwBuAGcAIABiAG8AIABkAG8AbgBnACAAbABvAGEAdAAgAHQAbwBpADoAIAAkAGQAIgAKACAAIAAgACAAcgBvAGIAbwBjAG8AcAB5ACAAJABzAHIAYwAgACQAZAAgAC8ARQAgAC8AWABGACAAJwBDAGEAcAAtAE4AaABhAHQALQBUAGkAZQBuAC0ASQBjAGgALgBiAGEAdAAnACAALwBOAEYATAAgAC8ATgBEAEwAIAAvAE4ASgBIACAALwBOAEoAUwAgAD4AJABuAHUAbABsAAoAfQAKAA==

del /f /q "%TEMP_ZIP%" >nul 2>&1
rd /s /q "%TEMP_DIR%" >nul 2>&1

if not exist "%TARGET_DIR%\manifest.json" (
    color 0c
    echo.
    echo [LOI] Khong the ghi tep vao thu muc hien tai.
    echo Vui long kiem tra quyen ghi hoac thu chay file voi quyen Administrator.
    echo.
    ping 127.0.0.1 -n 4 >nul
    exit /b 1
)

echo [3/4] Kiem tra phuong thuc khoi chay...

:: Kiem tra neu duoc goi tu giao thuc web (vnedu-updater://run)
echo %* | findstr /i "vnedu-updater" >nul
if errorlevel 1 goto MANUAL_MODE

echo.
echo ======================================================================
echo   DA DONG BO XONG MA NGUON VA DU LIEU MOI VAO TAT CA CAC TRINH DUYET!
echo ======================================================================
echo Thay/Co hay quay lai trinh duyet va bam nut:
echo [Nap lai tien ich ngay] tren web de hoan tat.
echo.
color 0a
ping 127.0.0.1 -n 4 >nul
exit /b 0

:MANUAL_MODE
echo [4/4] Nhan dien trinh duyet dang su dung...

set "BROWSER_EXE="
set "BROWSER_NAME="

tasklist /fi "imagename eq chrome.exe" 2>nul | find /i "chrome.exe" >nul
if not errorlevel 1 (
    set "BROWSER_EXE=chrome"
    set "BROWSER_NAME=Google Chrome"
)

if "%BROWSER_EXE%"=="" (
    tasklist /fi "imagename eq msedge.exe" 2>nul | find /i "msedge.exe" >nul
    if not errorlevel 1 (
        set "BROWSER_EXE=msedge"
        set "BROWSER_NAME=Microsoft Edge"
    )
)

if "%BROWSER_EXE%"=="" (
    tasklist /fi "imagename eq browser.exe" 2>nul | find /i "browser.exe" >nul
    if not errorlevel 1 (
        set "BROWSER_EXE=browser"
        set "BROWSER_NAME=Coc Coc"
    )
)

if "%BROWSER_EXE%"=="" (
    set "BROWSER_EXE=chrome"
    set "BROWSER_NAME=Google Chrome"
)

echo Phat hien: %BROWSER_NAME%
echo Dang dong trinh duyet de giai phong phien ban cu...
taskkill /f /im %BROWSER_EXE%.exe >nul 2>&1
ping 127.0.0.1 -n 2 >nul

:: Xu ly file Preferences de loai bo trang thai bao loi crash
powershell -NoProfile -ExecutionPolicy Bypass -Command "$paths = @('%LOCALAPPDATA%\Google\Chrome\User Data\Default\Preferences', '%LOCALAPPDATA%\Microsoft\Edge\User Data\Default\Preferences', '%LOCALAPPDATA%\CocCoc\Browser\User Data\Default\Preferences'); foreach ($p in $paths) { if (Test-Path $p) { try { $t = [System.IO.File]::ReadAllText($p); if ($t -match 'exit_type') { $t = $t -replace '\""exit_type\"":\""Crashed\""', '\""exit_type\"":\""Normal\""' -replace '\""exited_cleanly\"":false', '\""exited_cleanly\"":true'; [System.IO.File]::WriteAllText($p, $t); } } catch {} } }"

echo Dang khoi dong lai %BROWSER_NAME%, khoi phuc cac the va phong to cua so...
start "" /MAX "%BROWSER_EXE%" --start-maximized --restore-last-session

color 0a
echo.
echo ======================================================================
echo   DA HOAN TAT CAP NHAT VA KHOI PHUC TRINH DUYET 100%% TU DONG!
echo ======================================================================
echo.
echo Cua so %BROWSER_NAME% da duoc phong to va nap tien ich phien ban moi nhat.
echo Thay/Co co the tiep tuc su dung vnEdu ngay lap tuc ma khong can bam gi them.
echo.
ping 127.0.0.1 -n 4 >nul
exit /b 0
