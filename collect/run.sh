#!/bin/bash
# 本地手动采集入口（采集一次并更新 data/，不提交不推送）
# 定时采集由 GitHub Actions 负责（见 .github/workflows/daily.yml）
cd "$(dirname "$0")/.."
python3 collect/run.py >> data/collect.log 2>&1
