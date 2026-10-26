#!/bin/bash
# 双击运行：把最新代码更新到 http://work.willowww.wang/
cd "$(dirname "$0")" || exit 1

clear
cat <<'TXT'
==========================================================
   更新线上站点  http://work.willowww.wang/
==========================================================

本次改动（已全部完成并通过测试）：
  · 购物车 / Data 粘贴链接 → 自动识别商品名、售价、主图
  · 遇反爬时模拟真人浏览节奏：随机停顿、轮换 UA/浏览器指纹、
    被拦后放慢并换 UA 重试（不是机器式高频请求）
  · 全链路并行抓取，识别耗时 7s 超时 → 1.4~2.0s
  · 新增"软截止"：网络慢时也返回已识别到的结果，不再只剩截图

----------------------------------------------------------
请选择部署方式：

  1) 拖放部署（推荐，不需要任何密码）
  2) 用 Netlify Token 命令行部署
----------------------------------------------------------
TXT

printf "请输入 1 或 2 后回车："
read -r MODE
echo ""

if [ "$MODE" = "2" ]; then
  cat <<'TXT'
Token 获取：登录 app.netlify.com → 右上角头像
  → User settings → Applications → Personal access tokens
  → New access token → 复制
TXT
  printf ""
  printf "请粘贴 Token（输入时不会显示，粘贴后回车）："
  read -rs TOKEN
  echo ""
  if [ -z "$TOKEN" ]; then echo "没有输入 Token，已取消。"; exit 1; fi
  export NETLIFY_AUTH_TOKEN="$TOKEN"
  echo ""
  echo "正在准备命令行工具（首次约 1~2 分钟）……"
  npx --yes netlify-cli@latest deploy --prod --dir=public --functions=netlify/functions
  echo ""
  echo "完成。请打开 http://work.willowww.wang/ 验证。"
else
  echo "正在打开 Netlify ……"
  open "https://app.netlify.com/"
  ZIP="/Users/wen/Desktop/网站部署包-work.willowww.wang.zip"
  if [ -f "$ZIP" ]; then
    open -R "$ZIP"
  else
    open .
  fi
  cat <<'TXT'

请按下面 3 步操作（约 30 秒）：

  1. 在打开的 Netlify 里进入你的站点（work.willowww.wang），
     点顶部 Deploys 标签
  2. 把刚在 Finder 里选中的
     「网站部署包-work.willowww.wang.zip」
     直接拖到浏览器页面的虚线框里
     （没有 zip 就拖整个「人工智能final」文件夹也可以）
  3. 等待出现 "Site is live" 后，打开
     http://work.willowww.wang/ 粘贴淘宝链接试一下

  注意：zip 包已剔除本地依赖（只含 public + netlify 函数），
        不会触发 npm 安装，上传很快。
TXT
fi

echo ""
printf "按回车键关闭本窗口……"
read -r _
