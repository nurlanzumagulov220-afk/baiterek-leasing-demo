#!/bin/bash
set -e

pip install -r requirements.txt

# Скачиваем шрифты DejaVu для PDF-генератора если их нет
if [ ! -f "fonts/DejaVuSans.ttf" ]; then
  echo "[start.sh] Скачиваю шрифты DejaVu..."
  mkdir -p fonts
  curl -sL "https://github.com/dejavu-fonts/dejavu-fonts/releases/download/version_2_37/dejavu-fonts-ttf-2.37.zip" -o /tmp/dejavu.zip
  unzip -o /tmp/dejavu.zip "*/DejaVuSans.ttf" "*/DejaVuSans-Bold.ttf" -d /tmp/dv/
  cp /tmp/dv/dejavu-fonts-ttf-2.37/ttf/DejaVuSans.ttf fonts/
  cp /tmp/dv/dejavu-fonts-ttf-2.37/ttf/DejaVuSans-Bold.ttf fonts/
  rm -rf /tmp/dejavu.zip /tmp/dv
  echo "[start.sh] Шрифты установлены."
fi

uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
