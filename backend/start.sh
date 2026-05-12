#!/bin/bash

pip install -r requirements.txt

# Скачиваем шрифты DejaVu для PDF (необязательно — без них PDF работает на Helvetica)
if [ ! -f "fonts/DejaVuSans.ttf" ]; then
  mkdir -p fonts
  curl -sL --max-time 30 \
    "https://github.com/dejavu-fonts/dejavu-fonts/releases/download/version_2_37/dejavu-fonts-ttf-2.37.zip" \
    -o /tmp/dejavu.zip && \
  unzip -o /tmp/dejavu.zip "*/DejaVuSans.ttf" "*/DejaVuSans-Bold.ttf" -d /tmp/dv/ && \
  cp /tmp/dv/dejavu-fonts-ttf-2.37/ttf/DejaVuSans.ttf fonts/ && \
  cp /tmp/dv/dejavu-fonts-ttf-2.37/ttf/DejaVuSans-Bold.ttf fonts/ && \
  echo "Шрифты установлены." || echo "Шрифты не скачались — PDF будет на Helvetica."
  rm -rf /tmp/dejavu.zip /tmp/dv 2>/dev/null || true
fi

uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
