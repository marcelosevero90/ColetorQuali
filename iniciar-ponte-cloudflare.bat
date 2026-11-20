@echo off
title Ponte PASOE TOTVS Promob + Cloudflare Tunnel
color 0a
echo ========================================================================
echo    INICIANDO PONTE PASOE TOTVS PROMOB + CLOUDFLARE TUNNEL
echo ========================================================================
echo.
cd /d "%~dp0"

echo [1/2] Iniciando servico da ponte local na porta 3333...
start "Ponte Node.js (Porta 3333)" cmd /k "node ponte-pasoe.js"

timeout /t 2 /nobreak >nul

echo [2/2] Iniciando Cloudflare Tunnel...
echo.
cloudflared tunnel --edge-ip-version 4 --no-tls-verify --url http://localhost:3333
pause
