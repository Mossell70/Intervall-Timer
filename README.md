# Intervall-Timer

Web-App für Intervalltraining mit mehreren, frei konfigurierbaren Timern – mit Tönen, Countdown-Piepsern und deutschen Sprachansagen. Läuft komplett im Browser, ohne Anmeldung und ohne Server.

**Online nutzen:** https://mossell70.github.io/Intervall-Timer/

## Funktionen

- Beliebig viele Timer anlegen, bearbeiten, duplizieren und löschen
- Pro Timer einstellbar:
  - **Intervallzeit** – Dauer eines Intervalls
  - **Übungen pro Intervall** – die Intervallzeit wird gleichmäßig auf die Übungen aufgeteilt, die direkt nacheinander laufen (optional mit Namen)
  - **Pause zwischen Übungen** – zusätzlich zur Übungszeit, nur zwischen den Übungen eines Intervalls
  - **Pause zwischen Intervallen**
  - **Intervalle pro Runde**
  - **Runden** (Wiederholungen)
  - **Rundenpause**
  - **Vorbereitungszeit** vor dem Start
- Ablaufvorschau mit Gesamtdauer und farbigem Zeitstrahl
- Vollbild-Anzeige während des Trainings mit Phasenfarben, großer Restzeit, Runden-/Intervallzähler und Vorschau auf die nächste Übung
- Pause/Fortsetzen, eine Phase vor oder zurück, Beenden
- Signale: Start-/Pausentöne, Piepser in den letzten 3 Sekunden, Sprachansagen („Pause. Als Nächstes: Kniebeugen“) – einzeln abschaltbar
- Bildschirm bleibt während des Trainings an (sofern der Browser die Wake-Lock-API unterstützt)
- Speicherung im Browser (localStorage), Export/Import als JSON-Datei zum Übertragen auf andere Geräte

### Ablauf eines Timers

```
Vorbereitung
Runde 1:  [Übung 1 · Ü-Pause · Übung 2 · Ü-Pause · Übung 3]  Intervallpause  [Übung 1 · …]  …  (Intervalle pro Runde)
Rundenpause
Runde 2:  …
```

Nach der letzten Übung eines Intervalls folgt keine Übungspause, nach dem letzten Intervall einer Runde keine Intervallpause nach der letzten Runde keine Rundenpause. Pausen mit 0 Sekunden werden übersprungen.

### Bedienung per Tastatur (während des Trainings)

| Taste | Aktion |
|---|---|
| Leertaste | Pause / Fortsetzen |
| → | Nächste Phase |
| ← | Phase neu starten (innerhalb der ersten 2 s: vorherige Phase) |
| Esc | Timer beenden |

## Technik

- Reines HTML, CSS und JavaScript (ES-Module), keine Build-Schritte und keine Laufzeit-Abhängigkeiten
- Web Audio API für Töne, Web Speech API für Sprachansagen (deutsche Stimme des Geräts)
- Zeitmessung über die Systemuhr statt über Zähler – auch bei Hintergrund-Tabs bleibt der Timer genau
- Content-Security-Policy, Ausgabe von Benutzertexten ausschließlich als Text (kein `innerHTML`), Validierung und Begrenzung aller Eingaben und Importe

```
index.html          Oberfläche (Übersicht, Editor, Trainingsansicht)
css/style.css       Gestaltung
js/schedule.js      Konfiguration prüfen und in Phasen übersetzen (reine Logik)
js/engine.js        Ablaufsteuerung (Start, Pause, Sprünge)
js/storage.js       Speichern, Export, Import
js/audio.js         Töne und Sprachansagen
js/app.js           Verbindung von Oberfläche und Logik
tests/              Unit-Tests (node:test)
```

## Lokal starten und testen

Voraussetzung: Node.js ab Version 20.

```bash
npm test          # Unit-Tests
npm run check     # Syntaxprüfung
npm start         # lokaler Server auf http://localhost:8080
```

Alternativ genügt jeder statische Webserver, z. B. `python3 -m http.server`. Direktes Öffnen der `index.html` per Doppelklick funktioniert wegen der ES-Module nicht.

## Deployment

Jeder Push auf `main` führt die Tests aus und veröffentlicht die App über GitHub Actions auf GitHub Pages (`.github/workflows/pages.yml`).

## Hinweise

- Auf iPhone/iPad funktionieren Töne nur, wenn der Stummschalter aus ist; die Sprachausgabe hängt von den installierten Systemstimmen ab.
- Gespeicherte Timer gelten pro Browser und Gerät. Beim Löschen der Browserdaten gehen sie verloren – vorher exportieren.
