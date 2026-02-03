# Paul AI Chat (Shopware 6 Plugin)

Ein leichtgewichtiges Shopware-6-Plugin, das ein schwebendes AI-Chat-Widget in der Storefront bereitstellt. Es ergänzt die Storefront um eine konfigurierbare Chat-UI (via iFrame) sowie hilfreiche API-Endpunkte für Kontext-Token, Preisabfragen und ein Kontaktformular.

## Features

- Schwebendes Chat-Widget in der Storefront (per iFrame)
- Konfigurierbare Begrüßungsnachricht, Button-Label und Position
- Unterstützung für verschiedene LLM-Modelle (Ollama-Auswahl in der Plugin-Konfiguration)
- API-Endpunkte:
  - JWT-Kontext-Token für den Chat
  - Preisabfrage für eingeloggte Kunden
  - Kontaktformular mit Mailversand

## Anforderungen

- Shopware **6.7.x**
- Konfigurierter Mailversand in Shopware (für das Kontaktformular)
- Eine Chat-UI (Web-App) die via iFrame eingebettet werden kann
- Umgebungsvariable `CHAT_AUTH_SECRET` für die JWT-Signierung

## Installation

1. Plugin in den Shopware-Plugin-Ordner kopieren:
   ```bash
   custom/plugins/PaulAiChat
   ```
2. Plugin in der Administration installieren und aktivieren.

## Konfiguration

In der Shopware-Administration unter **Einstellungen → Plugins → Paul AI Chat**:

- **Chat server URL (iframe)**: URL der Chat-UI (z. B. `https://your-chat-app.example/chat`)
- **Ollama model**: Auswahlliste unterstützter Modelle
- **Welcome message**: Begrüßungstext im Widget
- **Auto-open on first visit?**: Öffnet das Widget automatisch
- **Button label**: Beschriftung des Chat-Buttons
- **Position**: `bottom-right` oder `bottom-left`

Zusätzlich muss die Umgebungsvariable `CHAT_AUTH_SECRET` gesetzt werden (z. B. im Shopware-Container), damit der Kontext-Token-Endpunkt ein JWT signieren kann.

## Storefront-Integration

Das Plugin hängt die Konfiguration in der Storefront an die Page-Extension `paulAiChat`. Dort finden sich die in der Administration gesetzten Werte:

- `chatUrl`
- `llmModel`
- `welcomeMessage`
- `autoOpen`
- `buttonLabel`
- `position`

## API-Endpunkte

### Kontext-Token

`GET /paul-ai-chat/context-token`

Antwort:
```json
{ "token": "<jwt>" }
```

- Das JWT enthält u. a. `salesChannelId`, `loggedIn` und (falls vorhanden) die Kunden-ID.
- Token ist **60 Sekunden** gültig.
- Erfordert die Umgebungsvariable `CHAT_AUTH_SECRET`.

### Preisabfrage (nur eingeloggte Kunden)

`POST /paul-ai-chat/prices`

Request:
```json
{ "productIds": ["<product-id>", "<product-id>"] }
```

Antwort (auszug):
```json
{
  "prices": {
    "<product-id>": {
      "name": "Produktname",
      "calculatedPrice": {
        "unitPrice": 99.0,
        "totalPrice": 99.0,
        "listPrice": null,
        "regulationPrice": null
      },
      "calculatedPrices": [
        {
          "unitPrice": 90.0,
          "totalPrice": 90.0,
          "quantity": 10,
          "listPrice": null
        }
      ],
      "hasAdvancedPrices": true
    }
  }
}
```

### Kontaktformular

`POST /paul-ai-chat/contact`

Request (JSON oder Form-Data):
```json
{
  "name": "Max Mustermann",
  "email": "max@example.com",
  "phone": "+49 123 456",
  "company": "Beispiel GmbH",
  "message": "Ich habe eine Frage...",
  "productRef": "SKU-123",
  "quantity": "10",
  "deliveryZip": "10115"
}
```

Antwort:
```json
{ "success": true }
```

## Hinweise zur Chat-UI

Die Chat-UI wird **nicht** von diesem Plugin mitgeliefert. Sie muss separat bereitgestellt werden und kann die Shopware-Endpunkte nutzen:

- `context-token`, um einen kurzlebigen JWT zu erhalten
- `prices`, um Preise des eingeloggten Kunden abzufragen
- `contact`, um Anfragen an den Shopbetreiber zu senden

## Lizenz

MIT