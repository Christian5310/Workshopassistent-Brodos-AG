// Bühne der Führung durch die App (Anzeige im App-Rahmen, gesteuert von merlin.js über den Beobachter-Kanal "fuehrung"):
// Hintergrund wird weich gezeichnet, Merlin gleitet nach links, rechts fahren je Station Bubbles (Kreise) mit Screenshots herein.
// Es gibt keinen Text: Merlin spricht nur, und beim Sprechen bewegt sich sein Mund. Dazu leise Hintergrundmusik (public/audio/fuehrung.mp3).
const $ = (id) => document.querySelector(id);
const MUSIK_KEY = "broki-fuehrung-musik"; // Lautstärke in Prozent, 0 = aus (Admin → Erweitert)
const ablage = (name, wert) => { try { return wert === undefined ? localStorage.getItem(name) : localStorage.setItem(name, wert); } catch { return null; } };
const VON = { rechts: ["45vw", "0vh"], links: ["-45vw", "0vh"], unten: ["0vw", "45vh"], oben: ["0vw", "-45vh"] };

/** Hintergrundmusik: sanft ein- und ausblenden, unter Merlins Stimme leiser. */
function erstelleMusik() {
  let audio = null;
  let rampe = null;
  let duckTimer = null;
  let ducke = false;
  const basis = () => (Math.max(0, Math.min(100, Number(ablage(MUSIK_KEY) ?? 30))) / 100) * 0.5; // höchstens halbe Lautstärke
  const ziel = () => basis() * (ducke ? 0.45 : 1);
  function blendeZu(wert, ms, danach) {
    clearInterval(rampe);
    if (!audio) return;
    const von = audio.volume;
    const schritte = Math.max(1, Math.round(ms / 40));
    let i = 0;
    rampe = setInterval(() => {
      i++;
      audio.volume = Math.max(0, Math.min(1, von + ((wert - von) * i) / schritte));
      if (i >= schritte) { clearInterval(rampe); danach?.(); }
    }, 40);
  }
  return {
    start() {
      if (basis() <= 0) return;
      if (!audio) {
        audio = new Audio("/audio/fuehrung.mp3");
        audio.loop = true;
        audio.addEventListener("error", () => { audio = null; }, { once: true }); // Datei fehlt: dann eben ohne Musik
      }
      audio.volume = 0;
      audio.play().then(() => blendeZu(ziel(), 2000)).catch(() => {});
    },
    stopp(ms = 2000) {
      clearTimeout(duckTimer);
      blendeZu(0, ms, () => audio?.pause());
    },
    /** Merlin spricht: Musik leiser. Beim Aufhören erst nach einer kurzen Pause wieder lauter, damit sie zwischen Sätzen nicht pumpt. */
    duck(an) {
      clearTimeout(duckTimer);
      if (an) { ducke = true; if (audio && !audio.paused) blendeZu(ziel(), 300); return; }
      duckTimer = setTimeout(() => { ducke = false; if (audio && !audio.paused) blendeZu(ziel(), 700); }, 900);
    },
    /** Admin: Lautstärke gleich hörbar machen */
    aktualisiere() { if (audio && !audio.paused) blendeZu(ziel(), 200); },
    async probe() {
      if (basis() <= 0) return;
      const t = new Audio("/audio/fuehrung.mp3");
      t.volume = basis();
      await t.play().catch(() => {});
      setTimeout(() => { t.pause(); }, 5000);
    },
  };
}

/**
 * @param {object} navi merlin.js, schnittstelle: beobachte()
 * @returns {{ musik: ReturnType<typeof erstelleMusik> }}
 */
