import './styles.scss';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const HISTORY_LIMIT = Number.parseInt(import.meta.env.VITE_HISTORY_LIMIT || '1440', 10);
const VISITOR_ID_KEY = 'notaclockVisitorId';

const dom = {
  stageFrame: document.querySelector('#stage-frame'),
  images: [
    document.querySelector('.stage__image--a'),
    document.querySelector('.stage__image--b')
  ],
  overlays: [
    document.querySelector('.stage__overlay--a'),
    document.querySelector('.stage__overlay--b')
  ],
  statusCopy: document.querySelector('#status-copy'),
  refreshInterval: document.querySelector('#refresh-interval'),
  historyCopy: document.querySelector('#history-copy'),
  imageTime: document.querySelector('#image-time'),
  overlayToggle: document.querySelector('#overlay-toggle'),
  infoToggle: document.querySelector('#info-toggle'),
  infoClose: document.querySelector('#info-close'),
  infoCard: document.querySelector('#info-card'),
  sourceCard: document.querySelector('#source-card'),
  sourcePrompt: document.querySelector('#source-prompt'),
  feedbackUp: document.querySelector('#feedback-up'),
  feedbackDown: document.querySelector('#feedback-down'),
  feedbackSummary: document.querySelector('#feedback-summary')
};

function getVisitorId() {
  const existing = localStorage.getItem(VISITOR_ID_KEY);

  if (existing) {
    return existing;
  }

  const nextId = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(VISITOR_ID_KEY, nextId);
  return nextId;
}

const state = {
  config: null,
  images: [],
  displayedImage: null,
  activeSlot: 0,
  live: true,
  refreshIntervalMinutes: Number.parseInt(localStorage.getItem('refreshIntervalMinutes') || '1', 10),
  overlayEnabled: localStorage.getItem('overlayEnabled') === 'true',
  infoOpen: false,
  lastTransitionAt: 0,
  historyIndex: 0,
  currentPollId: null,
  historyPollId: null
};

function feedbackKey(imageId) {
  return `feedback:${imageId}`;
}

function getLocalVote(imageId) {
  return localStorage.getItem(feedbackKey(imageId));
}

function setLocalVote(imageId, vote) {
  if (vote) {
    localStorage.setItem(feedbackKey(imageId), vote);
    return;
  }

  localStorage.removeItem(feedbackKey(imageId));
}

