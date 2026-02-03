/**
 * AiChatPlugin for Shopware
 *
 * Implements a floating AI chat interface within the Shopware storefront.
 *
 * @package    PaulAiChat
 * @author     Paul Nöth
 */

import { marked } from 'marked';
import DOMPurify from 'dompurify';

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

    /** LIFE CYCLE */

    /**
     * Initialising the plugin: reading config, building UI, restoring history.
     */
    init() {

        this.debug = false;

        this.debugLog('Plugin init');
        this.debugLog('Root element:', this.el);
        this.debugLog('Dataset:', this.el?.dataset);
        this.debugLog('Client context:', this.getClientContext());

        const { chatUrl, llmModel, welcomeMessage, buttonLabel, autoOpen, position, contextTokenUrl } = this.el.dataset;

        this.chatUrl = this.normalizeUrl(chatUrl);
        if (!this.chatUrl) {
            this.debugWarn('Kein chatUrl gesetzt, Plugin wird nicht initialisiert.');
            return;
        }
        this.llmModel = llmModel || '';
        this.welcomeMessage = welcomeMessage || 'Hallo, wie kann ich behilflich sein?';

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

        this.contextToken = null;
        this.contextTokenExpMs = 0;
        this.contextTokenUrl = contextTokenUrl || '';

        this.buildUi();
        this.restoreHistory();

        if (this.autoOpen) {
            // Small delay that everything is rendered before opening
            setTimeout(() => this.open(), 400);
        }

        // Always scroll to the end on resize
        window.addEventListener('resize', () => this.scrollMessagesToEnd());
    }

    /** DEBUGGING HELPERS */

    debugLog(...args) {
    if (!this.debug) return;
    console.debug('[PaulAiChat]', ...args);
    }

    debugWarn(...args) {
        if (!this.debug) return;
        console.warn('[PaulAiChat]', ...args);
    }

    debugError(...args) {
        if (!this.debug) return;
        console.error('[PaulAiChat]', ...args);
    }

    /** UI SETUP & WINDOW STATE */

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

        // Show hint for contact form for not logged in users
        this.showContactFormHint();
        
        // Append welcome message from bot
        this.appendBubble(this.welcomeMessage, 'bot');
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
        this.debugLog('Chat opened');
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
        this.debugLog('Chat closed');
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
     * Scrolls the messages container to the end.
     */
    scrollMessagesToEnd() {
        if (!this.messagesEl) return;
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }

    /** RENDERING PRIMITIVES */

    /**
     * Renders markdown text to sanitized HTML.
     * 
     * @param {string} markdown The markdown text.
     * @returns {string} The sanitized HTML.
     */
    renderMarkdown(markdown) {
        if (!markdown || typeof markdown !== 'string') return '';

        const cleaned = markdown.trim();

        const html = marked.parse(cleaned, {
            gfm: true,
            breaks: true,
        });

        return DOMPurify.sanitize(html);
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
        inner.innerHTML = this.renderMarkdown(text || '');

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

    /** CHAT REQUEST FLOW */

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

        const client = this.getClientContext();

        // Show user bubble immediately
        this.appendBubble(message, 'user');
        this.persistMessage({ who: 'user', text: message });

        this.input.value = '';
        this.input.focus();

        // Show "Typing..." placeholder
        const pending = this.appendPending();

        try {
            const contextToken = await this.getContextToken(this.contextTokenUrl);
            const load = {
                method: 'POST',
                mode: 'cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(
                    {
                        message,
                        model: this.llmModel,
                        client: {
                            origin: client.origin,
                            basePath: client.basePath,
                            fullBaseUrl: client.fullBaseUrl,
                            contextToken: contextToken || ''
                        },
                    }),
            }

            this.debugLog('Sending chat payload to backend', load);

            const res = await fetch(this.chatUrl, load);

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

            this.debugLog('Bot response payload:', payload, 'raw text:', text);

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

    /** STRUCTURED BLOCK RENDERING */

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

            case 'formular':
                this.renderFormular(block);
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

        this.debugLog('Rendering product list block', block);

        const clientContext = this.getClientContext();
        const fullBaseUrl = clientContext.fullBaseUrl;

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

        // Keep references to price elements so we can update later
        const priceElsById = new Map();
        
        for (const p of products) {
            if (!p || !p.name) continue;

            const card = document.createElement('a');
            card.className = 'paul-ai-chat-product-card';
            card.href = fullBaseUrl + "/detail/" + p.id;
            card.target = '_self';

            const nameEl = document.createElement('div');
            nameEl.className = 'paul-ai-chat-product-name';
            nameEl.textContent = p.name;
            card.appendChild(nameEl);

            const metaEl = document.createElement('div');
            metaEl.className = 'paul-ai-chat-product-meta';

            if (p.productNumber) {
                const numberEl = document.createElement('span');
                numberEl.className = 'paul-ai-chat-product-number';
                numberEl.textContent = p.productNumber;
                metaEl.appendChild(numberEl);
            }

            // Always create a price element, but keep it empty/hidden if no price
            const priceEl = document.createElement('span');
            priceEl.className = 'paul-ai-chat-product-price';

            if (p.price) {
                // If backend already provided a price, display it
                priceEl.textContent = p.price;
            } else {
                // Placeholder (only shown if we later get a price)
                priceEl.textContent = '';
                priceEl.style.display = 'none';
            }

            metaEl.appendChild(priceEl);
            card.appendChild(metaEl);

            priceElsById.set(p.id, priceEl);
            itemsWrap.appendChild(card);
        }

        container.appendChild(itemsWrap);
        this.messagesEl.appendChild(container);
        this.scrollMessagesToEnd();

         // Enrich with calculated prices (logged-in only)
        const ids = [...priceElsById.keys()];
        if (ids.length === 0) return;

        this.debugLog('Requesting prices for product IDs', ids);

        // Fire and forget (no UI blocking)
        this.fetchCalculatedPrices(ids).then((pricesById) => {
            this.debugLog('Applying calculated prices', priceElsById);

            for (const [id, el] of priceElsById.entries()) {
                const prod = pricesById[id];

                if (!prod) {
                    this.debugWarn('No calculated price for product', id, prod);
                    continue;
                }

                let price = null;

                const tiers = Array.isArray(prod.calculatedPrices) ? prod.calculatedPrices : [];
                if (tiers.length > 0) {
                    // prefer quantity=1 tier, else first tier with unitPrice
                    const q1 = tiers.find(t => t && t.quantity === 1 && typeof t.unitPrice === 'number');
                    if (q1) {
                        price = q1.unitPrice;
                    } else {
                        const any = tiers.find(t => t && typeof t.unitPrice === 'number');
                        if (any) price = any.unitPrice;
                    }
                }

                if (price === null) {
                    const base = prod?.calculatedPrice?.unitPrice;
                    if (typeof base === 'number') price = base;
                }

                if (price === null) {
                    this.debugWarn('No usable price fields for product', id, prod);
                    continue;
                }

                // Format: "12,34 €" (simple + locale)
                const formatted = new Intl.NumberFormat('de-DE', {
                    style: 'currency',
                    currency: 'EUR', // If you want dynamic currency, send currency ISO from backend
                }).format(price);

                el.textContent = formatted;
                el.style.display = '';
            }
            this.scrollMessagesToEnd();
        });
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
     * Renders a contact form (kind: "formular").
     * Expected:
     * {
     *   title: "string",
     *   text: "string",
     *   fields: [{ name, label, type, placeholder, required, options? }, ...],
     *   submitLabel: "string",
     *   contactUrl: "string" (optional URL to open on submit)
     * }
     * 
     * @param {Object} block The formular block.
     */
    renderFormular(block) {
        if (!this.messagesEl) return;

        const container = document.createElement('div');
        container.className = 'paul-ai-chat-formular';

        const header = document.createElement('div');
        header.className = 'paul-ai-chat-formular-header';

        const titleEl = document.createElement('div');
        titleEl.className = 'paul-ai-chat-formular-title';
        titleEl.textContent = block.title || 'Kontaktformular';

        const toggle = document.createElement('div');
        toggle.className = 'paul-ai-chat-formular-toggle';
        toggle.textContent = '▼';

        header.appendChild(titleEl);
        header.appendChild(toggle);
        container.appendChild(header);

        const body = document.createElement('div');
        body.className = 'paul-ai-chat-formular-body';

        const form = document.createElement('form');
        form.className = 'paul-ai-chat-formular-form';

        if (block.reason) {
            const reasonEl = document.createElement('div');
            reasonEl.className = 'paul-ai-chat-formular-reason';
            reasonEl.textContent = block.reason;
            body.appendChild(reasonEl);
        }

        for (const f of block.fields || []) {
            if (!f?.key) continue;

            const row = document.createElement('label');
            row.className = 'paul-ai-chat-formular-row';

            const labelEl = document.createElement('div');
            labelEl.className = 'paul-ai-chat-formular-label';
            labelEl.textContent = f.label || f.key;

            let input;
            if (f.type === 'textarea') {
                input = document.createElement('textarea');
                input.rows = 4;
            } else {
                input = document.createElement('input');
                input.type = f.type || 'text';
            }

            input.className = 'paul-ai-chat-formular-input';
            input.name = f.key;
            if (f.placeholder) input.placeholder = f.placeholder;
            if (f.required) input.required = true;
            if (f.value != null) input.value = String(f.value);

            row.appendChild(labelEl);
            row.appendChild(input);
            form.appendChild(row);
        }

        const actions = document.createElement('div');
        actions.className = 'paul-ai-chat-formular-actions';

        const btn = document.createElement('button');
        btn.type = 'submit';
        btn.className = 'paul-ai-chat-formular-submit';
        btn.textContent = block.submitLabel || 'Absenden';

        actions.appendChild(btn);
        form.appendChild(actions);
        body.appendChild(form);
        container.appendChild(body);

        const setCollapsed = (collapsed) => {
            container.classList.toggle('is-collapsed', collapsed);
            toggle.textContent = collapsed ? '▼' : '▲';
        };

        header.addEventListener('click', () => {
            setCollapsed(!container.classList.contains('is-collapsed'));
        });

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            btn.disabled = true;

            const success = await this.submitContactForm(form, block);

            btn.disabled = false;

            if (success) {
                setCollapsed(true);
                container.classList.add('is-done');
            }
        });

        this.messagesEl.appendChild(container);
        this.scrollMessagesToEnd();
    }

    /** CONTEXT / BACKEND HELPERS */

    /**
     * Gathers client context information for requests.
     * 
     * @returns {Object} The client context with origin, basePath, and fullBaseUrl.
     */
    getClientContext() {
        const { origin, pathname} = window.location;

        const parts = pathname.split('/').filter(Boolean);
        const basePath = parts.length > 0 ? `/${parts[0]}` : '';

        return {
            origin,
            basePath,
            fullBaseUrl: origin + basePath
        };
    }

    /**
     * Retrieves a context token from the backend.
     * Caches it until shortly before expiration.
     * 
     * @param {string} contextTokenUrl The URL to fetch the context token.
     * @returns {Promise<string|null>} The context token or null.
     */
    async getContextToken(contextTokenUrl) {
        this.debugLog('Getting context token from', contextTokenUrl);

        const now = Date.now();
        if (this.contextToken && now < this.contextTokenExpMs - 5000) {
            return this.contextToken;
        }

        if (!contextTokenUrl) return null;

        try {
            const res = await fetch(contextTokenUrl, {
                method: 'GET',
                credentials: 'include',
                headers: { 'Accept': 'application/json' },
            });

            if (!res.ok) return null;

            const data = await res.json();
            if (!data?.token) return null;

            this.debugLog('Received context token', data.token);

            // decode exp from JWT-like payload
            const parts = data.token.split('.');
            if (parts.length === 3) {
                const payloadJson = JSON.parse(
                    atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
                );
                this.contextTokenExpMs = payloadJson?.exp ? Number(payloadJson.exp) * 1000 : now + 30000;
            } else {
                this.contextTokenExpMs = now + 30000;
            }

            this.contextToken = data.token;
            return this.contextToken;
        } catch {
            return null;
        }
    }

    /**
     * Fetch calculated prices for product IDs from the Shopware plugin endpoint.
     * Only works for logged-in users (endpoint should return 401 otherwise).
     *
     * @param {string[]} productIds
     * @returns {Promise<Record<string, Object>>} Mapping of productId to price info.
     */
    async fetchCalculatedPrices(productIds) {
        if (!Array.isArray(productIds) || productIds.length === 0) {
            this.debugWarn('fetchCalculatedPrices called with empty productIds');
            return {};
        }

        this.debugLog('Fetching calculated prices', productIds);

        try {
            const res = await fetch('/paul-ai-chat/prices', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                credentials: 'same-origin',
                body: JSON.stringify({ productIds }),
            });

            this.debugLog('Price endpoint response status:', res.status);

            if (res.status === 401) {
                this.debugWarn('User not logged in – price endpoint returned 401');
                return {};
            }

            if (!res.ok) {
                this.debugError('Price endpoint error', res.status);
                return {};
            }

            const data = await res.json();
            this.debugLog('Price endpoint payload:', data);

            return data?.prices || {};
        } catch (e) {
            this.debugError('Price fetch failed', e);
            return {};
        }
    }

    /** PERSISTENCE / SESSION STORAGE */

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
            this.debugWarn('Konnte JSON aus sessionStorage nicht lesen:', e);
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

    /** CONTACT FORM HELPER */

    /**
     * Shows a hint to the user about the contact form if they are not logged in.
     * @returns {void}
     */
    showContactFormHint() {
        if (this._contactHintShown) return;
        this._contactHintShown = true;

        const block = {
            kind: 'info_box',
            style: 'warning',
            title: 'Hinweis Nutzer',
            text: 'Dieser Assistent kann nur allgemeine Informationen geben. Falls ihre Fragen über diese hinausgehen, werden sie ggf. gebeten ein Kontaktformular auszufüllen.',
        }

        this.renderBlock(block);
    }

    /**
     * Submits the contact form data to the backend.
     * @param {HTMLFormElement} form The contact form element.
     * @param {Object} block The block configuration with endpoint and method.
     * @returns {Promise<boolean>} True if submission was successful, false otherwise.
     */
    async submitContactForm(form, block) {
        const formData = new FormData(form);
        const payload = Object.fromEntries(formData.entries());

        try {
            const res = await fetch(block.endpoint || '/paul-ai-chat/contact', {
                method: block.method || 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                credentials: 'same-origin',
                body: JSON.stringify(payload),
            });

            if (!res.ok) throw new Error('REQUEST_FAILED');

            this.appendBubble(
                '✅ Danke! Deine Anfrage wurde erfolgreich übermittelt.',
                'bot'
            );
            return true;
        } catch (e) {
            this.appendBubble(
                '❌ Beim Absenden ist ein Fehler aufgetreten. Bitte versuche es erneut.',
                'bot'
            );
            return false;
        } finally {
            this.scrollMessagesToEnd();
        }
    }

}
