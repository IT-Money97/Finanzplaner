# Moneta – dein Finanzplan

Eine responsive, installierbare Finanzplaner-PWA ohne kostenpflichtige Abhängigkeiten.

## Funktionen

- Einnahmen und Ausgaben mit Datum und Kategorie erfassen
- Wiederkehrende monatliche und jährliche Einnahmen und Ausgaben planen, inklusive Buchungstag
- Monat, 3 Monate, Jahr oder einen eigenen Zeitraum auswerten
- Einnahmen/Ausgaben als Liniendiagramm vergleichen und Kategorien als Donut-Diagramm sehen
- Mehrere Buchungen per fortlaufender Spracheingabe erfassen, lokal erkennen und vor dem Speichern prüfen
- Wiederkehrende Buchungen direkt beim Erfassen anlegen
- JSON-Export und -Import zur Sicherung und Wiederherstellung der eigenen Daten
- Offline-Nutzung nach dem ersten Laden über den Service Worker

## Daten & Datenschutz

Buchungen werden ausschließlich im lokalen Speicher des Browsers auf diesem Gerät abgelegt. Es gibt kein Benutzerkonto, keinen Server-Sync und keinen KI-Anbieter. Die Spracheingabe verwendet lokale Zuordnungsregeln, nicht generative KI. Browser-Spracherkennung ist nicht in jedem Browser verfügbar und kann Audio an den Spracherkennungsanbieter des Browsers übermitteln; bei fehlendem Support kann der erkannte Text von Hand eingegeben werden. Erkannte Buchungen werden vor dem Speichern einzeln überprüfbar angezeigt. Ein Backup wird über **Daten exportieren** heruntergeladen und kann über **Daten importieren** auf einem Gerät wiederhergestellt werden; der Import ersetzt nach Bestätigung die dort gespeicherten Daten.

## Lokal starten

Service Worker und Installation benötigen `localhost` oder HTTPS. Im Projektordner z. B.:

```powershell
python -m http.server 8000
```

Danach `http://localhost:8000` öffnen. Auf einem Smartphone kann die App nach Veröffentlichung über den Browser zum Startbildschirm hinzugefügt werden. Geräteübergreifende Synchronisierung ist bewusst nicht aktiviert.

## Kostenlos veröffentlichen

Der Workflow unter `.github/workflows/deploy.yml` veröffentlicht die statische App auf GitHub Pages, sobald die Dateien auf den Branch `main` gepusht werden. Ein Repository, GitHub-Zugang und aktiviertes GitHub Pages (Quelle: **GitHub Actions**) sind erforderlich. Nach dem ersten erfolgreichen Workflow ist die App über die Pages-URL des Repositories erreichbar. Eigene Domain ist optional.

Die App ist ein Planungswerkzeug, keine Anlage-, Steuer- oder Rechtsberatung.
