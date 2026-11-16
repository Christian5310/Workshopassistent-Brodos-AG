"""
Lokaler Transkriptions-Dienst für BroKI (Whisper über faster-whisper).

- Läuft auf diesem Rechner, das Audio verlässt ihn nicht.
- Spricht die OpenAI-kompatible Schnittstelle POST /v1/audio/transcriptions,
  die BroKI für "Whisper large-v3" und "Whisper Turbo" nutzt (Admin → Erweitert → Transkription).
- Hält mehrere Modelle bereit; welches genutzt wird, steht in jeder Anfrage (Feld "model").
- Lizenzen: faster-whisper und Whisper-Modelle MIT, FastAPI MIT, Uvicorn BSD,
  python-multipart Apache 2.0. Keine Lizenzkosten.

Einstellungen über Umgebungsvariablen (siehe start-whisper.cmd):
  WHISPER_VORLADEN  Modelle, die beim Start geladen werden, mit Komma getrennt
                    (Standard: large-v3,large-v3-turbo). Andere werden bei Bedarf nachgeladen.
                    Statt eines Namens geht auch eine Hugging-Face-ID oder ein Pfad zu einem Modellordner.
  WHISPER_GERAET    auto | cpu | cuda   (Standard: auto)
  WHISPER_THREADS   Anzahl Prozessorkerne (Standard: alle)
  WHISPER_PORT      Standard 8001
  WHISPER_TEST      1 = ohne Modell, liefert einen Testsatz (nur zum Prüfen der Verbindung)
"""

import os
import tempfile
import threading
import time

# Downloads über den normalen Weg statt über den Xet-Speicher von Hugging Face (in Firmennetzen oft blockiert).
# Muss vor dem ersten Import von huggingface_hub gesetzt sein; start-whisper.cmd setzt es zusätzlich.
os.environ.setdefault("HF_HUB_DISABLE_XET", "1")
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")

import uvicorn
from fastapi import FastAPI, File, Form, HTTPException, UploadFile

VORLADEN = [m.strip() for m in os.environ.get("WHISPER_VORLADEN", "large-v3,large-v3-turbo").split(",") if m.strip()]
GERAET = os.environ.get("WHISPER_GERAET", "auto")
THREADS = int(os.environ.get("WHISPER_THREADS", "0"))  # 0 = alle Kerne
PORT = int(os.environ.get("WHISPER_PORT", "8001"))
TEST = os.environ.get("WHISPER_TEST") == "1"

app = FastAPI(title="BroKI Whisper lokal")
modelle = {}
sperre = threading.Lock()
geraet_genutzt = None


def geraet():
    global geraet_genutzt
    if geraet_genutzt:
        return geraet_genutzt
    geraet_genutzt = GERAET
    if geraet_genutzt == "auto":
        try:
            import ctranslate2

            geraet_genutzt = "cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu"
        except Exception:
            geraet_genutzt = "cpu"
    return geraet_genutzt


def modell(name):
    """Liefert das Modell; lädt es beim ersten Mal (beim allerersten Mal mit Download)."""
    with sperre:
        if name not in modelle:
            from faster_whisper import WhisperModel

            g = geraet()
            rechenart = "float16" if g == "cuda" else "int8"  # Prozessor: int8 ist deutlich schneller, kaum ungenauer
            beginn = time.time()
            print(f"Lade Whisper-Modell '{name}' auf {g} ({rechenart}) ...", flush=True)
            modelle[name] = WhisperModel(name, device=g, compute_type=rechenart, cpu_threads=THREADS)
            print(f"'{name}' geladen in {time.time() - beginn:.0f} s.", flush=True)
        return modelle[name]


@app.get("/health")
def health():
    return {"ok": True, "test": TEST, "geraet": geraet_genutzt, "geladen": ["test"] if TEST else list(modelle)}


@app.post("/v1/audio/transcriptions")
def transkribiere(
    file: UploadFile = File(...),
    model: str = Form(""),
    language: str = Form("de"),
    prompt: str = Form(""),
    response_format: str = Form("json"),
):
    daten = file.file.read()
    if len(daten) < 1000:
        return {"text": ""}
    name = model or (VORLADEN[0] if VORLADEN else "large-v3")
    if TEST:
        return {"text": f"Das ist ein Testsatz vom lokalen Whisper-Dienst ({name})."}
    try:
        m = modell(name)
    except Exception as fehler:
        raise HTTPException(status_code=500, detail=f"Modell '{name}' lässt sich nicht laden: {fehler}")
    endung = os.path.splitext(file.filename or "")[1] or ".webm"
    # Audio nur kurz als Datei ablegen (zum Dekodieren) und sofort wieder löschen
    with tempfile.NamedTemporaryFile(suffix=endung, delete=False) as tmp:
        tmp.write(daten)
        pfad = tmp.name
    try:
        beginn = time.time()
        abschnitte, info = m.transcribe(
            pfad,
            language=language or "de",
            initial_prompt=prompt or None,
            vad_filter=True,  # Stille überspringen: weniger erfundene Sätze
            beam_size=5,
            condition_on_previous_text=False,
        )
        text = " ".join(a.text.strip() for a in abschnitte).strip()
        dauer = time.time() - beginn
        print(f"[{name}] {info.duration:.0f} s Audio in {dauer:.1f} s ({info.duration / max(dauer, 0.01):.1f}x Echtzeit): {text[:70]}", flush=True)
        return {"text": text}
    finally:
        os.remove(pfad)


if __name__ == "__main__":
    if not TEST:
        for name in VORLADEN:
            try:
                modell(name)
            except Exception as fehler:
                print(f"WARNUNG: '{name}' konnte nicht geladen werden: {fehler}", flush=True)
    # Nur auf diesem Rechner erreichbar
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")
