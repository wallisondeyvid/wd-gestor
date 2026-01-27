@echo off
echo Iniciando WD Gestor com modulo Escalas habilitado...
echo Pressione Ctrl+C para parar o servidor
echo.
set ENABLE_ESCALAS=1
node src/start.js
pause