async function fetchJson(path) {
  const response = await fetch(`${API_BASE}${path}`);

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`);
  }

  return response.json();
}

async function preloadImage(url) {
  if (!url) {
    return;
  }

  const image = new Image();
  image.src = url;

  if (image.decode) {
    await image.decode();
    return;
  }

  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
  });
}

function formatDistance(record) {
  if (!record?.representedAt) {
    return 'Unknown distance';
  }

  const deltaMinutes = Math.max(0, Math.round((Date.now() - Date.parse(record.representedAt)) / 60000));
  return deltaMinutes === 0 ? 'Now' : `${deltaMinutes} minute${deltaMinutes === 1 ? '' : 's'} back`;
}

function setStatus(message) {
  console.warn(message);
}

function buildIntervalOptions() {
  const { min, max, default: defaultValue } = state.config.refreshInterval;
  const selected = Math.min(Math.max(state.refreshIntervalMinutes || defaultValue, min), max);
  state.refreshIntervalMinutes = selected;

  dom.refreshInterval.innerHTML = '';

  for (let minute = min; minute <= max; minute += 1) {
    const option = document.createElement('option');
    option.value = String(minute);
    option.textContent = `${minute} minute${minute === 1 ? '' : 's'}`;
    option.selected = minute === selected;
    dom.refreshInterval.append(option);
  }
}

function updateControls() {
  dom.overlayToggle.setAttribute('aria-pressed', String(state.overlayEnabled));
  dom.overlayToggle.classList.toggle('is-active', state.overlayEnabled);
  dom.stageFrame.classList.toggle('is-overlay-active', state.overlayEnabled);
  dom.infoToggle.setAttribute('aria-expanded', String(state.infoOpen));
  dom.infoCard.hidden = !state.infoOpen;
  updateSourceCard();
}

function updateSourceCard() {
  const record = state.displayedImage;
  const shouldShow = Boolean(state.overlayEnabled && record);
  dom.sourceCard.hidden = !shouldShow;

  if (!record) {
    dom.sourcePrompt.textContent = '';
    dom.feedbackSummary.textContent = 'No image loaded yet.';
    return;
  }

  const feedback = record.feedback || { up: 0, down: 0 };
  const localVote = getLocalVote(record.id);

  dom.sourcePrompt.textContent = record.prompt || 'No prompt recorded for this frame.';
  dom.feedbackUp.classList.toggle('is-active', localVote === 'up');
  dom.feedbackDown.classList.toggle('is-active', localVote === 'down');
  dom.feedbackUp.setAttribute('aria-pressed', String(localVote === 'up'));
  dom.feedbackDown.setAttribute('aria-pressed', String(localVote === 'down'));
  dom.feedbackSummary.textContent = `${feedback.up || 0} up • ${feedback.down || 0} down`;
}

function updateHistoryUI() {
  const selected = state.live ? state.displayedImage || state.images[0] : state.images[state.historyIndex];
  dom.historyCopy.textContent = selected
    ? `${state.live ? 'Live view' : 'Manual rewind'} • ${formatDistance(selected)} • Left/right arrows rewind. Press L for live.`
    : 'Waiting for image history';
}

function updateDetails(record) {
  if (!record) {
    dom.imageTime.textContent = 'No frame available yet';
    return;
  }

  dom.imageTime.textContent = `${record.displayDate} • ${record.displayTime} • ${record.renderMode}`;
  updateSourceCard();
}

async function transitionTo(record, options = {}) {
  if (!record?.imageUrl) {
    return;
  }

  if (!options.force && state.displayedImage?.id === record.id) {
    updateDetails(record);
    updateHistoryUI();
    return;
  }

  await Promise.all([preloadImage(record.imageUrl), preloadImage(record.maskUrl)]);

  const nextSlot = state.activeSlot === 0 ? 1 : 0;
  const nextImage = dom.images[nextSlot];
  const currentImage = dom.images[state.activeSlot];
  const nextOverlay = dom.overlays[nextSlot];
  const currentOverlay = dom.overlays[state.activeSlot];

  nextImage.src = record.imageUrl;
  nextImage.alt = `${record.displayDate} ${record.displayTime}`;
  nextImage.classList.add('is-visible');
  currentImage.classList.remove('is-visible');

  if (record.maskUrl) {
    nextOverlay.src = record.maskUrl;
  } else {
    nextOverlay.removeAttribute('src');
  }
  nextOverlay.alt = '';
  nextOverlay.classList.add('is-visible');
  currentOverlay.classList.remove('is-visible');

  state.activeSlot = nextSlot;
  state.displayedImage = record;
  state.lastTransitionAt = Date.now();

  updateDetails(record);
  updateHistoryUI();
}

function maybeAdvanceLive() {
  if (!state.live || state.images.length === 0) {
    return;
  }

  const latest = state.images[0];
  if (!state.displayedImage) {
    void transitionTo(latest, { force: true });
    return;
  }

  const enoughTimePassed = Date.now() - state.lastTransitionAt >= state.refreshIntervalMinutes * 60 * 1000;
  if (latest.id !== state.displayedImage.id && enoughTimePassed) {
    void transitionTo(latest);
  }
}

async function refreshHistory() {
  const payload = await fetchJson(`/api/images?limit=${HISTORY_LIMIT}`);
  state.images = payload.images || [];

  if (state.historyIndex > state.images.length - 1) {
    state.historyIndex = 0;
  }

  if (!state.displayedImage && state.images[0]) {
    await transitionTo(state.images[0], { force: true });
  }

  updateHistoryUI();
  maybeAdvanceLive();
}

async function refreshCurrent() {
  const payload = await fetchJson('/api/images/current');
  const current = payload.image;

  if (!current) {
    return;
  }

  if (state.images[0]?.id !== current.id) {
    state.images = [current, ...state.images.filter((image) => image.id !== current.id)];
  } else {
    state.images = [current, ...state.images.slice(1)];
  }

  if (state.displayedImage?.id === current.id) {
    state.displayedImage = current;
    updateDetails(current);
  }

  maybeAdvanceLive();
}

async function sendFeedback(vote) {
  const record = state.displayedImage;

  if (!record) {
    return;
  }

  const previousVote = getLocalVote(record.id);
  const nextVote = previousVote === vote ? null : vote;
  setLocalVote(record.id, nextVote);
  updateSourceCard();

  try {
    const response = await fetch(`${API_BASE}/api/images/${encodeURIComponent(record.id)}/feedback`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        vote: nextVote,
        previousVote,
        visitorId: getVisitorId()
      })
    });

    if (!response.ok) {
      throw new Error(`Feedback failed with ${response.status}`);
    }

    const payload = await response.json();
    const updatedImage = payload.image;

    if (updatedImage) {
      state.displayedImage = updatedImage;
      state.images = state.images.map((image) => (image.id === updatedImage.id ? updatedImage : image));
      updateDetails(updatedImage);
    }
  } catch (error) {
    setLocalVote(record.id, previousVote);
    updateSourceCard();
    setStatus(error.message);
  }
}

function toggleOverlay(forceValue) {
  state.overlayEnabled = forceValue ?? !state.overlayEnabled;
  localStorage.setItem('overlayEnabled', String(state.overlayEnabled));
  dom.overlayToggle.setAttribute('aria-label', state.overlayEnabled ? 'Hide source control image' : 'Show source control image');
  dom.overlayToggle.setAttribute('title', state.overlayEnabled ? 'Hide source control image' : 'Show source control image');
  updateControls();
}

function setInfoOpen(value) {
  state.infoOpen = value;
  updateControls();
}

function stepHistory(direction) {
  if (state.images.length === 0) {
    return;
  }

  if (direction < 0) {
    const nextIndex = state.live ? 1 : Math.min(state.historyIndex + 1, state.images.length - 1);
    state.live = false;
    state.historyIndex = nextIndex;
  } else {
    if (state.live) {
      return;
    }

    state.historyIndex = Math.max(0, state.historyIndex - 1);
    if (state.historyIndex === 0) {
      state.live = true;
    }
  }

  updateControls();
  void transitionTo(state.images[state.historyIndex], { force: true });
}

function bindEvents() {
  dom.refreshInterval.addEventListener('change', (event) => {
    state.refreshIntervalMinutes = Number.parseInt(event.target.value, 10);
    localStorage.setItem('refreshIntervalMinutes', String(state.refreshIntervalMinutes));
    updateControls();
  });

  dom.overlayToggle.addEventListener('click', () => {
    toggleOverlay();
  });

  dom.feedbackUp.addEventListener('click', () => {
    void sendFeedback('up');
  });

  dom.feedbackDown.addEventListener('click', () => {
    void sendFeedback('down');
  });

  dom.infoToggle.addEventListener('click', (event) => {
    event.stopPropagation();
    setInfoOpen(!state.infoOpen);
  });

  dom.infoClose.addEventListener('click', () => {
    setInfoOpen(false);
  });

  document.addEventListener('click', (event) => {
    if (state.infoOpen && !dom.infoCard.contains(event.target) && event.target !== dom.infoToggle) {
      setInfoOpen(false);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      stepHistory(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      stepHistory(1);
    } else if (event.key.toLowerCase() === 'l') {
      event.preventDefault();
      state.live = true;
      state.historyIndex = 0;
      updateControls();
      if (state.images[0]) {
        void transitionTo(state.images[0], { force: true });
      }
    } else if (event.key.toLowerCase() === 'o') {
      event.preventDefault();
      toggleOverlay();
    } else if (event.key === 'Escape') {
      setInfoOpen(false);
    }
  });
}

async function init() {
  try {
    const configPayload = await fetchJson('/api/config');
    state.config = configPayload;
    buildIntervalOptions();
    updateControls();
    bindEvents();
    await refreshHistory();
    await refreshCurrent();
    updateControls();

    state.currentPollId = window.setInterval(() => {
      void refreshCurrent().catch((error) => {
        setStatus(`Current image check failed: ${error.message}`);
      });
    }, 15000);

    state.historyPollId = window.setInterval(() => {
      void refreshHistory().catch((error) => {
        setStatus(`History refresh failed: ${error.message}`);
      });
    }, 60000);
  } catch (error) {
    setStatus(`Could not load the API: ${error.message}`);
  }
}

void init();
