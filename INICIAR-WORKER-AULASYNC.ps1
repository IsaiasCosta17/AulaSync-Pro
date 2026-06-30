$ErrorActionPreference = "Stop"
$projectRoot = $PSScriptRoot
$runtimeDirectory = Join-Path $projectRoot ".runtime"
New-Item -ItemType Directory -Force -Path $runtimeDirectory | Out-Null

$heartbeatPath = Join-Path $runtimeDirectory "worker-heartbeat"
if (Test-Path -LiteralPath $heartbeatPath) {
  $heartbeat = 0
  [long]::TryParse((Get-Content -LiteralPath $heartbeatPath -Raw).Trim(), [ref]$heartbeat) | Out-Null
  $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  if ($heartbeat -gt 0 -and ($now - $heartbeat) -lt 30000) {
    exit 0
  }
}

$bundledNodeBin = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"
if (Test-Path -LiteralPath (Join-Path $bundledNodeBin "node.exe")) {
  $env:PATH = "$bundledNodeBin;$env:PATH"
}

$nodeCommand = Get-Command node -ErrorAction Stop
$tsxCli = Join-Path $projectRoot "node_modules\tsx\dist\cli.mjs"
$workerScript = Join-Path $projectRoot "scripts\background-worker.ts"
if (-not (Test-Path -LiteralPath $tsxCli)) {
  throw "O executor TSX não foi encontrado. Execute novamente o instalador do AulaSync."
}

$stdout = Join-Path $runtimeDirectory "background-worker.log"
$stderr = Join-Path $runtimeDirectory "background-worker-error.log"
$arguments = @(
  '"' + $tsxCli + '"',
  '"' + $workerScript + '"'
)

Start-Process -FilePath $nodeCommand.Source -ArgumentList $arguments -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr
