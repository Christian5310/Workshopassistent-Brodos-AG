@echo off
REM Startet den lokalen Whisper-Dienst fuer BroKI (Transkription ohne Cloud).
REM Beim ersten Start: Python-Umgebung anlegen, Pakete installieren, Modell herunterladen (einmalig).
cd /d "%~dp0"
if not exist .venv (
  echo Lege Python-Umgebung an ...
  py -3 -m venv .venv || python -m venv .venv
  .venv\Scripts\python -m pip install --upgrade pip
  .venv\Scripts\python -m pip install -r requirements.txt
)
REM Modell: large-v3-turbo (genau). Auf langsamen Rechnern: medium oder small.
if "%WHISPER_MODELL%"=="" set WHISPER_MODELL=large-v3-turbo
.venv\Scripts\python whisper_server.py
pause