export function starteBuehne(navi) {
  const buehne = $("#buehne");
  const merlin = $("#buehne-merlin");
  const blasen = $("#buehne-bubbles");
  const punkte = $("#buehne-punkte");
  const musik = erstelleMusik();
  new Image().src = "/img/merlin-mund-zu.jpg"; // beide Gesichter vorladen, sonst flackert der erste Mundwechsel
  new Image().src = "/img/merlin-hoert.webp";

  let mundTimer = null;
  let bubbleTimer = [];
  let verbergen = null;

  // ── Mund: abwechselnd zu und auf, solange Merlin spricht. Die Browser-Stimme verrät den Ton nicht, deshalb im Takt von Silben und mit Auslassern. ──
  const mund = (auf) => merlin.classList.toggle("mund-auf", auf);
  function sprechen(an) {
    clearTimeout(mundTimer);
    musik.duck(an);
    if (!an) return mund(false);
    const takt = (auf) => {
      mund(auf);
      const pause = auf ? 85 + Math.random() * 90 : Math.random() < 0.15 ? 220 + Math.random() * 120 : 65 + Math.random() * 105;
      mundTimer = setTimeout(() => takt(!auf), pause);
    };
    takt(true);
  }

  // ── Bubbles ──
  function bubbleWeg() {
    bubbleTimer.forEach(clearTimeout);
    bubbleTimer = [];
    for (const b of blasen.children) {
      b.classList.add("raus");
      setTimeout(() => b.remove(), 600);
    }
  }
  function bubbleRein(b) {
    const [dx, dy] = VON[b.von] ?? VON.rechts;
    const aussen = document.createElement("div");
    aussen.className = "buehne-bubble";
    aussen.style.setProperty("--x", `${b.x ?? 68}%`);
    aussen.style.setProperty("--y", `${b.y ?? 50}%`);
    aussen.style.setProperty("--g", `${b.groesse ?? 56}vmin`);
    aussen.style.setProperty("--dx", dx);
    aussen.style.setProperty("--dy", dy);
    const kreis = document.createElement("div");
    kreis.className = "bubble-kreis";
    kreis.style.animationDelay = `${-Math.random() * 4}s`; // jede schwebt in ihrem eigenen Takt
    const bild = document.createElement("img");
    bild.src = `/img/fuehrung/${b.datei}`;
    bild.alt = b.titel ?? "";
    bild.style.objectPosition = b.fokus ?? "50% 50%";
    bild.style.transformOrigin = b.fokus ?? "50% 50%";
    bild.style.transform = `scale(${b.zoom ?? 1})`;
    kreis.append(bild);
    aussen.append(kreis);
    blasen.append(aussen);
  }

  function zeige(s) {
    if (buehne.hidden) {
      clearTimeout(verbergen);
      buehne.hidden = false;
      void buehne.offsetWidth; // damit das Einblenden läuft
      buehne.classList.add("an");
      musik.start();
      $("#buehne-ende").focus({ preventScroll: true }); // Esc soll hier ankommen
    }
    $("#buehne-text").textContent = s.text ?? ""; // nur für Screenreader
    merlin.dataset.platz = s.bilder?.length ? "links" : "mitte";
    if (punkte.children.length !== s.gesamt) punkte.replaceChildren(...Array.from({ length: s.gesamt }, () => document.createElement("li")));
    [...punkte.children].forEach((p, i) => { p.className = i < s.index ? "war" : i === s.index ? "ist" : ""; });
    bubbleWeg();
    for (const b of s.bilder ?? []) bubbleTimer.push(setTimeout(() => bubbleRein(b), 550 + (b.nach ?? 0))); // Merlin gleitet zuerst, dann kommen die Bubbles
  }

  function ende() {
    clearTimeout(mundTimer);
    mund(false);
    bubbleWeg();
    musik.stopp(1800);
    buehne.classList.remove("an");
    verbergen = setTimeout(() => { buehne.hidden = true; }, 700);
  }

  // Klick auf Merlin oder "Führung beenden" bricht ab (Esc macht merlin.js)
  merlin.addEventListener("click", () => navi.beendeFuehrung());
  $("#buehne-ende").addEventListener("click", () => navi.beendeFuehrung());
  navi.beobachte({
    fuehrung: (s) => (s && !s.aus ? zeige(s) : ende()),
    zustand: (name) => sprechen(name === "spricht" && !buehne.hidden),
  });
  return { musik };
}
