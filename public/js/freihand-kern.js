// Freihand-Modus, Kern ohne Browser-Technik (deshalb einzeln testbar, siehe tests/freihand.test.ts):
// - Segmentierer: erkennt Sprechen und Pausen im Mikrofonstrom und schneidet kurze Sätze ab
// - alsWav: macht aus den Messwerten eine kleine WAV-Datei (16 kHz, mono) für die Spracherkennung
// Alles bleibt im Arbeitsspeicher. Nichts wird gespeichert; nach dem Senden ist der Satz weg.

/** Empfindlichkeit: Faktor über dem Grundrauschen, ab dem etwas als Sprechen zählt (kleiner = empfindlicher). */
export const EMPFINDLICHKEIT = { niedrig: 4.5, mittel: 3.2, hoch: 2.2 };

const BLOCK = 128; // Messwerte pro Block (AudioWorklet)

export class Segmentierer {
  /**
   * @param {object} o
   * @param {number} o.rate Abtastrate des Mikrofons in Hz
   * @param {(satz: Float32Array) => void} o.beiSatz ein abgeschlossener kurzer Satz (nicht länger als maxMs)
   * @param {number} [o.faktor] siehe EMPFINDLICHKEIT
   * @param {number} [o.maxMs] längere Redebeiträge sind keine Befehle und werden nicht weitergegeben
   */
  constructor({ rate, beiSatz, faktor = EMPFINDLICHKEIT.mittel, maxMs = 10_000 }) {
    this.rate = rate;
    this.beiSatz = beiSatz;
    this.faktor = faktor;
    const bl = (ms) => Math.max(1, Math.round((ms * rate) / 1000 / BLOCK));
    this.vor = bl(400); // vor dem ersten lauten Block mitnehmen, sonst fehlt der Anfang des Namens
    this.start = bl(70); // so lange muss es laut sein, damit es als Sprechen zählt
    this.stille = bl(750); // so lange Pause beendet den Satz
    this.schwanz = bl(250); // so viel Stille bleibt am Ende dran
    this.min = bl(180); // so viel muss wirklich laut gewesen sein, kürzer ist ein Husten oder Klacken ("Ja" dauert etwa 200 ms)
    this.max = bl(maxMs);
    this.grund = 0.004; // Grundrauschen (Effektivwert), passt sich laufend an
    this.pegel = 0;
    this.zuruecksetzen();
  }

  zuruecksetzen() {
    this.aktiv = false;
    this.bloecke = [];
    this.vorlauf = [];
    this.laut = 0;
    this.leise = 0;
    this.summe = 0;
    this.sprech = 0;
  }

  /** Einen Block Messwerte verarbeiten. pausiert = Merlin spricht oder hört gerade per Klick zu: dann wird nichts mitgenommen. */
  block(daten, pausiert = false) {
    if (pausiert) {
      if (this.aktiv || this.vorlauf.length) this.zuruecksetzen();
      return;
    }
    let s = 0;
    for (let i = 0; i < daten.length; i++) s += daten[i] * daten[i];
    const rms = Math.sqrt(s / daten.length);
    this.pegel = rms;
    const startSchwelle = Math.max(0.008, this.grund * this.faktor);
    const haltSchwelle = Math.max(0.005, startSchwelle * 0.6);

    if (!this.aktiv) {
      // Grundrauschen: sinkt schnell, steigt langsam (Dauergeräusch wie eine Klimaanlage wird so "normal")
      this.grund = rms < this.grund ? this.grund * 0.9 + rms * 0.1 : this.grund * 0.9995 + Math.min(rms, this.grund * 2) * 0.0005;
      this.vorlauf.push(daten);
      if (this.vorlauf.length > this.vor) this.vorlauf.shift();
      this.laut = rms > startSchwelle ? this.laut + 1 : 0;
      if (this.laut >= this.start) {
        this.aktiv = true;
        this.bloecke = [...this.vorlauf];
        this.vorlauf = [];
        this.leise = 0;
        this.summe = 0;
        this.sprech = this.start;
      }
      return;
    }

    this.bloecke.push(daten);
    this.summe += rms;
    this.leise = rms > haltSchwelle ? 0 : this.leise + 1;
    if (rms > haltSchwelle) this.sprech++;
    if (this.leise >= this.stille) return this.abschliessen();
    if (this.bloecke.length > this.max) {
      // Dauerrede oder Dauerlärm: kein Befehl. Verwerfen und das Grundrauschen an den Pegel anpassen.
      this.grund = Math.min(0.05, Math.max(this.grund, (this.summe / this.bloecke.length) * 0.5));
      this.zuruecksetzen();
    }
  }

  abschliessen() {
    // Stille am Ende bis auf einen kurzen Rest abschneiden
    const ueberschuss = Math.max(0, this.leise - this.schwanz);
    const nutz = this.bloecke.slice(0, this.bloecke.length - ueberschuss);
    const gesprochen = this.sprech;
    this.zuruecksetzen();
    if (gesprochen < this.min) return;
    const satz = new Float32Array(nutz.length * BLOCK);
    nutz.forEach((b, i) => satz.set(b, i * BLOCK));
    this.beiSatz(satz);
  }
}

/** WAV (16 Bit, mono, 16 kHz) aus Messwerten; Abtastrate wird heruntergerechnet. */
export function alsWav(messwerte, rate, ziel = 16_000) {
  const faktor = rate / ziel;
  const n = Math.floor(messwerte.length / faktor);
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const von = Math.floor(i * faktor);
    const bis = Math.max(von + 1, Math.floor((i + 1) * faktor));
    let s = 0;
    for (let k = von; k < bis; k++) s += messwerte[k] ?? 0;
    pcm[i] = Math.max(-1, Math.min(1, s / (bis - von))) * 0x7fff;
  }
  const kopf = new DataView(new ArrayBuffer(44));
  const text = (pos, t) => [...t].forEach((c, i) => kopf.setUint8(pos + i, c.charCodeAt(0)));
  text(0, "RIFF");
  kopf.setUint32(4, 36 + pcm.byteLength, true);
  text(8, "WAVEfmt ");
  kopf.setUint32(16, 16, true);
  kopf.setUint16(20, 1, true); // PCM
  kopf.setUint16(22, 1, true); // mono
  kopf.setUint32(24, ziel, true);
  kopf.setUint32(28, ziel * 2, true);
  kopf.setUint16(32, 2, true);
  kopf.setUint16(34, 16, true);
  text(36, "data");
  kopf.setUint32(40, pcm.byteLength, true);
  return new Blob([kopf, pcm], { type: "audio/wav" });
}
