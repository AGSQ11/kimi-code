# Kimi Code CLI (Fork) — one-shot installer for Windows (PowerShell)
#
# Usage:
#   irm https://raw.githubusercontent.com/AGSQ11/kimi-code/probemodels/install.ps1 | iex
#
# Requires: PowerShell 5.1+ (run as Administrator if npm global dir is not writable)

$ErrorActionPreference = "Stop"

$Repo = "https://github.com/AGSQ11/kimi-code.git"
$Branch = "main"
$InstallDir = if ($env:KIMI_CODE_INSTALL_DIR) { $env:KIMI_CODE_INSTALL_DIR } else { Join-Path $env:USERPROFILE ".kimi-code-fork" }
$NodeMinMajor = 24
$NodeMinMinor = 15
$PnpmMajor = 10

function Write-Info  { Write-Host "[INFO]  $args" -ForegroundColor Cyan }
function Write-Ok    { Write-Host "[OK]    $args" -ForegroundColor Green }
function Write-Warn  { Write-Host "[WARN]  $args" -ForegroundColor Yellow }
function Write-Fail  { Write-Host "[FAIL]  $args" -ForegroundColor Red; exit 1 }

# ─── Pre-flight checks ──────────────────────────────────────────────────────

Write-Info "Checking prerequisites..."

# Node.js
$nodeExe = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeExe) {
    Write-Fail "Node.js is not installed. Install Node.js >= $NodeMinMajor.$NodeMinMinor from https://nodejs.org/ first."
}

$nodeVersionRaw = & node -v
$nodeVersion = $nodeVersionRaw.TrimStart('v')
$nodeParts = $nodeVersion.Split('.')
$nodeMajor = [int]$nodeParts[0]
$nodeMinor = [int]$nodeParts[1]

if ($nodeMajor -lt $NodeMinMajor -or ($nodeMajor -eq $NodeMinMajor -and $nodeMinor -lt $NodeMinMinor)) {
    Write-Fail "Node.js $nodeVersion is too old. Need >= $NodeMinMajor.$NodeMinMinor."
}
Write-Ok "Node.js $nodeVersion"

# pnpm
$pnpmExe = Get-Command pnpm -ErrorAction SilentlyContinue
if (-not $pnpmExe) {
    Write-Info "pnpm not found — installing..."
    $corepackExe = Get-Command corepack -ErrorAction SilentlyContinue
    if ($corepackExe) {
        & corepack enable
        & corepack prepare pnpm@10.33.0 --activate
    } else {
        & npm install -g pnpm@10.33.0
    }
}
$pnpmVersion = (& pnpm -v).Split('.')[0]
Write-Ok "pnpm $(& pnpm -v)"

# Git
$gitExe = Get-Command git -ErrorAction SilentlyContinue
if (-not $gitExe) {
    Write-Warn "Git is not installed. Install Git for Windows from https://gitforwindows.org/"
    Write-Warn "Kimi Code CLI uses the bundled Git Bash as its shell environment."
    Write-Fail "Git is required."
}
Write-Ok "git $(& git --version)"

# Git Bash check
$bashPath = if ($env:KIMI_SHELL_PATH) { $env:KIMI_SHELL_PATH } else { "C:\Program Files\Git\bin\bash.exe" }
if (-not (Test-Path $bashPath)) {
    Write-Warn "Git Bash not found at default location. If installed elsewhere, set KIMI_SHELL_PATH to bash.exe path."
}

# ─── Clone / update ─────────────────────────────────────────────────────────

if (Test-Path (Join-Path $InstallDir ".git")) {
    Write-Info "Updating existing clone at $InstallDir..."
    Push-Location $InstallDir
    & git fetch origin $Branch
    & git checkout $Branch
    & git pull origin $Branch
    Pop-Location
} else {
    Write-Info "Cloning into $InstallDir..."
    & git clone --depth 1 --branch $Branch $Repo $InstallDir
}
Write-Ok "Source ready"

# ─── Install & build ────────────────────────────────────────────────────────

Write-Info "Installing dependencies (this may take a minute)..."
Push-Location $InstallDir
& pnpm install --frozen-lockfile 2>$null
if ($LASTEXITCODE -ne 0) {
    & pnpm install
}
Write-Ok "Dependencies installed"

Write-Info "Building packages..."
& pnpm --filter "@moonshot-ai/kimi-code" build
Write-Ok "Build complete"

# ─── Global install ─────────────────────────────────────────────────────────

Write-Info "Packing for global install..."
$packDir = Join-Path $InstallDir "apps\kimi-code"
& pnpm --filter "@moonshot-ai/kimi-code" exec pnpm pack --pack-destination $packDir

$tgz = Get-ChildItem -Path $packDir -Filter "*.tgz" | Select-Object -First 1
if (-not $tgz) {
    Write-Fail "Pack failed — no .tgz produced"
}

Write-Info "Installing globally via npm..."
& npm install -g $tgz.FullName
Write-Ok "Global install complete"
Pop-Location

# ─── Verify ─────────────────────────────────────────────────────────────────

$kimiExe = Get-Command kimi -ErrorAction SilentlyContinue
if ($kimiExe) {
    $version = & kimi --version 2>$null
    Write-Ok "kimi is ready: $version"
} else {
    Write-Warn "kimi was installed but isn't on your PATH yet."
    Write-Info "Restart your PowerShell session or add npm's global bin to your PATH."
}

Write-Host ""
Write-Host "Kimi Code CLI (fork) installed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "  cd your-project"
Write-Host "  kimi"
Write-Host ""
Write-Host "On first launch, run /login to authenticate."
Write-Host ""
Write-Host "If Git Bash is in a custom location, set KIMI_SHELL_PATH to bash.exe:"
Write-Host '  $env:KIMI_SHELL_PATH = "C:\path\to\Git\bin\bash.exe"'
