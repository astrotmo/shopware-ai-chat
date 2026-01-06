/**
 * AiChatPlugin for Shopware
 *
 * Implements a floating AI chat interface within the Shopware storefront.
 *
 * @package    PaulAiChat
 * @author     Paul Nöth
 */

const Base = window.PluginBaseClass;

/**
 * Class AiChatPlugin
 *
 * Features:
 * - Shows a floating chat button (FAB).
 * - Opens a small chat window at the bottom left or right.
 * - Sends user inputs to a chat backend (this.chatUrl).
 * - Expects structured JSON responses with { type, blocks }.
 * - Renders text bubbles, product lists, and info boxes.
 * - Stores history and open state in sessionStorage.
 */
export default class AiChatPlugin extends Base {

    /**
     * Initialising the plugin: reading config, building UI, restoring history.
     */
    init() {
        const { chatUrl, buttonLabel, autoOpen, position } = this.el.dataset;

        this.chatUrl = this.normalizeUrl(chatUrl);
        if (!this.chatUrl) {
            console.warn('[AiChatPlugin] Kein chatUrl gesetzt, Plugin wird nicht initialisiert.');
            return;
        }

        this.buttonLabel = buttonLabel || 'Chat';
        this.autoOpen = autoOpen === '1';
        this.position = (position || 'bottom-left').toLowerCase(); // 'bottom-left' | 'bottom-right'
        this.preferredPosition = this.position;

        this.wrapper = null;
        this.fab = null;
        this.panel = null;
        this.messagesEl = null;
        this.form = null;
        this.input = null;
        this.sendBtn = null;

        this.buildUi();
        this.restoreHistory();

        if (this.autoOpen) {
            // Small delay that everything is rendered before opening
            setTimeout(() => this.open(), 400);
        }

        // Always scroll to the end on resize
        window.addEventListener('resize', () => this.scrollMessagesToEnd());
    }

