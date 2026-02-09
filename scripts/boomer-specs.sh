#!/usr/bin/env bash
# Output Boomer system specs for emTesseract ops capacity check.
# Run: bash scripts/boomer-specs.sh
set -e

echo "=== Boomer specs for emTesseract ops ==="
echo ""

echo "--- CPU ---"
if command -v nproc &>/dev/null; then
  echo "cores: $(nproc)"
fi
if [[ -f /proc/cpuinfo ]]; then
  grep -m1 "model name" /proc/cpuinfo | sed 's/.*: /model: /'
fi
echo ""

echo "--- Memory ---"
if [[ -f /proc/meminfo ]]; then
  awk '/MemTotal/ {printf "total: %d MB\n", $2/1024}' /proc/meminfo
  awk '/MemAvailable/ {printf "available: %d MB\n", $2/1024}' /proc/meminfo
fi
echo ""

echo "--- GPU ---"
if command -v nvidia-smi &>/dev/null; then
  nvidia-smi --query-gpu=name,memory.total,memory.free --format=csv,noheader 2>/dev/null || nvidia-smi
else
  echo "no nvidia-smi (no NVIDIA GPU or drivers)"
fi
echo ""

echo "--- Disk ---"
df -h / 2>/dev/null | tail -1 | awk '{print "root: " $4 " available of " $2}'
echo ""

echo "--- Services ---"
for svc in postgresql ollama; do
  if systemctl is-active "$svc" &>/dev/null; then
    echo "$svc: running"
  elif pgrep -x "$svc" &>/dev/null; then
    echo "$svc: running (process)"
  else
    echo "$svc: not running"
  fi
done
echo ""

echo "--- Ollama ---"
if command -v ollama &>/dev/null; then
  echo "ollama: $(ollama --version 2>/dev/null || echo 'installed')"
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:11434/api/tags 2>/dev/null | grep -q 200; then
    echo "ollama api: reachable"
    echo "models:"
    ollama list 2>/dev/null | tail -n +2 || echo "  (none or error)"
  else
    echo "ollama api: not reachable (run ollama serve?)"
  fi
else
  echo "ollama: not installed"
fi
echo ""

echo "--- Node ---"
if command -v node &>/dev/null; then
  echo "node: $(node --version)"
else
  echo "node: not installed"
fi
