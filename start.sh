#!/bin/bash
# 启动后端并在意外退出时自动重启（保持服务常驻）
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "未找到 node，请先安装 Node.js"
  exit 1
fi
echo "About Me 后端守护启动中…  打开 http://localhost:${PORT:-3000}  （Ctrl+C 停止）"
while true; do
  node server.js
  code=$?
  echo "[watchdog] 服务退出（code=$code），1 秒后重启…"
  sleep 1
done
