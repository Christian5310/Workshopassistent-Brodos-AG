// Freihand-Modus (Browser): hört dauernd über das Mikrofon mit und gibt kurze Sätze als WAV an Merlin weiter (merlin.js).
// Das Mikrofon wird hier zusätzlich zur Aufnahme des Protokolls geöffnet. Beides läuft unabhängig voneinander.
import { alsWav, EMPFINDLICHKEIT, Segmentierer } from "./freihand-kern.js";

/**
 * @param {object} o
 * @param {(wav: Blob) => void} o.beiSatz
 * @param {() => boolean} o.pausiert true, solange nichts mitgenommen werden soll (Merlin spricht, Klick-Zuhören, Führung)
 * @param {keyof typeof EMPFINDLICHKEIT} [o.empfindlichkeit]
 * @param {(pegel: number, laut: boolean, grund: number) => void} [o.beiPegel] für den Mikrofon-Test im Admin
 * @param {(text: string) => void} [o.beiFehler]
 */
export async function starteZuhoeren({ beiSatz, pausiert, empfindlichkeit = "mittel", beiPegel, beiFehler = () => {} }) {
  const strom = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  const kontext = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "interactive" });
  try {
    await kontext.audioWorklet.addModule("/js/freihand-worklet.js");
  } catch (fehler) {
    strom.getTracks().forEach((t) => t.stop());
    kontext.close();
    throw fehler;
  }
  const quelle = kontext.createMediaStreamSource(strom);
  const knoten = new AudioWorkletNode(kontext, "freihand-mitschnitt");
  const lautlos = kontext.createGain();
  lautlos.gain.value = 0; // das Mikrofon soll nicht über die Lautsprecher laufen
  quelle.connect(knoten);
  knoten.connect(lautlos);
  lautlos.connect(kontext.destination);

  const segmentierer = new Segmentierer({
    rate: kontext.sampleRate,
    faktor: EMPFINDLICHKEIT[empfindlichkeit] ?? EMPFINDLICHKEIT.mittel,
    beiSatz: (satz) => beiSatz(alsWav(satz, kontext.sampleRate)),
  });
  let letzterPegel = 0;
  knoten.port.onmessage = (e) => {
    segmentierer.block(e.data, pausiert());
    const jetzt = performance.now();
    if (beiPegel && jetzt - letzterPegel > 100) {
      letzterPegel = jetzt;
      beiPegel(segmentierer.pegel, segmentierer.aktiv, segmentierer.grund);
    }
  };
  // Browser starten Audio erst nach einer Bedienung: beim ersten Klick oder Tastendruck nachholen
  const wecken = () => { if (kontext.state !== "running") kontext.resume().catch(() => {}); };
  await kontext.resume().catch(() => {});
  if (kontext.state !== "running") for (const art of ["pointerdown", "keydown"]) addEventListener(art, wecken, { once: true });
  strom.getAudioTracks()[0]?.addEventListener("ended", () => beiFehler("Das Mikrofon wurde getrennt."));

  return {
    laeuft: () => kontext.state === "running",
    setzeEmpfindlichkeit: (name) => { segmentierer.faktor = EMPFINDLICHKEIT[name] ?? EMPFINDLICHKEIT.mittel; },
    stopp() {
      knoten.port.onmessage = null;
      strom.getTracks().forEach((t) => t.stop());
      kontext.close().catch(() => {});
      segmentierer.zuruecksetzen();
    },
  };
}
