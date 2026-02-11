# Paul AI Chat (Shopware 6 Plugin)

A lightweight Shopware 6 plugin that adds a floating AI chat widget to the storefront. It provides a configurable chat UI (via iFrame) plus helpful API endpoints for context tokens, price lookups, and a contact form.

> Note: The initial defaults in the plugin configuration are German (for example, the welcome message and button label). You can override all labels and texts in the Shopware admin.

## Features

- Floating chat widget in the storefront (via iFrame)
- Configurable welcome message, button label, and position
- Support for multiple LLM models (selectable in plugin config)
- API endpoints:
  - JWT context token for the chat
  - Price lookup for logged-in customers
  - Contact form with email delivery

## Requirements

- Shopware **6.7.x**
- Configured mail delivery in Shopware (for the contact form)
- A chat UI (web app) that can be embedded via iFrame
- Environment variable `CHAT_AUTH_SECRET` for JWT signing

## Installation

1. Copy the plugin into the Shopware plugin directory:
   ```bash
   custom/plugins/PaulAiChat
   ```
2. Install and activate the plugin in the Shopware administration.

## Configuration

In the Shopware admin under **Settings → Plugins → Paul AI Chat**:

- **Chat server URL (iframe)**: URL of the chat UI (e.g., `https://your-chat-app.example/chat`)
- **Ollama model**: Select from the available models
- **Welcome message**: Greeting text shown in the widget
- **Auto-open on first visit?**: Automatically open the widget
- **Button label**: Label for the chat button
- **Position**: `bottom-right` or `bottom-left`

Additionally, set the environment variable `CHAT_AUTH_SECRET` (e.g., in the Shopware container), so the context-token endpoint can sign JWTs.

## Storefront Integration

The plugin adds the configuration to the storefront page extension `paulAiChat`. The following values are exposed to the frontend:

- `chatUrl`
- `llmModel`
- `welcomeMessage`
- `autoOpen`
- `buttonLabel`
- `position`

## API Endpoints

### Context Token

`GET /paul-ai-chat/context-token`

Response:
```json
{ "token": "<jwt>" }
```

- The JWT includes `salesChannelId`, `loggedIn`, and (if present) the customer ID.
- Token validity is **60 seconds**.
- Requires the `CHAT_AUTH_SECRET` environment variable.

### Price Lookup (logged-in customers only)

`POST /paul-ai-chat/prices`

Request:
```json
{ "productIds": ["<product-id>", "<product-id>"] }
```

Response (excerpt):
```json
{
  "prices": {
    "<product-id>": {
      "name": "Product name",
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

### Contact Form

`POST /paul-ai-chat/contact`

Request (JSON or form-data):
```json
{
  "name": "Max Mustermann",
  "email": "max@example.com",
  "phone": "+49 123 456",
  "company": "Example GmbH",
  "message": "I have a question...",
  "productRef": "SKU-123",
  "quantity": "10",
  "deliveryZip": "10115"
}
```

Response:
```json
{ "success": true }
```

## License

MIT