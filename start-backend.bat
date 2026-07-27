@echo off
cd /d "%~dp0backend"
call conda activate chemeflow
if errorlevel 1 (
  echo.
  echo Could not activate the conda environment named chemeflow.
  echo Open Anaconda Prompt and create it first with:
  echo   conda create -n chemeflow python=3.11
  echo   conda activate chemeflow
  echo   python -m pip install -r requirements.txt
  pause
  exit /b 1
)
python -m uvicorn app.main:app --reload
pause
