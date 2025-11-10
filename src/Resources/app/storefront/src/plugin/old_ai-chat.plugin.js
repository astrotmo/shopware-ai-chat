// custom/plugins/PaulAiChat/src/Resources/app/storefront/src/plugin/ai-chat.plugin.js

const Base =  window.PluginBaseClass;

export default class AiChatPlugin extends Base {
    init() {
        // Read config from data-attributes
        const { chatUrl, buttonLabel, autoOpen, position } = this.el.dataset;

        this.chatUrl = this.normalizeUrl(chatUrl);
        this.button = document.getElementById('open-chat-modal');
        this.form = document.getElementById('chat-form');
        this.input = document.getElementById('chat-input');
        this.sendBtn = document.getElementById('chat-send-btn');
        this.responseBox = document.getElementById('chat-response');

        if (this.button) {
            this.button.addEventListener('click', () => {
                if (autoOpen === '1' && this.input) this.input.focus();
            }, { once: true });
        }

        if (this.form) {
            this.form.addEventListener('submit', (e) => this.onSubmit(e));
        }
    }

    normalizeUrl(u) {
        if (!u) return null;
        try {
            return new URL(u, window.location.origin).toString();
        } catch {
            // attempt to prefix http:// if merchant saved a bare host
            return /^https?:\/\//i.test(u) ? u : `http://${u}`;
        }
    }

    async onSubmit(e) {
        e.preventDefault();
        if (!this.chatUrl || !this.input) return;

        const message = this.input.value.trim();
        if (!message) return;

        // prevent double submit
        if (this.sendBtn) this.sendBtn.disabled = true;

        try {
            const res = await fetch(this.chatUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // include credentials if your server expects cookies:
                // credentials: 'include',
                body: JSON.stringify({ message })
            });

            const text = await res.text();
            if (!res.ok) throw new Error(text || `HTTP ${res.status}`);

            // Try to parse JSON, fall back to raw text
            let payload;
            try { payload = JSON.parse(text); } catch { payload = { reply: text }; }

            this.showResponse(payload);
            this.input.value = '';
        } catch (err) {
            this.showResponse({ error: String(err.message || err) });
        } finally {
            if (this.sendBtn) this.sendBtn.disabled = false;
        }
    }

    showResponse(payload) {
        if (!this.responseBox) return;
        // Simple safe rendering
        const msg = payload.error ? `Error: ${payload.error}` : (payload.reply ?? JSON.stringify(payload));
        this.responseBox.textContent = msg;
    }
}
