@echo off
title TOEIC Dictation Practice Tool
chcp 65001 > nul
echo ========================================================
echo       TOEIC DICTATION PRACTICE TOOL (Part 1 ^& Part 2)
echo ========================================================
echo Đang khởi động hệ thống tại http://localhost:8000 ...
start "" http://localhost:8000
python -m uvicorn backend.app:app --host 0.0.0.0 --port 8000 --reload
pause
