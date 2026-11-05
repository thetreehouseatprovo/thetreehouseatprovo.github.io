(() => {
  'use strict';

  const EVENT_FEED = 'https://script.google.com/macros/s/AKfycbzkfISwXktdQi0aKzObj2JObK9YSbH9-TmIukyiRLh2wfVguOL03ke41h10VMPq2ut5/exec';
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

  const MONTH_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const MONTH_INDEX = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

  function parseEventDate(raw) {
    const text = String(raw ?? '').trim();
    if (!text) return null;
    const weekdayMatch = text.match(/(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)/i);
    const weekday = weekdayMatch ? weekdayMatch[1].slice(0, 3).toUpperCase() : '';
    let month = null;
    let day = null;
    const slash = text.match(/(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?/);
    const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/);
    const named = text.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})/i);
    if (slash) { month = parseInt(slash[1], 10) - 1; day = parseInt(slash[2], 10); }
    else if (iso) { month = parseInt(iso[2], 10) - 1; day = parseInt(iso[3], 10); }
    else if (named) { month = MONTH_INDEX[named[1].slice(0, 3).toLowerCase()]; day = parseInt(named[2], 10); }
    if (month === null || day === null || month < 0 || month > 11 || day < 1 || day > 31) return null;
    return { month: MONTH_SHORT[month], day, weekday };
  }

  function driveImageUrl(url) {
    const match = String(url).match(/drive\.google\.com\/(?:open\?id=|file\/d\/|uc\?(?:[^#]*&)?id=)([A-Za-z0-9_-]+)/);
    return match ? `https://drive.google.com/thumbnail?id=${match[1]}&sz=w1200` : url;
  }

  function addRichText(parent, className, value) {
    const node = document.createElement('p');
    if (className) node.className = className;
    String(value).split(/(https?:\/\/[^\s]+)/g).forEach(part => {
      if (/^https?:\/\//.test(part)) {
        const link = document.createElement('a');
        link.href = part;
        link.textContent = part.replace(/^https?:\/\/(www\.)?/, '');
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        node.appendChild(link);
      } else if (part) {
        node.appendChild(document.createTextNode(part));
      }
    });
    parent.appendChild(node);
    return node;
  }

  // Flyer pop-out (lightbox): one shared overlay for every event card.
  const flyerBox = document.createElement('div');
  flyerBox.className = 'flyer-lightbox';
  flyerBox.setAttribute('role', 'dialog');
  flyerBox.setAttribute('aria-modal', 'true');
  flyerBox.setAttribute('aria-label', 'Event flyer');
  const flyerImg = document.createElement('img');
  flyerImg.alt = 'Event flyer, full size';
  const flyerClose = document.createElement('button');
  flyerClose.type = 'button';
  flyerClose.className = 'flyer-close';
  flyerClose.textContent = '\u00d7';
  flyerClose.setAttribute('aria-label', 'Close flyer');
  flyerBox.appendChild(flyerImg);
  flyerBox.appendChild(flyerClose);
  document.body.appendChild(flyerBox);

  function openFlyer(src) {
    flyerImg.src = src;
    flyerBox.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeFlyer() {
    flyerBox.classList.remove('open');
    document.body.style.overflow = '';
    flyerImg.removeAttribute('src');
  }
  flyerBox.addEventListener('click', event => { if (event.target !== flyerImg) closeFlyer(); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && flyerBox.classList.contains('open')) closeFlyer();
  });

  function formatEvent(event, filter) {
    const card = document.createElement('article');
    card.className = 'live-event';
    const title = String(event.name ?? event.title ?? 'Tree House event').trim();
    const date = String(event.date ?? '').trim();
    const time = String(event.time ?? '').trim();
    const image = String(event.image ?? '').trim();
    const main = document.createElement('div');
    main.className = 'event-main';
    const row = document.createElement('div');
    row.className = 'event-row';
    const parsed = parseEventDate(date);
    const badge = document.createElement('div');
    badge.className = 'event-date';
    if (parsed) {
      addText(badge, 'span', 'event-date-month', parsed.month);
      addText(badge, 'span', 'event-date-day', String(parsed.day));
      if (parsed.weekday) addText(badge, 'span', 'event-date-weekday', parsed.weekday);
    } else {
      addText(badge, 'span', 'event-date-raw', date || 'TBA');
    }
    row.appendChild(badge);
    const body = document.createElement('div');
    body.className = 'event-body';
    addText(body, 'h3', '', title);
    if (!parsed && date && time) addText(body, 'p', 'event-time', date);
    if (time) addText(body, 'p', 'event-time', time);
    const location = String(event.location ?? '').trim();
    if (location) addText(body, 'p', 'event-loc', location);
    row.appendChild(body);
    main.appendChild(row);
    const description = String(event.description ?? event.details ?? '').trim();
    if (description) addRichText(main, 'event-desc', description);
    card.appendChild(main);
    if (image) {
      const img = document.createElement('img');
      img.className = 'event-flyer';
      img.src = driveImageUrl(image);
      img.alt = '';
      img.loading = 'lazy';
      img.title = 'Click to see the full flyer';
      img.addEventListener('error', () => img.remove());
      img.addEventListener('click', () => openFlyer(driveImageUrl(image).replace('sz=w1200', 'sz=w1600')));
      card.appendChild(img);
    }
    return card;
  }

  function renderEvents(data) {
    eventCache = Array.isArray(data) ? data.filter(item => item && typeof item === 'object') : [];
    // The feed arrives in date order, so the first card with a given title is
    // the next time that event happens — hide any later repeats of that title.
    const seenTitles = new Set();
    eventCache = eventCache.filter(event => {
      const key = String(event.name ?? event.title ?? '').trim().toLowerCase();
      if (!key || seenTitles.has(key)) return !key;
      seenTitles.add(key);
      return true;
    });
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

  // Embedded Google Form dialog.
  const modal = document.querySelector('#formModal');
  const types = ['band', 'host', 'openmic', 'vendor'];

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
