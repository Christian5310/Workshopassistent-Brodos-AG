"""
Lokaler Transkriptions-Dienst für BroKI (Whisper über faster-whisper).

- Läuft auf diesem Rechner, das Audio verlässt ihn nicht.
- Spricht die OpenAI-kompatible Schnittstelle POST /v1/audio/transcriptions,
  die BroKI mit STT_ANBIETER=whisper nutzt.
- Lizenzen: faster-whisper und Whisper-Modelle MIT, FastAPI MIT, Uvicorn BSD,
  python-multipart Apache 2.0. Keine Lizenzkosten.

Einstellungen über Umgebungsvariablen (siehe start-whisper.cmd):
  WHISPER_MODELL   Modellname oder Pfad zu einem heruntergeladenen Modellordner
                   (Standard: large-v3-turbo; schneller, etwas ungenauer: medium, small)
  WHISPER_GERAET   auto | cpu | cuda   (Standard: auto)
  WHISPER_PORT     Standard 8001
  WHISPER_TEST     1 = ohne Modell, liefert einen Testsatz (nur zum Prüfen der Verbindung)
"""

import os
import tempfile
import time

import uvicorn
from fastapi import FastAPI, File, Form, HTTPException, UploadFile

MODELL = os.environ.get("WHISPER_MODELL", "large-v3-turbo")
GERAET = os.environ.get("WHISPER_GERAET", "auto")
PORT = int(os.environ.get("WHISPER_PORT", "8001"))
TEST = os.environ.get("WHISPER_TEST") == "1"

app = FastAPI(title="BroKI Whisper lokal")
modell = None


def lade_modell():
    """Lädt das Modell einmal beim Start (beim ersten Mal wird es heruntergeladen)."""
    global modell
    if TEST:
        print("Testmodus: kein Modell geladen.")
        return
    from faster_whisper import WhisperModel

    geraet = GERAET
    if geraet == "auto":
        try:
            import ctranslate2

            geraet = "cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu"
        except Exception:
            geraet = "cpu"
    # Grafikkarte: float16. Prozessor: int8 (deutlich schneller, kaum ungenauer).
    rechenart = "float16" if geraet == "cuda" else "int8"
    beginn = time.time()
    print(f"Lade Whisper-Modell '{MODELL}' auf {geraet} ({rechenart}) ...")
    modell = WhisperModel(MODELL, device=geraet, compute_type=rechenart)
    print(f"Modell geladen in {time.time() - beginn:.0f} s.")


@app.get("/health")
def health():
    return {"ok": True, "modell": "test" if TEST else MODELL, "geladen": TEST or modell is not None}


@app.post("/v1/audio/transcriptions")
async def transkribiere(
    file: UploadFile = File(...),
    model: str = Form(""),
    language: str = Form("de"),
    prompt: str = Form(""),
    response_format: str = Form("json"),
):
    daten = await file.read()
    if len(daten) < 1000:
        return {"text": ""}
    if TEST:
        return {"text": "Das ist ein Testsatz vom lokalen Whisper-Dienst."}
    if modell is None:
        raise HTTPException(status_code=503, detail="Modell wird noch geladen.")
    endung = os.path.splitext(file.filename or "")[1] or ".webm"
    # Audio nur kurz als Datei ablegen (zum Dekodieren) und sofort wieder löschen
    with tempfile.NamedTemporaryFile(suffix=endung, delete=False) as tmp:
        tmp.write(daten)
        pfad = tmp.name
    try:
        beginn = time.time()
        abschnitte, _ = modell.transcribe(
            pfad,
            language=language or "de",
            initial_prompt=prompt or None,
            vad_filter=True,  # Stille überspringen: weniger erfundene Sätze
            beam_size=5,
            condition_on_previous_text=False,
        )
        text = " ".join(a.text.strip() for a in abschnitte).strip()
        print(f"Abschnitt transkribiert in {time.time() - beginn:.1f} s: {text[:80]}")
        return {"text": text}
    finally:
        os.remove(pfad)


if __name__ == "__main__":
    lade_modell()
    # Nur auf diesem Rechner erreichbar
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")
