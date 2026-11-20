/**
 * Freihand-Modus: Merlin hört im Browser ohne Klick auf sein Stichwort (public/js/freihand.js).
 * Der Browser meldet sich regelmäßig; solange das passiert, ist der Modus aktiv. Dann gilt:
 * Der Protokollant (Chronist) führt keine Befehle an Merlin mehr aus, das macht Merlin selbst.
 * Meldet sich der Browser nicht mehr (Mikrofon weg, Seite zu), gilt automatisch wieder das bisherige Verhalten.
 */
const FRIST_MS = 90_000;
let zuletzt = 0;

export function meldeFreihand(an: boolean): void {
  zuletzt = an ? Date.now() : 0;
}

export const freihandAktiv = (): boolean => Date.now() - zuletzt < FRIST_MS;
