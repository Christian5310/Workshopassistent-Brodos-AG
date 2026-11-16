@echo off
REM Startet den lokalen Whisper-Dienst fuer BroKI (Transkription ohne Cloud).
REM Beim ersten Start: Python-Umgebung anlegen, Pakete installieren, Modelle herunterladen (einmalig, ca. 3 GB).
cd /d "%~dp0"
if not exist .venv (
  echo Lege Python-Umgebung an ...
  py -3 -m venv .venv || python -m venv .venv
  .venv\Scripts\python -m pip install --upgrade pip
  .venv\Scripts\python -m pip install -r requirements.txt
)
REM Beide Modelle laden, damit im Admin zwischen large-v3 und Turbo umgeschaltet werden kann.
if "%WHISPER_VORLADEN%"=="" set WHISPER_VORLADEN=large-v3,large-v3-turbo
.venv\Scripts\python whisper_server.py
pause
