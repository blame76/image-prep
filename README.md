# Image Prep – PWA starter

Ein bewusst kleines, statisches Browser-Tool für Webentwickler: Profilbilder und Share-Preview-Bilder lokal zuschneiden, skalieren und exportieren.

## Ziel

URL/Server spielen für die eigentliche Bildbearbeitung keine Rolle. Das Originalbild wird per File API geladen, per Canvas verarbeitet und als Blob wieder lokal heruntergeladen.

**Privacy invariant:** Bilddaten dürfen den Browser nicht verlassen.

## MVP

- JPEG, PNG und WebP als Eingabe
- Presets:
  - Profil 800 × 800
  - Profil 1024 × 1024
  - Open Graph 1200 × 630
  - 16:9 1200 × 675
  - Square 1080 × 1080
  - Portrait 1080 × 1350
- Ausschnitt per Drag
- eigene Ausgabemaße von 16 × 16 bis maximal 16,7 Megapixel
- Schutzgrenzen von 25 MB und 40 Megapixeln für Eingabebilder
- Zoom
- Kreisvorschau für quadratische Bilder; der Export bleibt quadratisch
- Export als WebP, JPEG oder PNG
- keine Accounts
- kein Tracking
- kein Upload
- PWA-App-Shell / Offline-Grundlage
- Vanilla HTML/CSS/JS

## Non-Goals für v0.1

- kein HEIC/HEIF-Decoder
- kein AVIF-Export als Pflichtfeature
- keine Gesichtserkennung
- keine automatische Motivwahl
- kein Batch-Processing
- kein serverseitiges Rendering
- keine Cloud-Speicherung
- kein eigenes Dateimanagement
- keine Analytics
- keine Benutzerkonten

## Sicherheits- und Datenschutzregeln

1. Keine Bild-Uploads oder Remote-Analyse-APIs.
2. Keine Analytics-/Tracking-Skripte.
3. Keine externen Fonts, CDNs oder Runtime-Abhängigkeiten.
4. Service Worker cached nur Same-Origin-App-Dateien.
5. `connect-src 'self'` bleibt Teil der CSP.
6. Neue Features dürfen das Privacy-Invariant nur nach expliziter Produktentscheidung ändern.

## Lokal starten

```bash
npm install
npx playwright install chromium
npm run serve
```

Dann `http://127.0.0.1:4173` öffnen.

## Tests

```bash
npm test
```

Die Acceptance-Suite prüft Desktop- und Mobile-Chromium, Exportformate, Bildgeometrie, Tastaturbedienung, Offline-Nutzung und das Netzwerk-Invariant.

## Sinnvolle nächste Iterationen

- explizite Dateigrößenanzeige vor Download
- AVIF nur bei nachgewiesenem Browser-Support
- "Safe area" Overlay für Profilbilder
- Preset-Definitionen aus JSON