    /**
     * Helper function: Ensures the URL is absolute or reasonably relative.
     * 
     * @param {string} url The input URL from data attribute.
     * @returns {string} Normalized URL.
     */
    normalizeUrl(url) {
        if (!url) return '';
        // If already absolute or reasonably relative, just return it
        if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/')) {
            return url;
        }
        // Otherwise relative to current origin
        return `${window.location.origin.replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}`;
    }

    /**
     * Builds the chat UI elements and appends them to the document body.
     */
    buildUi() {
        // Root container (floating)
        const wrapper = document.createElement('div');
        wrapper.className = 'paul-ai-chat-wrap';
        wrapper.classList.add(
            this.position === 'bottom-right'
                ? 'paul-ai-chat-bottom-right'
                : 'paul-ai-chat-bottom-left'
        );
        this.wrapper = wrapper;

        // Floating-Action-Button
        const fab = document.createElement('button');
        fab.type = 'button';
        fab.className = 'paul-ai-chat-button';
        fab.setAttribute('aria-haspopup', 'dialog');
        fab.setAttribute('aria-expanded', 'false');
        fab.textContent = this.buttonLabel;
        fab.addEventListener('click', () => this.toggle());
        this.fab = fab;

        // Chat window (Panel, initially hidden)
        const panel = document.createElement('section');
        panel.className = 'paul-ai-chat-window';
        panel.setAttribute('aria-label', 'Chat mit Assistenz');
        panel.setAttribute('role', 'dialog');
        panel.style.display = 'none';
        this.panel = panel;

        // Header (Titel, Clear-Icon, Close-Icon)
        const header = document.createElement('header');
        header.className = 'paul-ai-chat-header';

        const titleEl = document.createElement('div');
        titleEl.className = 'paul-ai-chat-title';
        titleEl.textContent = this.buttonLabel;

        const controls = document.createElement('div');
        controls.className = 'paul-ai-chat-header-controls';

        // „Verlauf löschen“ (Trash-Icon)
        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'paul-ai-chat-clear';
        clearBtn.title = 'Chatverlauf löschen';
        clearBtn.innerHTML = '🗑️';
        clearBtn.addEventListener('click', () => this.clearHistory());

        // Close (X)
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'paul-ai-chat-close';
        closeBtn.title = 'Chat schließen';
        closeBtn.innerHTML = '×';
        closeBtn.addEventListener('click', () => this.close());

        controls.appendChild(clearBtn);
        controls.appendChild(closeBtn);

        header.appendChild(titleEl);
        header.appendChild(controls);

        // Messages container
        const messagesEl = document.createElement('div');
        messagesEl.className = 'paul-ai-chat-messages';
        this.messagesEl = messagesEl;

        // Input form
        const form = document.createElement('form');
        form.className = 'paul-ai-chat-form';
        this.form = form;

        const input = document.createElement('textarea');
        input.className = 'paul-ai-chat-input';
        input.rows = 1;                     // Start height
        input.placeholder = 'Enter message …';
        input.style.resize = 'none';        // no manual resizing
        input.style.overflow = 'hidden';    // hide scrollbar (grows automatically)

        this.input = input;

        // Auto-Resize on input:
        input.addEventListener('input', () => {
            input.style.height = 'auto';                 
            input.style.height = input.scrollHeight + 'px';
            input.style.transition = 'height 0.1s ease';
        });

        const sendBtn = document.createElement('button');
        sendBtn.type = 'submit';
        sendBtn.className = 'paul-ai-chat-send';
        sendBtn.textContent = 'Senden';
        this.sendBtn = sendBtn;

        form.appendChild(input);
        form.appendChild(sendBtn);

        form.addEventListener('submit', (e) => this.onSubmit(e));

        // Assemble chat window
        panel.appendChild(header);
        panel.appendChild(messagesEl);
        panel.appendChild(form);

        // Anchor everything in the wrapper
        wrapper.appendChild(fab);
        wrapper.appendChild(panel);
        document.body.appendChild(wrapper);
    }

    /**
     * Open the chat window.
     * Sets focus to the input field.
     */
    open() {
        if (!this.panel) return;
        this.panel.style.display = 'flex';
        this.wrapper.classList.add('paul-ai-chat-open');
        this.fab.setAttribute('aria-expanded', 'true');
        this.saveOpenState(true);
        this.scrollMessagesToEnd();
        this.input && this.input.focus();
    }

    /**
     * Close the chat window.
     * Removes focus from the input field.
     */
    close() {
        if (!this.panel) return;
        this.panel.style.display = 'none';
        this.wrapper.classList.remove('paul-ai-chat-open');
        this.fab.setAttribute('aria-expanded', 'false');
        this.saveOpenState(false);
    }

    /**
     * Toggle the chat window open/closed.
     */
    toggle() {
        if (!this.panel) return;
        const isOpen = this.panel.style.display !== 'none';
        if (isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    /**
     * Adds a chat bubble.
     * 
     * @param {string} text The text content of the bubble.
     * @param {string} who 'user' or 'bot' to distinguish styles.
     * @param {boolean} isError Whether it is an error message.
     * @returns {HTMLElement|null} The created bubble element or null.
     */
    appendBubble(text, who = 'bot', isError = false) {
        if (!this.messagesEl) return null;

        const bubble = document.createElement('div');
        bubble.className = 'paul-ai-chat-bubble ' + (who === 'user' ? 'from-user' : 'from-bot');
        if (isError) bubble.classList.add('is-error');

        const inner = document.createElement('div');
        inner.className = 'paul-ai-chat-bubble-inner';
        inner.innerHTML = this.linkify(text || '');

        bubble.appendChild(inner);
        this.messagesEl.appendChild(bubble);
        this.scrollMessagesToEnd();
        return bubble;
    }

    /**
     * Small "Typing..." placeholder during the response.
     */
    appendPending() {
        const el = document.createElement('div');
        el.className = 'paul-ai-chat-pending';
        el.textContent = '…';
        this.messagesEl.appendChild(el);
        this.scrollMessagesToEnd();
        return el;
    }

    /**
     * Detects links in the text and makes them clickable.
     */
    linkify(text) {
        if (!text) return '';
        const escaped = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        const urlRegex = /(https?:\/\/[^\s]+)/g;
        return escaped.replace(urlRegex, (url) => {
            const safeUrl = url.replace(/"/g, '&quot;');
            return `<a href="${safeUrl}" target="_self" class="paul-ai-chat-link">${safeUrl}</a>`;
        });
    }

    /**
     * Scrolls the messages container to the end.
     */
    scrollMessagesToEnd() {
        if (!this.messagesEl) return;
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }

    /**
     * Handles form submission: sends user message to backend and processes response.
     * 
     * @param {Event} e The submit event.
     */
    async onSubmit(e) {
        e.preventDefault();
        if (!this.chatUrl || !this.input) return;

        const message = (this.input.value || '').trim();
        if (!message) return;

        // Show user bubble immediately
        this.appendBubble(message, 'user');
        this.persistMessage({ who: 'user', text: message });

        this.input.value = '';
        this.input.focus();

        // Show "Typing..." placeholder
        const pending = this.appendPending();

        try {
            const res = await fetch(this.chatUrl, {
                method: 'POST',
                mode: 'cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message })
                // You could add history here later, e.g. { message, history: [...] }
            });

            const text = await res.text();
            if (!res.ok) {
                throw new Error(text || `HTTP ${res.status}`);
            }

            let payload;
            try {
                payload = JSON.parse(text);
            } catch {
                payload = null;
            }

            pending.remove();
            this.handleBotResponse(payload, text);
        } catch (err) {
            pending.remove();
            const msg = (err && err.message) ? err.message : String(err);
            this.appendBubble(`Error: ${msg}`, 'bot', true);
            this.persistMessage({ who: 'bot', text: `Error: ${msg}`, isError: true });
        }
    }

    /**
     * Central entry point to handle the bot response.
     * 
     * @param {*} payload the parsed JSON response
     * @param {*} rawText the raw text response (fallback)
     */
    handleBotResponse(payload, rawText) {
        if (payload && Array.isArray(payload.blocks)) {
            this.renderBlocks(payload.blocks);
            this.persistMessage({ who: 'bot', structured: true, payload });
            return;
        }

        // Fallback: simple text (reply/message or rawText)
        const replyText = (payload && (payload.reply ?? payload.message)) || rawText;
        this.appendBubble(replyText.toString(), 'bot');
        this.persistMessage({ who: 'bot', text: replyText.toString() });
    }

    /**
     * Renders an array of blocks from the bot response.
     * 
     * @param {Array} blocks The array of blocks to render.
     */
    renderBlocks(blocks) {
        if (!Array.isArray(blocks)) return;
        for (const block of blocks) {
            this.renderBlock(block);
        }
        this.scrollMessagesToEnd();
    }

    /**
     * Renders a single block based on its kind.
     * 
     * @param {Object} block The block object to render.
     */
    renderBlock(block) {
        if (!block || typeof block !== 'object') return;

        switch (block.kind) {
            case 'text':
                if (block.text) {
                    this.appendBubble(block.text, 'bot');
                }
                break;

            case 'product_list':
                this.renderProductList(block);
                break;

            case 'info_box':
                this.renderInfoBox(block);
                break;

            default:
                // Unknown block type -> if text is present, render as a simple bubble
                if (block.text) {
                    this.appendBubble(block.text, 'bot');
                }
        }
    }

    /**
     * Renders a product list as tiles (kind: "product_list").
     * Expected:
     * {
     *   title: "string",
     *   products: [{ id, name, detailUrl, price?, currency? }, ...]
     * }
     * 
     * @param {Object} block The product list block.
     */
    renderProductList(block) {
        if (!this.messagesEl) return;

        const container = document.createElement('div');
        container.className = 'paul-ai-chat-product-list';

        if (block.title) {
            const titleEl = document.createElement('div');
            titleEl.className = 'paul-ai-chat-product-list-title';
            titleEl.textContent = block.title;
            container.appendChild(titleEl);
        }

        const itemsWrap = document.createElement('div');
        itemsWrap.className = 'paul-ai-chat-product-list-items';

        const products = Array.isArray(block.products) ? block.products : [];
        for (const p of products) {
            if (!p || !p.name || !p.detailUrl) continue;

            const card = document.createElement('a');
            card.className = 'paul-ai-chat-product-card';
            card.href = p.detailUrl;
            card.target = '_self';

            const nameEl = document.createElement('div');
            nameEl.className = 'paul-ai-chat-product-name';
            nameEl.textContent = p.name;
            card.appendChild(nameEl);

            if (p.price) {
                const priceEl = document.createElement('div');
                priceEl.className = 'paul-ai-chat-product-price';
                priceEl.textContent = p.price;
                card.appendChild(priceEl);
            }

            itemsWrap.appendChild(card);
        }

        container.appendChild(itemsWrap);
        this.messagesEl.appendChild(container);
        this.scrollMessagesToEnd();
    }

    /**
     * Renders an info box (kind: "info_box").
     * Expected:
     * {
     *   style: "info" | "warning" | "error",
     *   title: "string",
     *   text: "string"
     * }
     * 
     * @param {Object} block The info box block.
     */
    renderInfoBox(block) {
        if (!this.messagesEl) return;

        const box = document.createElement('div');
        box.className = 'paul-ai-chat-info-box';
        if (block.style) {
            box.classList.add(`paul-ai-chat-info-${block.style}`);
        }

        if (block.title) {
            const titleEl = document.createElement('div');
            titleEl.className = 'paul-ai-chat-info-title';
            titleEl.textContent = block.title;
            box.appendChild(titleEl);
        }

        if (block.text) {
            const textEl = document.createElement('div');
            textEl.className = 'paul-ai-chat-info-text';
            textEl.textContent = block.text;
            box.appendChild(textEl);
        }

        this.messagesEl.appendChild(box);
        this.scrollMessagesToEnd();
    }

    /**
     * Storage key for chat history in sessionStorage.
     * 
     * @returns {string} The storage key.
     */
    storageKey() { return 'paul-ai-chat-history'; }

    /**
     * Storage key for chat open state in sessionStorage.
     * 
     * @returns {string} The open state key.
     */
    openKey()    { return 'paul-ai-chat-open'; }

    /**
     * Persists a message to sessionStorage.
     * 
     * @param {Object} m The message object to persist.
     */
    persistMessage(m) {
        const key = this.storageKey();
        const arr = this.readJson(key) || [];
        arr.push({ ...m, ts: Date.now() });
        sessionStorage.setItem(key, JSON.stringify(arr));
    }

    /**
     * Saves the open/closed state of the chat.
     * 
     * @param {boolean} open Whether the chat is open.
     */
    saveOpenState(open) {
        sessionStorage.setItem(this.openKey(), open ? '1' : '0');
    }

    /**
     * Restores the chat history after a reload.
     */
    restoreHistory() {
        const arr = this.readJson(this.storageKey()) || [];
        for (const m of arr) {
            if (m.structured && m.payload && Array.isArray(m.payload.blocks)) {
                // new, structured responses
                this.renderBlocks(m.payload.blocks);
            } else if (m.text) {
                // old, simple text history
                this.appendBubble(m.text, m.who === 'user' ? 'user' : 'bot', !!m.isError);
            }
        }

        if ((sessionStorage.getItem(this.openKey()) || '0') === '1') {
            this.open();
        }
    }

    /**
     * Reads and parses JSON from sessionStorage.
     * 
     * @param {string} key The storage key.
     * @returns {any} The parsed JSON object or null.
     */
    readJson(key) {
        try {
            const raw = sessionStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            console.warn('[AiChatPlugin] Konnte JSON aus sessionStorage nicht lesen:', e);
            return null;
        }
    }

    /**
     * Clears the chat history and empties the visible area.
     */
    clearHistory() {
        sessionStorage.removeItem(this.storageKey());
        if (this.messagesEl) {
            this.messagesEl.innerHTML = '';
        }
    }
}
