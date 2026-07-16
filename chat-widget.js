(function () {
  'use strict';

  // ── CONFIG ──────────────────────────────────────────────────────────
  // Update WORKER_URL after deploying the Cloudflare Worker (see aditi-chat-worker/README.md).
  const WORKER_URL = 'https://aditi-chat-worker.YOUR_SUBDOMAIN.workers.dev';
  const CONTACT_CTA_TOKEN = '[[CONTACT_CTA]]';
  const STORAGE_KEY = 'aic_history_v1';
  const MAX_STORED_TURNS = 12;

  const SUGGESTIONS = [
    "What's her experience with AI-powered products?",
    'Would she be a good fit for a Growth PM role?',
    'How many years of A/B testing experience does she have?',
    'What tools does she use day-to-day?',
  ];

  // Contact form lives on index.html#contact — resolve correctly from any page.
  function contactHref() {
    const path = window.location.pathname;
    const onIndex = path.endsWith('index.html') || path.endsWith('/') || path === '';
    return onIndex ? '#contact' : 'index.html#contact';
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function loadHistory() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveHistory(history) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-MAX_STORED_TURNS)));
    } catch {
      /* ignore storage failures (private browsing, etc.) */
    }
  }

  function buildDOM() {
    const root = document.createElement('div');
    root.id = 'aic-root';
    root.innerHTML = `
      <div class="aic-panel" role="dialog" aria-label="Chat about Aditi Sharma" aria-modal="false">
        <div class="aic-header">
          <div class="aic-avatar">AS</div>
          <div class="aic-header-text">
            <div class="aic-header-title">Ask about Aditi</div>
            <div class="aic-header-sub">AI-powered · answers from her real experience</div>
          </div>
          <button class="aic-close" aria-label="Close chat" type="button">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="aic-messages" id="aic-messages" aria-live="polite"></div>
        <div class="aic-suggestions" id="aic-suggestions"></div>
        <div class="aic-inputbar">
          <textarea class="aic-input" id="aic-input" rows="1" placeholder="Ask a question…" maxlength="600"></textarea>
          <button class="aic-send" id="aic-send" type="button" aria-label="Send">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z"/></svg>
          </button>
        </div>
        <div class="aic-disclaimer">AI-generated from Aditi's experience — not a substitute for talking to her directly.</div>
      </div>
      <div class="aic-teaser">👋 Ask me anything about Aditi</div>
      <button class="aic-launcher" type="button" aria-label="Open chat about Aditi">
        <span class="aic-launcher-ring"></span>
        <svg class="aic-icon-chat" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
        <svg class="aic-icon-close" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
    `;
    document.body.appendChild(root);
    return root;
  }

  function init() {
    const root = buildDOM();
    const launcher = root.querySelector('.aic-launcher');
    const closeBtn = root.querySelector('.aic-close');
    const messagesEl = root.querySelector('#aic-messages');
    const suggestionsEl = root.querySelector('#aic-suggestions');
    const inputEl = root.querySelector('#aic-input');
    const sendBtn = root.querySelector('#aic-send');

    let history = loadHistory(); // [{role, content}]
    let awaitingReply = false;

    function renderMessage(role, text) {
      const row = document.createElement('div');
      row.className = 'aic-row aic-row--' + role;
      const bubble = document.createElement('div');
      bubble.className = 'aic-bubble';

      let cleanText = text;
      let showCta = false;
      if (role === 'assistant' && cleanText.includes(CONTACT_CTA_TOKEN)) {
        showCta = true;
        cleanText = cleanText.replace(CONTACT_CTA_TOKEN, '').trim();
      }

      bubble.innerHTML = escapeHtml(cleanText).replace(/\n/g, '<br>');
      row.appendChild(bubble);

      if (showCta) {
        const cta = document.createElement('a');
        cta.className = 'aic-cta';
        cta.href = contactHref();
        cta.innerHTML = 'Get in touch with Aditi <span aria-hidden="true">→</span>';
        cta.addEventListener('click', () => { root.classList.remove('aic-open'); });
        row.appendChild(cta);
      }

      messagesEl.appendChild(row);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function renderSuggestions() {
      suggestionsEl.innerHTML = '';
      if (history.length > 0) return; // only show before the first message
      SUGGESTIONS.forEach((text) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'aic-chip';
        chip.textContent = text;
        chip.addEventListener('click', () => sendMessage(text));
        suggestionsEl.appendChild(chip);
      });
    }

    function showTyping() {
      const row = document.createElement('div');
      row.className = 'aic-row aic-row--assistant';
      row.id = 'aic-typing-row';
      row.innerHTML = `<div class="aic-bubble aic-typing"><span></span><span></span><span></span></div>`;
      messagesEl.appendChild(row);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function hideTyping() {
      const row = document.getElementById('aic-typing-row');
      if (row) row.remove();
    }

    function setSending(state) {
      awaitingReply = state;
      sendBtn.disabled = state;
      inputEl.disabled = state;
    }

    async function sendMessage(text) {
      const trimmed = text.trim();
      if (!trimmed || awaitingReply) return;

      renderMessage('user', trimmed);
      history.push({ role: 'user', content: trimmed });
      saveHistory(history);
      renderSuggestions();
      inputEl.value = '';
      autoGrow();
      setSending(true);
      showTyping();

      try {
        const res = await fetch(WORKER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: trimmed, history: history.slice(0, -1) }),
        });
        const data = await res.json().catch(() => ({}));
        hideTyping();

        const reply = data && data.reply
          ? data.reply
          : `Something went wrong on my end. Please try again, or reach out directly. ${CONTACT_CTA_TOKEN}`;

        renderMessage('assistant', reply);
        history.push({ role: 'assistant', content: reply });
        saveHistory(history);
      } catch (err) {
        hideTyping();
        const fallback = `I'm having trouble connecting right now. Please reach out directly. ${CONTACT_CTA_TOKEN}`;
        renderMessage('assistant', fallback);
        history.push({ role: 'assistant', content: fallback });
        saveHistory(history);
      } finally {
        setSending(false);
        inputEl.focus();
      }
    }

    function autoGrow() {
      if (!inputEl.value) { inputEl.style.height = ''; return; }
      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(inputEl.scrollHeight, 100) + 'px';
    }

    function openPanel() {
      root.classList.add('aic-open');
      root.classList.add('aic-dismissed-teaser');
      root.classList.add('aic-dismissed-pulse');
      setTimeout(() => inputEl.focus(), 150);
    }

    function closePanel() {
      root.classList.remove('aic-open');
    }

    launcher.addEventListener('click', () => {
      root.classList.contains('aic-open') ? closePanel() : openPanel();
    });
    closeBtn.addEventListener('click', closePanel);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && root.classList.contains('aic-open')) closePanel();
    });

    inputEl.addEventListener('input', autoGrow);
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(inputEl.value);
      }
    });
    sendBtn.addEventListener('click', () => sendMessage(inputEl.value));

    // Replay any persisted conversation from this session
    history.forEach((m) => renderMessage(m.role, m.content));
    renderSuggestions();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
