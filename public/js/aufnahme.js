// Mikrofon-Aufnahme für den Transkriptions-Assistenten.
// Nimmt fortlaufend auf und schickt alle X Sekunden einen abgeschlossenen Schnipsel ans Backend.
// Es wird nichts im Browser gespeichert; die Web Speech API wird bewusst NICHT verwendet (Audio ginge an Google).

const FORMATE = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

export class Aufnahme {
  laeuft = false;
  /** Zeitpunkt, zu dem der laufende Schnipsel abgeschlossen und gesendet wird */
  naechsterVersand = 0;
  /** Länge eines Abschnitts in Sekunden; lässt sich während der Aufnahme ändern */
  sekunden = 60;
  #strom = null;
  #rekorder = null;
  #wechsel = null;
  #sperre = null;
  #audio = null;
  #pegelTakt = null;
  #offen = new Set(); // laufende Uploads

  constructor({ beiPegel = () => {}, beiFehler = () => {} } = {}) {
    this.beiPegel = beiPegel;
    this.beiFehler = beiFehler;
  }

  /** Fragt den Mikrofonzugriff an. Wirft einen verständlichen Fehler, wenn er fehlt. */
  async mikrofonOeffnen() {
    if (this.#strom) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      throw new Error("Dieser Browser kann hier kein Mikrofon nutzen. Die Seite muss über https:// oder localhost geöffnet sein.");
    }
    try {
      this.#strom = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (fehler) {
      throw new Error(
        fehler.name === "NotAllowedError"
          ? "Kein Zugriff auf das Mikrofon. Bitte im Browser erlauben (Schloss-Symbol in der Adresszeile) und erneut einschalten."
          : fehler.name === "NotFoundError"
            ? "Kein Mikrofon gefunden. Ist das Konferenzmikro angeschlossen?"
            : `Mikrofon lässt sich nicht öffnen: ${fehler.message}`,
      );
    }
  }

  async start(sekunden) {
    if (this.laeuft) return;
    this.sekunden = sekunden;
    this.laeuft = true;
    try {
      await this.mikrofonOeffnen();
    } catch (fehler) {
      this.laeuft = false;
      throw fehler;
    }
    this.#pegelStart();
    // Bildschirm wach halten, damit der Laptop mitten im Workshop nicht einschläft.
    navigator.wakeLock?.request("screen").then((s) => (this.#sperre = s)).catch(() => {});
    // Der erste Schnipsel ist kurz, damit nach dem Einschalten schnell sichtbar wird, dass alles funktioniert.
    this.#neuerSchnipsel(Math.min(20, sekunden));
  }

  /** Beendet die Aufnahme; der angebrochene Schnipsel wird noch hochgeladen. */
  async stopp() {
    if (!this.laeuft) return;
    this.laeuft = false;
    clearTimeout(this.#wechsel);
    const fertig = this.#rekorder?.state === "recording" ? new Promise((r) => this.#rekorder.addEventListener("stop", r, { once: true })) : null;
    if (fertig) this.#rekorder.stop();
    await fertig;
    await Promise.allSettled([...this.#offen]);
    this.#strom?.getTracks().forEach((t) => t.stop());
    this.#strom = null;
    clearInterval(this.#pegelTakt);
    this.#audio?.close();
    this.#audio = null;
    this.#sperre?.release().catch(() => {});
    this.beiPegel(0);
  }

  // Jeder Schnipsel ist eine eigene, vollständige Aufnahme (stop + neuer Rekorder).
  // Mit einem durchlaufenden Rekorder wären nur die ersten Daten abspielbar, weil nur sie den Datei-Kopf enthalten.
  #neuerSchnipsel(dieser = this.sekunden) {
    if (!this.laeuft) return;
    const format = FORMATE.find((f) => MediaRecorder.isTypeSupported(f));
    const rekorder = new MediaRecorder(this.#strom, { ...(format ? { mimeType: format } : {}), audioBitsPerSecond: 32000 });
    const teile = [];
    rekorder.addEventListener("dataavailable", (e) => e.data.size && teile.push(e.data));
    rekorder.addEventListener("stop", () => {
      const blob = new Blob(teile, { type: rekorder.mimeType || "audio/webm" });
      if (blob.size > 1000) {
        const upload = this.#hochladen(blob).finally(() => this.#offen.delete(upload));
        this.#offen.add(upload);
      } else if (this.laeuft) {
        this.beiFehler("Die Aufnahme war leer: Der Browser liefert keine Audiodaten. Bitte Mikrofon im Browser prüfen und Seite neu laden.");
      }
    });
    rekorder.start();
    this.#rekorder = rekorder;
    this.naechsterVersand = Date.now() + dieser * 1000;
    this.#wechsel = setTimeout(() => {
      this.#neuerSchnipsel(); // erst den neuen starten, dann den alten beenden: keine Lücke
      rekorder.stop();
    }, dieser * 1000);
  }

  async #hochladen(blob, versuch = 1) {
    try {
      const antwort = await fetch("/api/audio-chunk", { method: "POST", headers: { "Content-Type": blob.type.split(";")[0] }, body: blob });
      if (antwort.status === 409 || antwort.status === 400) {
        // Der Server hat den Abschnitt abgelehnt (z. B. Assistent aus): sichtbar machen statt still verwerfen
        const { fehler } = await antwort.json().catch(() => ({}));
        return void (this.laeuft && this.beiFehler(`Ein Audio-Abschnitt wurde nicht angenommen: ${fehler ?? antwort.status}`));
      }
      if (!antwort.ok) throw new Error(`Fehler ${antwort.status}`);
      this.beiFehler("");
    } catch {
      if (versuch < 3) {
        await new Promise((r) => setTimeout(r, 3000));
        return this.#hochladen(blob, versuch + 1);
      }
      this.beiFehler("Ein Audio-Abschnitt konnte nicht gesendet werden (Netzwerk?). Die Aufnahme läuft weiter.");
    }
  }

  #pegelStart() {
    this.#audio = new AudioContext();
    const analyse = this.#audio.createAnalyser();
    analyse.fftSize = 512;
    this.#audio.createMediaStreamSource(this.#strom).connect(analyse);
    const daten = new Uint8Array(analyse.fftSize);
    this.#pegelTakt = setInterval(() => {
      analyse.getByteTimeDomainData(daten);
      let spitze = 0;
      for (const wert of daten) spitze = Math.max(spitze, Math.abs(wert - 128) / 128);
      this.beiPegel(Math.min(1, spitze * 2.5));
    }, 100);
  }
}
