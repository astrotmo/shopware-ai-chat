// custom/plugins/PaulAiChat/src/Resources/app/storefront/src/plugin/ai-chat.plugin.js
const Base = window.PluginBaseClass;

export default class AiChatPlugin extends Base {
    init() {
        const { chatUrl, buttonLabel, autoOpen, position } = this.el.dataset;

        this.chatUrl = this.normalizeUrl(chatUrl);
        this.buttonLabel = buttonLabel || 'Chat';
        this.autoOpen = autoOpen === '1';
        this.position = (position || 'bottom-left').toLowerCase(); // 'bottom-left' | 'bottom-right'

        // Build floating UI
        this.buildUi();

        // Restore previous session (so you can navigate the shop and keep chat)
        this.restoreHistory();

        // Open automatically if desired
        if (this.autoOpen) this.open();
    }

    normalizeUrl(u) {
        if (!u) return null;
        try { return new URL(u, window.location.origin).toString(); }
        catch { return /^https?:\/\//i.test(u) ? u : `http://${u}`; }
    }

    buildUi() {
        // Wrapper is fixed; doesn’t block page interactions (no overlay/backdrop)
        this.wrapper = document.createElement('div');
        this.wrapper.className = 'paul-ai-chat-wrap';
        this.wrapper.classList.add(
            this.position === 'bottom-right' ? 'paul-ai-chat-bottom-right' : 'paul-ai-chat-bottom-left'
        );

        // Floating button
        this.fab = document.createElement('button');
        this.fab.type = 'button';
        this.fab.className = 'paul-ai-chat-button';
        this.fab.setAttribute('aria-haspopup', 'dialog');
        this.fab.setAttribute('aria-expanded', 'false');
        this.fab.textContent = this.buttonLabel;
        this.fab.addEventListener('click', () => this.toggle());

        // Chat panel (hidden by default)
        this.panel = document.createElement('section');
        this.panel.className = 'paul-ai-chat-window';
        this.panel.setAttribute('role', 'dialog');
        this.panel.setAttribute('aria-label', 'Chat');

        // Header
        const header = document.createElement('header');
        header.className = 'paul-ai-chat-header';

        const title = document.createElement('div');
        title.className = 'paul-ai-chat-title';
        title.textContent = 'Support Chat';

        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'paul-ai-chat-close';
        close.setAttribute('aria-label', 'Close chat');
        close.innerHTML = '×';
        close.addEventListener('click', () => this.close());

        header.appendChild(title);
        header.appendChild(close);

        // Messages list
        this.messagesEl = document.createElement('div');
        this.messagesEl.className = 'paul-ai-chat-messages';
        this.messagesEl.setAttribute('aria-live', 'polite');

        // Form
        this.form = document.createElement('form');
        this.form.className = 'paul-ai-chat-form';
        this.input = document.createElement('input');
        this.input.type = 'text';
        this.input.className = 'paul-ai-chat-input';
        this.input.placeholder = 'Type your message…';
        this.input.autocomplete = 'off';

        this.sendBtn = document.createElement('button');
        this.sendBtn.type = 'submit';
        this.sendBtn.className = 'paul-ai-chat-send';
        this.sendBtn.textContent = 'Send';

        this.form.appendChild(this.input);
        this.form.appendChild(this.sendBtn);

        this.form.addEventListener('submit', (e) => this.onSubmit(e));

        // Assemble
        this.panel.appendChild(header);
        this.panel.appendChild(this.messagesEl);
        this.panel.appendChild(this.form);

        // Initially hidden
        this.panel.style.display = 'none';

        // Mount into root
        this.wrapper.appendChild(this.fab);
        this.wrapper.appendChild(this.panel);
        document.body.appendChild(this.wrapper);
    }

    toggle() {
        if (this.panel.style.display === 'none') this.open(); else this.close();
    }

    open() {
        this.panel.style.display = 'flex';
        this.fab.setAttribute('aria-expanded', 'true');
        this.input?.focus();
        this.scrollMessagesToEnd();
        this.saveOpenState(true);
    }

    close() {
        this.panel.style.display = 'none';
        this.fab.setAttribute('aria-expanded', 'false');
        this.saveOpenState(false);
    }

    scrollMessagesToEnd() {
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }

    appendBubble(text, who = 'bot', isError = false) {
        const bubble = document.createElement('div');
        bubble.className = `paul-ai-chat-bubble ${who === 'user' ? 'from-user' : 'from-bot'}`;
        if (isError) bubble.classList.add('is-error');
        bubble.textContent = text;
        this.messagesEl.appendChild(bubble);
        this.scrollMessagesToEnd();
    }

    appendPending() {
        const p = document.createElement('div');
        p.className = 'paul-ai-chat-pending from-bot';
        p.textContent = '…';
        this.messagesEl.appendChild(p);
        this.scrollMessagesToEnd();
        return p;
    }

    async onSubmit(e) {
        e.preventDefault();
        if (!this.chatUrl || !this.input) return;

        const message = (this.input.value || '').trim();
        if (!message) return;

        // show user bubble immediately
        this.appendBubble(message, 'user');
        this.persistMessage({ who: 'user', text: message });

        this.input.value = '';
        this.input.focus();

        // show pending
        const pending = this.appendPending();

        try {
            const res = await fetch(this.chatUrl, {
                method: 'POST',
                mode: 'cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message })
            });

            const text = await res.text();
            if (!res.ok) throw new Error(text || `HTTP ${res.status}`);

            let payload;
            try { payload = JSON.parse(text); } catch { payload = { reply: text }; }

            const replyText = (payload.reply ?? payload.message ?? text).toString();
            pending.remove();
            this.appendBubble(replyText, 'bot');
            this.persistMessage({ who: 'bot', text: replyText });
        } catch (err) {
            pending.remove();
            const msg = (err && err.message) ? err.message : String(err);
            this.appendBubble(`Error: ${msg}`, 'bot', true);
            this.persistMessage({ who: 'bot', text: `Error: ${msg}`, isError: true });
        }
    }

    // --- lightweight session persistence so navigation keeps the chat ---
    storageKey() { return 'paul-ai-chat-history'; }
    openKey() { return 'paul-ai-chat-open'; }

    persistMessage(m) {
        const key = this.storageKey();
        const arr = this.readJson(key) || [];
        arr.push({ ...m, ts: Date.now() });
        sessionStorage.setItem(key, JSON.stringify(arr));
    }

    saveOpenState(open) {
        sessionStorage.setItem(this.openKey(), open ? '1' : '0');
    }

    restoreHistory() {
        const arr = this.readJson(this.storageKey()) || [];
        for (const m of arr) {
            this.appendBubble(m.text, m.who === 'user' ? 'user' : 'bot', !!m.isError);
        }
        if ((sessionStorage.getItem(this.openKey()) || '0') === '1') {
            this.open();
        }
    }

    readJson(key) {
        try { return JSON.parse(sessionStorage.getItem(key) || 'null'); }
        catch { return null; }
    }
}
