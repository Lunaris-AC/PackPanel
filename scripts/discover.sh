#!/bin/bash
set -euo pipefail

echo "=== SYSTEM & OS ==="
cat /etc/os-release
uname -m
systemd-detect-virt || true

echo "=== CPU & MEMORY ==="
nproc
free -h

echo "=== DISK & INODES ==="
df -h
df -i

echo "=== DOCKER & COMPOSE ==="
which docker || true
docker --version || true
which docker-compose || true
docker compose version || true
docker ps -a || true

echo "=== NETWORK & PORTS ==="
ip -br addr
ss -tulpn

echo "=== FIREWALL ==="
iptables -L -n -v --line-numbers 2>/dev/null | head -n 30 || true
ufw status 2>/dev/null || true
nft list ruleset 2>/dev/null | head -n 30 || true
