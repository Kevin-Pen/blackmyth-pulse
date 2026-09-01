#!/bin/bash
# 本地每日采集入口（Windows 计划任务 / crontab 均可调用）
cd "$(dirname "$0")/.."
python3 collect/run.py >> data/collect.log 2>&1
