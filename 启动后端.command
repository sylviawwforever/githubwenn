#!/bin/bash
# 双击此文件即可启动 About Me 后端（会打开一个终端窗口）
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "❌ 未找到 Node.js，请先安装：https://nodejs.org"
  echo "（按回车关闭）"; read -r _
  exit 1
fi

if lsof -ti :${PORT:-3000} >/dev/null 2>&1; then
  echo "ℹ️  后端似乎已经在运行，直接打开页面：http://localhost:${PORT:-3000}"
  open "http://localhost:${PORT:-3000}"
  echo "（按回车关闭）"; read -r _
  exit 0
fi

echo "☕ 正在启动 About Me 后端…"
echo "   地址：http://localhost:${PORT:-3000}"
echo "   关闭此窗口 = 停止后端"
echo ""
open "http://localhost:${PORT:-3000}"
exec ./start.sh
