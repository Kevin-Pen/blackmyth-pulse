#!/bin/bash
# 本机定时任务入口：采集 → 提交 → 推送
cd /home/kevin/blackmyth-pulse
python3 collect/run.py >> data/collect.log 2>&1
git add -A
git -c user.name="Kevin-Pen" -c user.email="Kevin-Pen@users.noreply.github.com" commit -q -m "data: local scheduled snapshot" 2>/dev/null
for i in 1 2 3 4 5; do
  git push -q origin main 2>/dev/null && break
  sleep 5
done
