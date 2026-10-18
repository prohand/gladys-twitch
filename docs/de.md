# Twitch

Verfolgen Sie Twitch-Kanäle in Gladys: Sehen Sie, wer live ist, in welcher
Kategorie und vor wie vielen Zuschauern, starten Sie Szenen, wenn ein Stream
beginnt oder endet, und zeigen Sie die Kanäle auf einem Dashboard an.

Die Integration liest nur **öffentliche** Daten. Es wird kein Twitch-Konto
verknüpft: Sie nutzt die Zugangsdaten einer kostenlosen Twitch-Anwendung, die
Sie einmal anlegen.

## 1. Eine Twitch-Anwendung anlegen

1. Öffnen Sie die [Twitch-Entwicklerkonsole](https://dev.twitch.tv/console/apps/create)
   und melden Sie sich mit einem beliebigen Twitch-Konto an (die
   Zwei-Faktor-Authentifizierung muss aktiv sein).
2. Füllen Sie das Formular aus:
   - **Name**: ein eindeutiger Name, z. B. `Gladys mein-zuhause`;
   - **OAuth Redirect URLs**: `http://localhost` (wird nicht genutzt, ist aber
     Pflicht);
   - **Kategorie**: `Other`;
   - **Client-Typ**: `Vertraulich`.
3. Klicken Sie auf **Erstellen**, dann bei der neuen Anwendung auf
   **Verwalten**.
4. Kopieren Sie die **Client-ID**, klicken Sie dann auf **Neues Geheimnis**
   und kopieren Sie das **Client-Secret** (es wird nur einmal angezeigt).

## 2. Die Integration konfigurieren

1. Öffnen Sie in Gladys den Reiter **Konfiguration** der Integration.
2. Fügen Sie die **Client-ID** und das **Client-Secret** ein.
3. Tragen Sie unter **Kanäle** die zu beobachtenden Kanäle ein, durch Kommas
   getrennt. Namen (`twitchdev`), `@Namen` und Links
   (`https://www.twitch.tv/twitchdev`) werden akzeptiert, bis zu 100 Kanäle.
4. Ändern Sie bei Bedarf das **Aktualisierungsintervall**: Twitch wird
   standardmäßig alle 60 Sekunden abgefragt (30 Sekunden bis eine Stunde).
5. Speichern Sie und klicken Sie auf **Verbindung testen**: Die Antwort nennt
   die Zahl der gefundenen Kanäle, wie viele live sind und welche Namen es auf
   Twitch nicht gibt.
6. Öffnen Sie den Reiter **Erkennung** und fügen Sie die gewünschten Kanäle
   als Geräte hinzu.

## Was Sie erhalten

Ein Gerät pro Kanal, `Twitch <Kanal>` genannt, mit:

| Funktion | Wert                                                       |
| -------- | ---------------------------------------------------------- |
| Live     | 1, wenn der Kanal streamt, sonst 0                         |
| Viewers  | Aktuelle Zuschauerzahl                                     |
| Uptime   | Minuten seit Beginn des Streams                            |
| Title    | Titel des Streams (der letzte, wenn offline)               |
| Category | Gespieltes Spiel oder Kategorie (die letzte, wenn offline) |

Das Gerät hängt an der Twitch-**Benutzer-ID** des Kanals: Ein Streamer, der
seinen Kanal umbenennt, behält dasselbe Gerät, seinen Verlauf und seine
Szenen.

## Szenen

Die Integration fügt dem Szenen-Editor eigene Karten hinzu (Gladys 5.1 oder
neuer).

Auslöser:

- **Twitch-Stream gestartet** — ein beobachteter Kanal geht live. Optional
  den Kanal und eine Kategorie wählen (genauer Name, z. B. `Just Chatting`).
  Variablen: `{{triggerEvent.data.channel_name}}`, `title`, `game` und `url`.
- **Twitch-Stream beendet** — ein beobachteter Kanal beendet seinen Stream.
  Variable: `duration_minutes`, die Dauer des Streams.
- **Twitch-Kategorie geändert** — ein Live-Kanal wechselt das Spiel.
  Variablen: `game`, `previous_game`, `title`.

Aktionen:

- **Twitch-Kanal prüfen** — ist ein beliebiger öffentlicher Kanal (beobachtet
  oder nicht) gerade live? Liefert `is_live`, `channel_name`, `viewer_count`,
  `title`, `game` und `uptime_minutes` für die folgenden Aktionen.
- **Twitch-Kanäle aktualisieren** — liest die beobachteten Kanäle sofort,
  ohne auf die nächste Aktualisierung zu warten, und liefert `live_count`.

Sie können auch den Standard-Auslöser und die Standard-Bedingung
**Gerätezustand** auf die Funktionen **Live** oder **Viewers** anwenden
(„wenn mehr als 100 Zuschauer…“).

Beispiel: _Wenn auf meinem Lieblingskanal ein Stream startet, schicke mir
„{{triggerEvent.data.channel_name}} ist live: {{triggerEvent.data.title}}
{{triggerEvent.data.url}}“_.

## Dashboard

Fügen Sie einem Dashboard das Widget **Twitch-Kanäle** hinzu. Es zeigt, wie
viele Kanäle live sind, dann eine Zeile pro Kanal: Avatar, Live-Abzeichen,
Kategorie und Zuschauer. Tippen Sie auf eine Zeile für den Titel des Streams
und einen Link zum Kanal. Die Schaltfläche **Aktualisieren** fragt Twitch
sofort ab.

Widget-Einstellungen: die angezeigten Kanäle wählen (alle, wenn leer) und/oder
nur die Live-Kanäle anzeigen.

## Gut zu wissen

- Ein Stream gilt erst als beendet, wenn er in zwei Twitch-Antworten
  hintereinander fehlt: Twitch vergisst einen Live-Stream manchmal für eine
  Anfrage, und Szenen würden sonst ein Ende und eine Minute später einen
  neuen Start melden.
- Ein Kanal, der schon live ist, wenn er zur Liste hinzugefügt wird, löst
  **Twitch-Stream gestartet** nicht aus: Sein Stream hat nicht gerade
  begonnen.
- Die Integration merkt sich den letzten Zustand jedes Kanals in ihrem
  Datenvolume: Nach einem Neustart wird ein laufender Stream nicht erneut
  gemeldet, ein inzwischen gestarteter schon.

## Fehlerbehebung

- **„Twitch hat die Client-ID oder das Client-Secret abgelehnt“**: Kopieren
  Sie beide erneut aus der Entwicklerkonsole. Ein neues Geheimnis macht das
  vorherige ungültig.
- **Ein Kanal ist „auf Twitch nicht gefunden“**: Prüfen Sie die Schreibweise
  in der Adresse des Kanals.
- Das Geräte-Abzeichen zeigt **Cloud**, wenn Twitch antwortet, sonst **nicht
  erreichbar**. Details stehen in den Logs der Integration in der
  Gladys-Oberfläche.
