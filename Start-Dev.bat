@echo off
cd /d "%~dp0"

:: Atur ExecutionPolicy ke RemoteSigned untuk CurrentUser agar npm tidak terblokir
powershell -NoProfile -Command "Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force"

:: Jalankan Server (Colyseus) di jendela PowerShell terpisah
powershell -NoProfile -Command "Start-Process powershell -ArgumentList '-NoExit', '-Command', 'cd server; npm install; npm run dev'"

:: Jalankan Client (Vite + Phaser 3) di jendela PowerShell terpisah
powershell -NoProfile -Command "Start-Process powershell -ArgumentList '-NoExit', '-Command', 'cd client; npm install; npm run dev'"