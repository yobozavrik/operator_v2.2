@echo off
:: Щоденний запуск прогнозу о 20:00 (після того як зібрались дані за день)
:: Реєстрація в Task Scheduler:
::   schtasks /create /tn "BakeryForecast" /tr "D:\operator-main\bakery1\schedule_daily.bat" /sc daily /st 20:00 /f

cd /d D:\operator-main
python bakery1/predict_demand.py >> bakery1/logs/predict.log 2>&1
