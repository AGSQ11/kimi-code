#!/usr/bin/env bash
#
# Kimi Code CLI (Fork) — one-shot installer for macOS / Linux
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/AGSQ11/kimi-code/probemodels/install.sh | bash
#
set -euo pipefail

REPO="https://github.com/AGSQ11/kimi-code.git"
BRANCH="probemodels"
INSTALL_DIR="${KIMI_CODE_INSTALL_DIR:-$HOME/.kimi-code-fork}"
NODE_MIN_MAJOR=24
NODE_MIN_MINOR=15
PNPM_MAJOR=10

# ─── Colors ─────────────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  BOLD='\033[1m'; GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[0;33m'; CYAN='\033[0;36m'; NC='\033[0m'
else
  BOLD=''; GREEN=''; RED=''; YELLOW=''; CYAN=''; NC=''
fi

info()  { printf "${CYAN}ℹ${NC}  %s\n" "$*"; }
ok()    { printf "${GREEN}✔${NC}  %s\n" "$*"; }
warn()  { printf "${YELLOW}⚠${NC}  %s\n" "$*"; }
fail()  { printf "${RED}✘${NC}  %s\n" "$*" >&2; exit 1; }

# ─── Pre-flight checks ──────────────────────────────────────────────────────

info "Checking prerequisites..."

# Node.js
if ! command -v node &>/dev/null; then
  fail "Node.js is not installed. Install Node.js >= ${NODE_MIN_MAJOR}.${NODE_MIN_MINOR} first:
    https://nodejs.org/
  Or use nvm:  nvm install ${NODE_MIN_MAJOR}"
fi

NODE_VERSION=$(node -v | sed 's/v//')
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
NODE_MINOR=$(echo "$NODE_VERSION" | cut -d. -f2)

if [[ "$NODE_MAJOR" -lt "$NODE_MIN_MAJOR" ]] || \
   { [[ "$NODE_MAJOR" -eq "$NODE_MIN_MAJOR" ]] && [[ "$NODE_MINOR" -lt "$NODE_MIN_MINOR" ]]; }; then
  fail "Node.js ${NODE_VERSION} is too old. Need >= ${NODE_MIN_MAJOR}.${NODE_MIN_MINOR}.
  Update:  nvm install ${NODE_MIN_MAJOR}"
fi
ok "Node.js ${NODE_VERSION}"

# pnpm
if ! command -v pnpm &>/dev/null; then
  info "pnpm not found — installing..."
  if command -v corepack &>/dev/null; then
    corepack enable
    corepack prepare pnpm@10.33.0 --activate
  else
    npm install -g pnpm@10.33.0
  fi
fi
PNPM_VERSION=$(pnpm -v | cut -d. -f1)
if [[ "$PNPM_VERSION" -ne "$PNPM_MAJOR" ]]; then
  warn "pnpm major version is ${PNPM_VERSION}, expected ${PNPM_MAJOR}. Continuing anyway..."
fi
ok "pnpm $(pnpm -v)"

# Git
if ! command -v git &>/dev/null; then
  fail "Git is not installed. Install it from https://git-scm.com/"
fi
ok "git $(git --version | awk '{print $3}')"

# ─── Clone / update ─────────────────────────────────────────────────────────

if [[ -d "$INSTALL_DIR/.git" ]]; then
  info "Updating existing clone at ${INSTALL_DIR}..."
  cd "$INSTALL_DIR"
  git fetch origin "$BRANCH"
  git checkout "$BRANCH"
  git pull origin "$BRANCH"
else
  info "Cloning into ${INSTALL_DIR}..."
  git clone --depth 1 --branch "$BRANCH" "$REPO" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi
ok "Source ready"

# ─── Install & build ────────────────────────────────────────────────────────

info "Installing dependencies (this may take a minute)..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
ok "Dependencies installed"

info "Building packages..."
pnpm --filter @moonshot-ai/kimi-code build
ok "Build complete"

# ─── Global install ─────────────────────────────────────────────────────────

info "Packing for global install..."
pnpm --filter @moonshot-ai/kimi-code exec pnpm pack --pack-destination "$INSTALL_DIR/apps/kimi-code"

TGZ=$(ls "$INSTALL_DIR"/apps/kimi-code/*.tgz | head -1)
if [[ -z "$TGZ" ]]; then
  fail "Pack failed — no .tgz produced"
fi

info "Installing globally via npm..."
npm install -g "$TGZ"
ok "Global install complete"

# ─── Verify ─────────────────────────────────────────────────────────────────

if command -v kimi &>/dev/null; then
  VERSION=$(kimi --version 2>/dev/null || echo "unknown")
  ok "kimi is ready: ${BOLD}${VERSION}${NC}"
else
  warn "kimi was installed but isn't on your PATH yet."
  info "Add npm's global bin to your PATH, or restart your shell."
fi

echo ""
printf "${GREEN}${BOLD}Kimi Code CLI (fork) installed successfully!${NC}\n"
echo ""
echo "Next steps:"
echo "  cd your-project"
echo "  kimi"
echo ""
echo "On first launch, run /login to authenticate."
