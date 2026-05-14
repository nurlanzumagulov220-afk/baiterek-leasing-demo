#!/bin/bash
echo "Инициализация узла Smart Protection..."
git pull origin main
docker-compose down
docker-compose up -d --build
echo "Система успешно развернута. Доступ к терминалам открыт."