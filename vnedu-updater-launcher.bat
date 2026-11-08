@echo off
chcp 65001 >nul
title Cap Nhat Tien Ich Tro Ly Nhan Xet vnEdu

:: 1. Doc duong dan da luu trong Registry
set "SAVED_PATH="
for /f "tokens=2*" %%A in ('reg query "HKCU\Software\vnedu-updater" /v "LastPath" 2^>nul') do (
    set "SAVED_PATH=%%B"
)

:: Neu duong dan da luu van con ton tai thi goi chay ngay
if defined SAVED_PATH if exist "%SAVED_PATH%" (
    call "%SAVED_PATH%"
    exit
)

:: 2. Neu thu muc da bi di chuyen sang o dia hoac thu muc khac, tu dong tim kiem vi tri moi
echo [Thong Bao] Dang tim kiem vi tri Tien ich Tro ly vnEdu...
set "FOUND_PATH="

for %%D in (C D E F G H) do (
    if not defined FOUND_PATH if exist "%%D:\tro-ly-nhan-xet-vnedu-ban-phat-hanh\Cap-Nhat-Tien-Ich.bat" (
        set "FOUND_PATH=%%D:\tro-ly-nhan-xet-vnedu-ban-phat-hanh\Cap-Nhat-Tien-Ich.bat"
    )
    if not defined FOUND_PATH if exist "%%D:\Extension\tro-ly-nhan-xet-vnedu-ban-phat-hanh\Cap-Nhat-Tien-Ich.bat" (
        set "FOUND_PATH=%%D:\Extension\tro-ly-nhan-xet-vnedu-ban-phat-hanh\Cap-Nhat-Tien-Ich.bat"
    )
)

if not defined FOUND_PATH if exist "%USERPROFILE%\Desktop\tro-ly-nhan-xet-vnedu-ban-phat-hanh\Cap-Nhat-Tien-Ich.bat" (
    set "FOUND_PATH=%USERPROFILE%\Desktop\tro-ly-nhan-xet-vnedu-ban-phat-hanh\Cap-Nhat-Tien-Ich.bat"
)
if not defined FOUND_PATH if exist "%USERPROFILE%\Downloads\tro-ly-nhan-xet-vnedu-ban-phat-hanh\Cap-Nhat-Tien-Ich.bat" (
    set "FOUND_PATH=%USERPROFILE%\Downloads\tro-ly-nhan-xet-vnedu-ban-phat-hanh\Cap-Nhat-Tien-Ich.bat"
)

if not defined FOUND_PATH (
    for /f "delims=" %%F in ('powershell -NoProfile -Command "Get-ChildItem -Path @('C:\','D:\','E:\',$env:USERPROFILE) -Filter 'Cap-Nhat-Tien-Ich.bat' -Recurse -Depth 3 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName -First 1"') do (
        set "FOUND_PATH=%%F"
    )
)

if defined FOUND_PATH if exist "%FOUND_PATH%" (
    reg add "HKCU\Software\vnedu-updater" /v "LastPath" /t REG_SZ /d "%FOUND_PATH%" /f >nul 2>&1
    call "%FOUND_PATH%"
    exit
)

:: 3. Neu khong tim thay o bat ky dau, hien hop thoai huong dan than thien
powershell -NoProfile -ExecutionPolicy Bypass -Command "[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null; [System.Windows.Forms.MessageBox]::Show('Thu muc tien ich vua bi di chuyen sang vi tri moi.' + [Environment]::NewLine + [Environment]::NewLine + 'Thay/Co hay mo thu muc chua tien ich va nhap dup truc tiep vao file Cap-Nhat-Tien-Ich.bat de he thong tu dong ghi nho vi tri moi nhe!', 'Thong Bao - Tro Ly vnEdu', 0, 48)" >nul 2>&1
exit

