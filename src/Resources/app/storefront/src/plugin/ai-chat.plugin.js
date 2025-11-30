// custom/plugins/PaulAiChat/src/Resources/app/storefront/src/plugin/ai-chat.plugin.js
const Base = window.PluginBaseClass;

export default class AiChatPlugin extends Base {
    init() {
        const { chatUrl, buttonLabel, autoOpen, position } = this.el.dataset;

        this.chatUrl = this.normalizeUrl(chatUrl);
        this.buttonLabel = buttonLabel || 'Chat';
        this.autoOpen = autoOpen === '1';
        this.position = (position || 'bottom-left').toLowerCase(); // 'bottom-left' | 'bottom-right'
        this.preferredPosition = this.position; // <-- remember configured corner


        // Build floating UI
        this.buildUi();

        // Restore previous session (so you can navigate the shop and keep chat)
        this.restoreHistory();

        // Avoid collisions
        this.enableSmartAvoidance();

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

        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'paul-ai-chat-clear';
        clearBtn.setAttribute('aria-label', 'Clear chat');
        clearBtn.innerHTML = '🗑️';
        clearBtn.title = 'Clear chat history';
        clearBtn.addEventListener('click', () => this.clearHistory());

        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'paul-ai-chat-close';
        close.setAttribute('aria-label', 'Close chat');
        close.innerHTML = '×';
        close.title = 'Close chat';
        close.addEventListener('click', () => this.close());

        header.appendChild(title);
        header.appendChild(clearBtn);
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

        if (who === 'bot') {
            // allow simple HTML for links, but we only generate it ourselves via linkify()
            bubble.innerHTML = this.linkify(text);
        } else {
            // never render user input as HTML
            bubble.textContent = text;
        }

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

    linkify(text) {
    // Very simple URL regex, good enough for our product links
    const urlRegex = /(https?:\/\/[^\s]+)/g;

    return text.replace(urlRegex, (url) => {
        // open in same tab so user stays in shop
        return `<a href="${url}" class="paul-ai-chat-link">Zum Produkt</a>`;
    });
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

    clearHistory() {
        const key = this.storageKey();
        sessionStorage.removeItem(key);
        this.messagesEl.innerHTML = '';
        this.appendBubble('Chat history cleared.', 'bot');
    }

    readJson(key) {
        try { return JSON.parse(sessionStorage.getItem(key) || 'null'); }
        catch { return null; }
    }

    currentPosition() {
    return this.position;
    }

    setPosition(pos) {
        // remove both corner classes, then apply new one
        this.wrapper.classList.remove('paul-ai-chat-bottom-left', 'paul-ai-chat-bottom-right');
        if (pos === 'bottom-right') {
            this.wrapper.classList.add('paul-ai-chat-bottom-right');
        } else {
            pos = 'bottom-left';
            this.wrapper.classList.add('paul-ai-chat-bottom-left');
        }
        this.position = pos;
    }

    getActiveBoxEl() {
        // If panel is visible, avoid based on the panel; otherwise based on the floating button.
        const panelVisible = this.panel && this.panel.style.display !== 'none';
        return panelVisible ? this.panel : this.fab;
    }

    rectsOverlap(a, b, margin = 8) {
        // add a small margin so we avoid near-collisions
        return !(
            a.right < b.left + margin ||
            a.left  > b.right - margin ||
            a.bottom < b.top + margin ||
            a.top    > b.bottom - margin
        );
    }

    visibleRect(el) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 40) return null; // tiny elements aren't sidebars
    return rect;
    }

    // Heuristic: find right/left side panels that Shopware (and many themes) use for cart/offcanvas
    findObstructionRects() {
        const selectors = [
            '.offcanvas', '.offcanvas.is-open', '.offcanvas-overlay',
            '.js-offcanvas-cart', '.is--offcanvas', '.minicart', '.offcanvas-cart',
            '[data-offcanvas-cart]', '.header-cart-offcanvas'
        ];
        const rects = [];
        const seen = new Set();

        for (const sel of selectors) {
            document.querySelectorAll(sel).forEach(el => {
                if (seen.has(el)) return;
                const r = this.visibleRect(el);
                if (r) { rects.push({ el, rect: r }); seen.add(el); }
            });
        }

        // Keep only those hugging a screen edge (typical for slide-in panels)
        const edgePx = 32;
        return rects.filter(({ rect }) =>
            rect.left <= edgePx || Math.abs(window.innerWidth - rect.right) <= edgePx
        );
    }

    avoidObstruction() {
        const boxEl = this.getActiveBoxEl();
        if (!boxEl) return;

        const box = boxEl.getBoundingClientRect();
        const obstructions = this.findObstructionRects();

        // No sidebars -> return to preferred corner if we moved
        if (obstructions.length === 0) {
            if (this.preferredPosition && this.currentPosition() !== this.preferredPosition) {
                this.setPosition(this.preferredPosition);
            }
            return;
        }

        // If ANY obstruction overlaps our chat/button, flip to the opposite side
        const overlap = obstructions.some(({ rect }) => this.rectsOverlap(box, rect));
        if (!overlap) return;

        const next = this.currentPosition() === 'bottom-right' ? 'bottom-left' : 'bottom-right';
        this.setPosition(next);
    }


    enableSmartAvoidance() {
        // Run on load & on layout changes
        const run = () => this.avoidObstruction();
        this._avoidanceRun = run;

        // 1) Resize/scroll (offcanvas may push layout)
        window.addEventListener('resize', run, { passive: true });
        window.addEventListener('scroll', run, { passive: true });

        // 2) MutationObserver to detect offcanvas open/close / attribute changes
        this._observer = new MutationObserver(() => {
            // Slight debounce to avoid thrashing while CSS classes animate
            if (this._avoidTimer) cancelAnimationFrame(this._avoidTimer);
            this._avoidTimer = requestAnimationFrame(run);
        });
        this._observer.observe(document.body, {
            attributes: true,
            childList: true,
            subtree: true
        });

        // 3) Also listen for our own panel toggles so we recalc on open/close
        const reRunOnToggle = () => run();
        this.fab.addEventListener('click', reRunOnToggle);
        if (this.panel) {
            this.panel.addEventListener('transitionend', reRunOnToggle);
        }

        // Initial pass
        run();
    }
}
