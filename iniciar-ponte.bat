@echo off
title Ponte PASOE TOTVS Promob - Coletor Quali
color 0b
echo ========================================================================
echo    INICIANDO PONTE LOCAL PASOE TOTVS DATASUL (PROMOB)
echo ========================================================================
echo.
cd /d "%~dp0"
node ponte-pasoe.js
pause
