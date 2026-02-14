@echo off
echo Iniciando WD Gestor (DEV) com reload automatico (nodemon) e modulo Escalas habilitado...
echo Pressione Ctrl+C para parar o servidor
echo.
set ENABLE_ESCALAS=1
npm run dev:escalas
pause
