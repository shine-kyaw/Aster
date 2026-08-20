/* ============================================================
   ASTER STUDIO — AI Chat Widget
   Powered by Puter.js (no API key, no backend required)
   ============================================================ */
(function () {
  'use strict';

  // ─── Knowledge base about Aster Studio ───
  const ASTER_KNOWLEDGE = `
You are Aster, the AI concierge for Aster Studio — a bespoke design studio founded in 2026.
Your name is Aster, and you speak with warmth, elegance, and restraint — like the studio itself.
You are knowledgeable, genuine, and never salesy. You help visitors understand the studio and guide them toward starting a project.

ABOUT ASTER STUDIO:
Aster Studio is a bespoke design studio. Every project blooms from a single seed into a wholly handcrafted brand identity. Nothing is borrowed, nothing is templated. Each project is deeply personal.

THE FOUR-PHASE PROCESS:
1. Discovery (Phase 01 · Bulb) — 1–2 weeks, 2–4 working sessions. Deliverables: strategic positioning doc, brand audit, audience archetype mapping, stakeholder alignment. "Listen first. Map the terrain."
2. Blueprint (Phase 02 · Sprouting) — ~1 week, wireframes across 3 viewports. Deliverables: information architecture, user flow diagrams, wireframes (mobile/tablet/desktop), visual direction & moodboard. "Architecture. Wireframes. Direction."
3. Craft (Phase 03 · Budding) — 2–3 weeks, Lighthouse target >95. Deliverables: high-fidelity UI design, custom motion & interaction system, frontend build (semantic, accessible), component library. "Pixel-perfect UI. Meticulous engineering."
4. Launch (Phase 04 · Full Bloom) — 3–5 day launch window. Deliverables: staged deployment & DNS routing, performance & accessibility tuning, cross-browser QA, handover package & training session.

PRICING TIERS:
• Seed ($350/project) — Single landing page, key graphic assets, brand-aligned type & color system, mobile-first responsive build, basic SEO, performance pass. ~7 day delivery.
• Blossom (~$1,500/project, "Most chosen") — Premium multi-page site (up to 5 pages), bespoke motion & interaction layer, performance tuning, staged launch, analytics integration, cross-browser QA. ~2 weeks delivery.
• Bloom (~$3,000/project) — Complete bespoke identity, logo/type/colour direction, full multi-page experience, component library & motion language, brand guidelines document, long-form training & handover. ~3 weeks delivery.
All pricing is negotiable based on requirements.

PORTFOLIO / WORK:
• Foliyo — Live fintech web app, a clean real-time stock & portfolio tracker. Visit: foliyo-delta.vercel.app
• Gateway Orbital Explorer — Live orbital physics simulation for NASA's Lunar Gateway. Visit: gateway-orbital-explorer.vercel.app
• Power Tagun Engineering Co., Ltd — Live corporate site for a Myanmar electrical engineering firm: electrical infrastructure product supply, procurement, and EPC turnkey delivery for utility, industrial, and commercial power projects. Part of the Asia General Holding group. Visit: powertagun.vercel.app
• KTK (Kaung Thu Kha Group Co., Ltd.) — Live manufacturer site for Myanmar's industrial packaging producer: cement sacks and PP woven bags made on European STARLINGER lines, plus fillers, thread, bag-closing machinery, and bearings. Visit: ktk-umber.vercel.app

These four are the studio's complete public portfolio. Never invent, imply, or describe any other client, project, or result — if asked for more examples, say these are the sites currently published and invite them to get in touch.

CONTACT:
Email: marketing@astermade.com (general and new enquiries) or shine@astermade.com (direct)
Contact form: Available on the Connect section of the homepage (index.html#connect)
Visitors can track their submitted enquiries using a unique tracking code.

PHILOSOPHY:
Every Aster is shaped by hand — nothing borrowed, nothing templated. The studio is handcrafted, tactile, unrepeatable, and intimate. The brand philosophy uses the metaphor of blooming: from seed (idea) to full bloom (launched identity).

TONE GUIDELINES FOR YOU (Aster the AI):
- Speak warmly and with quiet confidence
- Use the bloom/garden metaphor naturally when it fits — don't force it
- Keep responses concise but complete
- Never be pushy — let the work speak
- If asked about pricing, give honest ranges and always note it's negotiable
- If someone wants to start a project, direct them to the Connect section or email
- If asked something you don't know about the studio, be honest and suggest they email directly
- Do not fabricate project names, clients, or capabilities not listed above
`.trim();

  // ─── CSS ───
  const css = `
    #aster-chat-btn {
      position: fixed;
      bottom: 28px;
      right: 28px;
      z-index: 9000;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: var(--ink, #1f1d18);
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 8px 28px -8px rgba(31,29,24,0.45);
      transition: transform 0.4s cubic-bezier(0.22,1,0.36,1), box-shadow 0.4s;
      font-family: inherit;
    }
    #aster-chat-btn:hover {
      transform: translateY(-3px) scale(1.05);
      box-shadow: 0 16px 40px -10px rgba(31,29,24,0.55);
    }
    #aster-chat-btn svg { pointer-events: none; }
    #aster-chat-btn .chat-icon { transition: opacity 0.2s, transform 0.3s; }
    #aster-chat-btn .close-icon { position: absolute; opacity: 0; transform: rotate(-45deg); transition: opacity 0.2s, transform 0.3s; }
    #aster-chat-btn.open .chat-icon { opacity: 0; transform: rotate(45deg); }
    #aster-chat-btn.open .close-icon { opacity: 1; transform: rotate(0deg); }

    #aster-chat-pip {
      position: absolute;
      top: -2px; right: -2px;
      width: 14px; height: 14px;
      border-radius: 50%;
      background: var(--aster, #8b5fbf);
      border: 2px solid var(--cream, #f5ede0);
      animation: asterPip 2.5s ease-in-out infinite;
    }
    @keyframes asterPip {
      0%,100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(0.82); opacity: 0.7; }
    }

    #aster-chat-panel {
      position: fixed;
      bottom: 96px;
      right: 28px;
      z-index: 9001;
      width: min(380px, calc(100vw - 40px));
      max-height: min(580px, calc(100vh - 120px));
      background: var(--paper, #fbf6ea);
      border: 1px solid var(--line-soft, #e3dac3);
      border-radius: 20px;
      box-shadow: 0 28px 72px -24px rgba(31,29,24,0.32), 0 2px 8px -3px rgba(31,29,24,0.10);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      opacity: 0;
      pointer-events: none;
      transform: translateY(14px) scale(0.97);
      transform-origin: bottom right;
      transition: opacity 0.35s cubic-bezier(0.22,1,0.36,1), transform 0.4s cubic-bezier(0.22,1,0.36,1);
      font-family: var(--sans, 'Inter', sans-serif);
    }
    #aster-chat-panel.open {
      opacity: 1;
      pointer-events: auto;
      transform: translateY(0) scale(1);
    }

    .ac-header {
      padding: 16px 18px 14px;
      background: var(--ink, #1f1d18);
      display: flex;
      align-items: center;
      gap: 12px;
      flex-shrink: 0;
    }
    .ac-header-bloom {
      width: 32px; height: 32px;
      flex-shrink: 0;
    }
    .ac-header-info { flex: 1; }
    .ac-header-name {
      font-family: var(--serif, 'Playfair Display', serif);
      font-size: 16px;
      font-weight: 400;
      color: var(--cream, #f5ede0);
      line-height: 1.2;
    }
    .ac-header-status {
      font-size: 10px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--aster-light, #c4a5e0);
      display: flex;
      align-items: center;
      gap: 5px;
      margin-top: 2px;
    }
    .ac-status-dot {
      width: 5px; height: 5px;
      border-radius: 50%;
      background: var(--aster-light, #c4a5e0);
      animation: asterPip 2s ease-in-out infinite;
    }

    .ac-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px 14px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      scrollbar-width: thin;
      scrollbar-color: var(--line, #d8cfb8) transparent;
    }
    .ac-messages::-webkit-scrollbar { width: 6px; }
    .ac-messages::-webkit-scrollbar-thumb { background: var(--line, #d8cfb8); border-radius: 99px; }

    .ac-msg {
      display: flex;
      flex-direction: column;
      max-width: 88%;
      animation: acMsgIn 0.3s cubic-bezier(0.22,1,0.36,1) both;
    }
    @keyframes acMsgIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .ac-msg.user { align-self: flex-end; align-items: flex-end; }
    .ac-msg.ai { align-self: flex-start; align-items: flex-start; }

    .ac-bubble {
      padding: 10px 13px;
      border-radius: 14px;
      font-size: 13.5px;
      line-height: 1.55;
      word-break: break-word;
    }
    .ac-msg.user .ac-bubble {
      background: var(--ink, #1f1d18);
      color: var(--cream, #f5ede0);
      border-radius: 14px 14px 3px 14px;
    }
    .ac-msg.ai .ac-bubble {
      background: var(--cream-soft, #faf5e9);
      color: var(--ink, #1f1d18);
      border: 1px solid var(--line-soft, #e3dac3);
      border-radius: 14px 14px 14px 3px;
    }
    .ac-msg.ai .ac-bubble a {
      color: var(--aster-deep, #5e3d8a);
      text-decoration: underline;
      text-underline-offset: 2px;
    }

    .ac-typing {
      display: none;
      align-self: flex-start;
      padding: 10px 14px;
      background: var(--cream-soft, #faf5e9);
      border: 1px solid var(--line-soft, #e3dac3);
      border-radius: 14px 14px 14px 3px;
      gap: 4px;
      align-items: center;
    }
    .ac-typing.visible { display: flex; }
    .ac-typing span {
      width: 5px; height: 5px;
      border-radius: 50%;
      background: var(--aster-light, #c4a5e0);
      animation: acDot 1.2s ease-in-out infinite;
    }
    .ac-typing span:nth-child(2) { animation-delay: 0.2s; }
    .ac-typing span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes acDot {
      0%,80%,100% { transform: scale(0.7); opacity: 0.4; }
      40% { transform: scale(1); opacity: 1; }
    }

    .ac-suggestions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 0 14px 12px;
      flex-shrink: 0;
    }
    .ac-chip {
      font-family: var(--sans, 'Inter', sans-serif);
      font-size: 11px;
      letter-spacing: 0.04em;
      padding: 6px 12px;
      border: 1px solid var(--line, #d8cfb8);
      border-radius: 999px;
      background: var(--cream-soft, #faf5e9);
      color: var(--ink-soft, #4a4640);
      cursor: pointer;
      transition: background 0.2s, border-color 0.2s, color 0.2s;
      white-space: nowrap;
    }
    .ac-chip:hover {
      background: var(--aster-mist, #ebdef5);
      border-color: var(--aster-light, #c4a5e0);
      color: var(--aster-deep, #5e3d8a);
    }

    .ac-input-row {
      display: flex;
      gap: 8px;
      padding: 10px 12px 12px;
      border-top: 1px solid var(--line-soft, #e3dac3);
      background: var(--paper, #fbf6ea);
      flex-shrink: 0;
      align-items: flex-end;
    }
    .ac-input {
      flex: 1;
      resize: none;
      font-family: var(--sans, 'Inter', sans-serif);
      font-size: 13.5px;
      color: var(--ink, #1f1d18);
      background: transparent;
      border: 1px solid var(--line, #d8cfb8);
      border-radius: 12px;
      padding: 9px 12px;
      outline: none;
      line-height: 1.45;
      min-height: 38px;
      max-height: 100px;
      transition: border-color 0.25s;
    }
    .ac-input:focus { border-color: var(--aster, #8b5fbf); }
    .ac-input::placeholder { color: var(--ink-mute, #6b6456); opacity: 0.6; }
    .ac-send {
      width: 36px; height: 36px;
      border-radius: 50%;
      background: var(--ink, #1f1d18);
      border: none;
      cursor: pointer;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.25s, transform 0.3s cubic-bezier(0.22,1,0.36,1);
    }
    .ac-send:hover { background: var(--aster-deep, #5e3d8a); transform: scale(1.08); }
    .ac-send:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }

    .ac-powered {
      text-align: center;
      font-size: 10px;
      letter-spacing: 0.1em;
      color: var(--ink-mute, #6b6456);
      opacity: 0.55;
      padding: 4px 0 8px;
      flex-shrink: 0;
      font-family: var(--sans, 'Inter', sans-serif);
    }

    @media (max-width: 480px) {
      #aster-chat-panel { right: 12px; bottom: 84px; width: calc(100vw - 24px); }
      #aster-chat-btn { right: 16px; bottom: 20px; }
    }
    @media (prefers-reduced-motion: reduce) {
      #aster-chat-panel { transition: opacity 0.15s; transform: none !important; }
      .ac-msg { animation: none; }
    }
  `;

  // ─── SVG helpers ───
  const BLOOM_SVG = `<svg class="ac-header-bloom" viewBox="-20 -20 40 40" aria-hidden="true">
    <g>
      ${Array.from({length:10},(_,i)=>`<ellipse cx="0" cy="-11" rx="2.2" ry="7" fill="#c4a5e0" transform="rotate(${i*36})"/>`).join('')}
    </g>
    <circle r="4.5" fill="#e89a7c"/>
  </svg>`;

  const CHAT_ICON = `<svg class="chat-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f5ede0" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>`;

  const CLOSE_ICON = `<svg class="close-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f5ede0" stroke-width="2" stroke-linecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>`;

  const SEND_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f5ede0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </svg>`;

  const SUGGESTIONS = [
    "What does Aster do?",
    "Tell me about pricing",
    "How does the process work?",
    "See your work",
    "Start a project",
  ];

  // ─── Inject styles ───
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // ─── Inject Puter.js ───
  function loadPuter(cb) {
    if (window.puter) { cb(); return; }
    const s = document.createElement('script');
    s.src = 'https://js.puter.com/v2/';
    s.onload = cb;
    s.onerror = () => cb(false);
    document.head.appendChild(s);
  }

  // ─── Build HTML ───
  const btn = document.createElement('button');
  btn.id = 'aster-chat-btn';
  btn.setAttribute('aria-label', 'Chat with Aster');
  btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = `<div id="aster-chat-pip"></div>${CHAT_ICON}${CLOSE_ICON}`;

  const panel = document.createElement('div');
  panel.id = 'aster-chat-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'false');
  panel.setAttribute('aria-label', 'Aster Studio chat');
  panel.innerHTML = `
    <div class="ac-header">
      ${BLOOM_SVG}
      <div class="ac-header-info">
        <div class="ac-header-name">Aster</div>
        <div class="ac-header-status"><span class="ac-status-dot"></span>Studio concierge</div>
      </div>
    </div>
    <div class="ac-messages" id="ac-messages">
      <div class="ac-msg ai">
        <div class="ac-bubble">
          Hello — I'm Aster, the studio's concierge. Whether you're curious about our process, pricing, or have a project in mind, I'm here to help it bloom. What brings you in today?
        </div>
      </div>
      <div class="ac-typing" id="ac-typing">
        <span></span><span></span><span></span>
      </div>
    </div>
    <div class="ac-suggestions" id="ac-suggestions">
      ${SUGGESTIONS.map(s => `<button class="ac-chip">${s}</button>`).join('')}
    </div>
    <div class="ac-input-row">
      <textarea class="ac-input" id="ac-input" placeholder="Ask about our work, process, or pricing…" rows="1" aria-label="Your message"></textarea>
      <button class="ac-send" id="ac-send" aria-label="Send message">${SEND_ICON}</button>
    </div>
    <div class="ac-powered">Powered by Puter.js · Free AI</div>
  `;

  document.body.appendChild(btn);
  document.body.appendChild(panel);

  // ─── State ───
  let isOpen = false;
  let isTyping = false;
  let conversationHistory = [];
  let puterReady = false;

  const messagesEl = document.getElementById('ac-messages');
  const typingEl = document.getElementById('ac-typing');
  const inputEl = document.getElementById('ac-input');
  const sendEl = document.getElementById('ac-send');
  const suggestionsEl = document.getElementById('ac-suggestions');

  // ─── Toggle ───
  function toggleChat() {
    isOpen = !isOpen;
    btn.classList.toggle('open', isOpen);
    panel.classList.toggle('open', isOpen);
    btn.setAttribute('aria-expanded', String(isOpen));
    if (isOpen) {
      // Hide pip once opened
      const pip = document.getElementById('aster-chat-pip');
      if (pip) pip.style.display = 'none';
      inputEl.focus();
    }
  }

  btn.addEventListener('click', toggleChat);

  // Close on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isOpen) toggleChat();
  });

  // ─── Auto-resize textarea ───
  inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 100) + 'px';
  });

  // ─── Add message to UI ───
  function addMessage(role, text) {
    // Remove typing indicator before adding message
    typingEl.classList.remove('visible');
    typingEl.remove();

    const div = document.createElement('div');
    div.className = `ac-msg ${role}`;
    // Basic markdown: **bold**, *italic*, links
    const formatted = text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/\n/g, '<br>');
    div.innerHTML = `<div class="ac-bubble">${formatted}</div>`;
    messagesEl.appendChild(div);
    messagesEl.appendChild(typingEl); // re-add typing at end
    scrollToBottom();
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function showTyping() {
    typingEl.classList.add('visible');
    scrollToBottom();
  }

  // ─── Suggestion chips ───
  suggestionsEl.querySelectorAll('.ac-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const text = chip.textContent;
      suggestionsEl.style.display = 'none'; // hide after first use
      sendMessage(text);
    });
  });

  // ─── Send ───
  async function sendMessage(text) {
    const trimmed = (text || inputEl.value).trim();
    if (!trimmed || isTyping) return;

    inputEl.value = '';
    inputEl.style.height = 'auto';
    suggestionsEl.style.display = 'none';

    addMessage('user', trimmed);
    conversationHistory.push({ role: 'user', content: trimmed });

    isTyping = true;
    sendEl.disabled = true;
    showTyping();

    if (!puterReady) {
      // Fallback if Puter failed to load
      setTimeout(() => {
        typingEl.classList.remove('visible');
        const fallback = `Thank you for your message! For the quickest response, you can reach us directly at **marketing@astermade.com** or use the [Connect form](/#connect) on our homepage. We reply within a day.`;
        addMessage('ai', fallback);
        conversationHistory.push({ role: 'assistant', content: fallback });
        isTyping = false;
        sendEl.disabled = false;
      }, 800);
      return;
    }

    try {
      // Build a single prompt string — simplest Puter.js format, most reliable.
      // Prepend the knowledge base + conversation history as a formatted transcript.
      let transcript = '';
      for (let i = 0; i < conversationHistory.length - 1; i++) {
        const h = conversationHistory[i];
        transcript += (h.role === 'user' ? 'Visitor: ' : 'Aster: ') + h.content + '\n\n';
      }
      const latestMsg = conversationHistory[conversationHistory.length - 1].content;
      const prompt = `${ASTER_KNOWLEDGE}\n\n---\n\nPrevious conversation:\n${transcript}Visitor: ${latestMsg}\n\nAster:`;

      const response = await window.puter.ai.chat(prompt, {
        model: 'claude-sonnet-4-6',
        stream: true
      });

      typingEl.classList.remove('visible');
      typingEl.remove();

      // Create streaming bubble
      const div = document.createElement('div');
      div.className = 'ac-msg ai';
      const bubble = document.createElement('div');
      bubble.className = 'ac-bubble';
      div.appendChild(bubble);
      messagesEl.appendChild(div);
      messagesEl.appendChild(typingEl);

      const renderMd = (t) => t
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
        .replace(/\n/g, '<br>');

      let fullText = '';
      for await (const part of response) {
        // Puter.js streaming: chunk may come as part.text or a delta string
        const chunk = part?.text
          ?? part?.message?.content?.[0]?.text
          ?? (typeof part === 'string' ? part : null);
        if (chunk) {
          fullText += chunk;
          bubble.innerHTML = renderMd(fullText);
          scrollToBottom();
        }
      }

      // If streaming yielded nothing, try non-streaming fallback
      if (!fullText) {
        const fb = await window.puter.ai.chat(prompt, { model: 'claude-sonnet-4-6' });
        fullText = fb?.message?.content?.[0]?.text ?? fb?.message?.content ?? fb?.text ?? String(fb ?? '');
        bubble.innerHTML = renderMd(fullText);
        scrollToBottom();
      }

      conversationHistory.push({ role: 'assistant', content: fullText });

    } catch (err) {
      console.error('Aster chat error:', err);
      typingEl.classList.remove('visible');

      // 401 = user not signed in to Puter — prompt them to authenticate
      const is401 = err?.status === 401 || err?.message === 'Unauthorized'
        || String(err).includes('401') || String(err?.message).includes('Unauthorized');

      if (is401) {
        const authMsg = `To chat with me, you'll need a free **Puter account** — it takes 30 seconds and lets you use AI across any Puter-powered site.`;
        addMessage('ai', authMsg);
        conversationHistory.push({ role: 'assistant', content: authMsg });

        // Add a sign-in button into the messages area
        const signinDiv = document.createElement('div');
        signinDiv.style.cssText = 'display:flex;justify-content:flex-start;padding:4px 0;';
        signinDiv.innerHTML = `<button id="ac-signin-btn" style="
          font-family:var(--sans,'Inter',sans-serif);font-size:13px;font-weight:500;
          padding:10px 20px;border-radius:999px;border:none;cursor:pointer;
          background:var(--aster,#8b5fbf);color:#fff;
          transition:background 0.25s;letter-spacing:0.02em;">
          Sign in with Puter — it's free
        </button>`;
        messagesEl.insertBefore(signinDiv, typingEl);
        scrollToBottom();

        document.getElementById('ac-signin-btn')?.addEventListener('click', async () => {
          try {
            await window.puter.auth.signIn();
            signinDiv.remove();
            // Retry the last message after sign-in
            const lastUserMsg = conversationHistory.filter(m => m.role === 'user').pop();
            if (lastUserMsg) {
              conversationHistory = conversationHistory.filter(m => m !== lastUserMsg);
              sendMessage(lastUserMsg.content);
            }
          } catch (signInErr) {
            console.error('Sign-in failed:', signInErr);
          }
        });
      } else {
        const errMsg = `I seem to be having a moment — the bloom hasn't opened quite right. Please try again, or reach us directly at **marketing@astermade.com**.`;
        addMessage('ai', errMsg);
        conversationHistory.push({ role: 'assistant', content: errMsg });
      }
    }

    isTyping = false;
    sendEl.disabled = false;
    inputEl.focus();
  }

  sendEl.addEventListener('click', () => sendMessage());
  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // ─── Load Puter.js ───
  loadPuter(async (ok) => {
    puterReady = ok !== false && !!window.puter;
    if (!puterReady) return;
    // Pre-check: if already signed in, nothing to do.
    // If not, we handle sign-in lazily on first 401.
    try {
      const signedIn = await window.puter.auth.isSignedIn();
      console.log('Puter signed in:', signedIn);
    } catch (_) {}
  });

})();