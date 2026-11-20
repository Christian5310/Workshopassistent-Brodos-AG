// AudioWorklet für den Freihand-Modus: reicht die Mikrofon-Messwerte blockweise an freihand.js weiter.
class Mitschnitt extends AudioWorkletProcessor {
  process(eingaenge) {
    const kanal = eingaenge[0]?.[0];
    if (kanal) this.port.postMessage(kanal.slice());
    return true;
  }
}
registerProcessor("freihand-mitschnitt", Mitschnitt);
