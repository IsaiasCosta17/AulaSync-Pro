@echo off
setlocal EnableExtensions
title AulaSync Pro
cd /d "%~dp0"
set "BUNDLED_NODE_BIN=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"
if exist "%BUNDLED_NODE_BIN%\node.exe" set "PATH=%BUNDLED_NODE_BIN%;%PATH%"
set "LOG=%~dp0aulasync-install.log"
> "%LOG%" echo AulaSync Pro - log de instalacao
node --version >> "%LOG%" 2>&1
if errorlevel 1 goto :sem_node

echo.
echo ==============================================
echo        AulaSync Pro - Preparacao local
echo ==============================================
echo.

where pnpm >nul 2>nul
if errorlevel 1 goto :usar_bundled
set "PNPM_CMD=pnpm"
goto :pnpm_pronto

:usar_bundled
set "PNPM_PATH=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\pnpm.cmd"
if not exist "%PNPM_PATH%" goto :sem_node
set PNPM_CMD="%PNPM_PATH%"

:pnpm_pronto
echo [1/4] Instalando dependencias...
set "INSTALL_OPTS=--fetch-timeout=600000 --fetch-retries=5 --network-concurrency=2"
call %PNPM_CMD% install %INSTALL_OPTS% >> "%LOG%" 2>&1
if not errorlevel 1 goto :dependencias_ok
echo Conexao lenta. Tentando novamente 1 de 2...
call %PNPM_CMD% install %INSTALL_OPTS% >> "%LOG%" 2>&1
if not errorlevel 1 goto :dependencias_ok
echo Conexao lenta. Tentando novamente 2 de 2...
call %PNPM_CMD% install %INSTALL_OPTS% >> "%LOG%" 2>&1
if errorlevel 1 goto :erro

:dependencias_ok

echo [1/4] Preparando componentes nativos...
call %PNPM_CMD% rebuild >> "%LOG%" 2>&1
if errorlevel 1 goto :erro

echo [2/4] Criando o banco de dados...
call %PNPM_CMD% run db:push >> "%LOG%" 2>&1
if errorlevel 1 goto :erro

echo [3/4] Criando o administrador inicial...
call %PNPM_CMD% run db:seed >> "%LOG%" 2>&1
if errorlevel 1 goto :erro

echo [4/4] Validando a aplicacao...
call %PNPM_CMD% run build >> "%LOG%" 2>&1
if errorlevel 1 goto :erro

echo.
echo AulaSync Pro preparado com sucesso.
echo Aguarde o servidor iniciar. O navegador sera aberto em seguida.
start "" powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 8; Start-Process 'http://localhost:3000'"
call %PNPM_CMD% start >> "%LOG%" 2>&1
if errorlevel 1 goto :erro
goto :fim

:sem_node
echo ERRO: Node.js e pnpm nao foram encontrados.
echo Instale o Node.js LTS em https://nodejs.org e tente novamente.
echo Node.js e pnpm nao encontrados. >> "%LOG%"
pause
exit /b 1

:erro
echo.
echo Ocorreu um erro. Detalhes:
echo ------------------------------------------------
type "%LOG%"
echo ------------------------------------------------
echo O log foi salvo em: %LOG%
pause
exit /b 1

:fim
endlocal
