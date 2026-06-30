@echo off
setlocal EnableExtensions
title AulaSync Pro
cd /d "%~dp0"

set "BUNDLED_NODE_BIN=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"
if exist "%BUNDLED_NODE_BIN%\node.exe" set "PATH=%BUNDLED_NODE_BIN%;%PATH%"

where pnpm >nul 2>nul
if errorlevel 1 goto :usar_bundled
set "PNPM_CMD=pnpm"
goto :pnpm_pronto

:usar_bundled
set "PNPM_PATH=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\pnpm.cmd"
if not exist "%PNPM_PATH%" goto :sem_runtime
set PNPM_CMD="%PNPM_PATH%"

:pnpm_pronto
if exist ".rebuild-required" goto :preparar
if exist ".next\BUILD_ID" goto :iniciar

:preparar
echo.
echo Preparando a versao final. Isso acontece apenas quando necessario...
call %PNPM_CMD% install --fetch-timeout=600000 --fetch-retries=5 --network-concurrency=2
if errorlevel 1 goto :erro
call %PNPM_CMD% run db:push
if errorlevel 1 goto :erro
call %PNPM_CMD% run build
if errorlevel 1 goto :erro
if exist ".rebuild-required" del /q ".rebuild-required"

:iniciar
powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0INICIAR-WORKER-AULASYNC.ps1"
if errorlevel 1 echo Aviso: o motor em segundo plano nao iniciou. O painel continuara funcionando.
echo.
echo ==============================================
echo              AulaSync Pro
echo ==============================================
echo.
echo Iniciando o sistema...
echo O navegador abrira automaticamente.
echo.
echo O motor de uploads continuara funcionando mesmo
echo se esta janela ou o navegador forem fechados.
echo.

start "" powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 5; Start-Process 'http://localhost:3000'"
call %PNPM_CMD% start
if errorlevel 1 goto :erro
goto :fim

:sem_runtime
echo.
echo Node.js e pnpm nao foram encontrados.
echo Execute o arquivo INICIAR-AULASYNC.cmd para preparar o sistema.
pause
exit /b 1

:erro
echo.
echo Nao foi possivel iniciar o AulaSync Pro.
echo Verifique se outra janela do AulaSync ja esta aberta.
pause
exit /b 1

:fim
endlocal
