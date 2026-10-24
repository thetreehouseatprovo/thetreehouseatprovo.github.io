(() => {
  'use strict';

  const EVENT_FEED = 'https://script.google.com/macros/s/AKfycbz-MVbEKOixXvHxcqZCfgEfyaKg3C3sYwlKzh0JCV9RnBfF1wYL__YjdyzsDVVaoTv2/exec';
  const REFRESH_MS = 5 * 60 * 1000;
  let eventCache = [];
  let lastActiveElement = null;

  // Responsive site navigation.
  const menuButton = document.querySelector('.menu-btn');
  const nav = document.querySelector('#main-nav');
  if (menuButton && nav) {
    menuButton.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      menuButton.setAttribute('aria-expanded', String(open));
    });
    nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
      nav.classList.remove('open');
      menuButton.setAttribute('aria-expanded', 'false');
    }));
  }

  // Shared, read-only event feed. Build DOM nodes instead of injecting Sheet text as HTML.
  const categoryMatches = {
    concert: /concert|open\s*stage|open\s*mic|live\s*music|show/i,
    party: /part(y|ies)/i,
    game: /game|board.?game/i,
    service: /service|cleanup|clean.?up/i,
    temple: /temple/i,
    volunteer: /volunteer|help.?out/i
  };

  function addText(parent, tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = String(value ?? '').trim();
    parent.appendChild(node);
    return node;
  }

  function formatEvent(event, filter) {
    const card = document.createElement('article');
    card.className = 'live-event';
    const title = String(event.name ?? event.title ?? 'Tree House event').trim();
    const date = String(event.date ?? '').trim();
    const time = String(event.time ?? '').trim();
    const dateLine = [date, time].filter(Boolean).join(' · ') || 'Details coming soon';
    addText(card, 'time', '', dateLine);
    addText(card, 'h3', '', title);
    const description = String(event.description ?? event.details ?? '').trim();
    if (description) addText(card, 'p', '', description);
    return card;
  }

  function renderEvents(data) {
    eventCache = Array.isArray(data) ? data.filter(item => item && typeof item === 'object') : [];
    document.querySelectorAll('[data-events-list]').forEach(container => {
      const filter = container.dataset.eventsList || 'all';
      const matcher = categoryMatches[filter];
      const items = matcher ? eventCache.filter(event => matcher.test(`${event.name ?? ''} ${event.description ?? ''} ${event.type ?? ''}`)) : eventCache;
      container.replaceChildren();
      if (!items.length) {
        const status = document.createElement('p');
        status.className = 'feed-status';
        status.textContent = filter === 'all'
          ? 'No upcoming events are listed right now. Follow Instagram for announcements.'
          : `No upcoming ${filter} events are listed yet. Check Instagram for updates.`;
        container.appendChild(status);
      } else {
        items.forEach(event => container.appendChild(formatEvent(event, filter)));
      }
    });
  }

  function showFeedError() {
    document.querySelectorAll('[data-events-list]').forEach(container => {
      if (eventCache.length) return;
      const status = document.createElement('p');
      status.className = 'feed-status';
      status.textContent = 'The event calendar could not load. Please try again or check Instagram for current details.';
      container.replaceChildren(status);
    });
  }

  let loadingFeed = false;
  async function refreshEvents() {
    if (loadingFeed || !document.querySelector('[data-events-list]')) return;
    loadingFeed = true;
    try {
      const response = await fetch(`${EVENT_FEED}?_=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Calendar returned ${response.status}`);
      const data = await response.json();
      renderEvents(data);
    } catch (error) {
      console.error('Could not load Tree House event calendar:', error);
      showFeedError();
    } finally {
      loadingFeed = false;
    }
  }

  document.querySelectorAll('[data-refresh-events]').forEach(button => button.addEventListener('click', refreshEvents));
  refreshEvents();
  window.setInterval(refreshEvents, REFRESH_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshEvents();
  });

  // Embedded Google Form dialog on Concerts & Open Stage.
  const modal = document.querySelector('#formModal');
  const types = ['band', 'openmic'];
  function switchForm(type) {
    const selected = types.includes(type) ? type : 'band';
    types.forEach(name => {
      const frame = document.querySelector(`#iframe-${name}`);
      const tab = document.querySelector(`[data-form-tab="${name}"]`);
      if (frame) frame.classList.toggle('active', name === selected);
      if (tab) {
        tab.classList.toggle('active', name === selected);
        tab.setAttribute('aria-selected', String(name === selected));
      }
    });
  }
  function closeForm() {
    if (!modal) return;
    modal.classList.remove('open');
    document.body.style.overflow = '';
    if (lastActiveElement) lastActiveElement.focus();
  }
  function openForm(type, trigger) {
    if (!modal) return;
    lastActiveElement = trigger || document.activeElement;
    switchForm(type);
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    modal.querySelector('[data-close-form]')?.focus();
  }
  document.querySelectorAll('[data-open-form]').forEach(button => button.addEventListener('click', () => openForm(button.dataset.openForm, button)));
  document.querySelectorAll('[data-form-tab]').forEach(button => button.addEventListener('click', () => switchForm(button.dataset.formTab)));
  modal?.querySelector('[data-close-form]')?.addEventListener('click', closeForm);
  modal?.addEventListener('click', event => { if (event.target === modal) closeForm(); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && modal?.classList.contains('open')) closeForm();
  });

  // The suggestion handoff makes clear that the visitor must send the DM themselves.
  const suggestionForm = document.querySelector('#suggestion-form');
  if (suggestionForm) {
    suggestionForm.addEventListener('submit', async event => {
      event.preventDefault();
      const fields = new FormData(suggestionForm);
      const name = String(fields.get('name') || '').trim();
      const topic = String(fields.get('topic') || 'Suggestion').trim();
      const message = String(fields.get('message') || '').trim();
      const payload = `Tree House suggestion — ${topic}\n${name ? `From: ${name}\n` : ''}\n${message}`;
      const output = document.querySelector('#suggestion-output');
      const status = document.querySelector('#suggestion-status');
      output.textContent = payload;
      output.classList.add('show');
      window.open('https://www.instagram.com/TheTreeHouseAtProvo/', '_blank', 'noopener,noreferrer');
      try {
        await navigator.clipboard.writeText(payload);
        status.textContent = 'Your message is copied. Instagram will open in a new tab—paste it into a DM and send it to Tree House.';
      } catch {
        status.textContent = 'Your message is ready below. Select and copy it, then paste it into an Instagram DM to Tree House.';
      }
      output.focus();
    });
  }
})();
