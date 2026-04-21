import { useEffect, useRef, useState } from 'react';
import About from './About';
import ClockImage from './ClockImage';
import Info from './Info';
import './index.scss';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const HISTORY_LIMIT = Number.parseInt(import.meta.env.VITE_HISTORY_LIMIT || '1440', 10);
const VISITOR_ID_KEY = 'notaclockVisitorId';

function feedbackKey(imageId) {
  return `feedback:${imageId}`;
}

function getLocalVote(imageId) {
  return imageId ? localStorage.getItem(feedbackKey(imageId)) : null;
}

function setLocalVote(imageId, vote) {
  if (!imageId) {
    return;
  }

  if (vote) {
    localStorage.setItem(feedbackKey(imageId), vote);
    return;
  }

  localStorage.removeItem(feedbackKey(imageId));
}

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

function formatDistance(record) {
  if (!record?.representedAt) {
    return 'Waiting for image history';
  }

  const deltaMinutes = Math.max(0, Math.round((Date.now() - Date.parse(record.representedAt)) / 60000));
  return deltaMinutes === 0 ? 'Now' : `${deltaMinutes} minute${deltaMinutes === 1 ? '' : 's'} back`;
}

async function fetchJson(path) {
  const response = await fetch(`${API_BASE}${path}`);

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`);
  }

  return response.json();
}

export default function App() {
  const [config, setConfig] = useState(null);
  const [images, setImages] = useState([]);
  const [displayedImage, setDisplayedImage] = useState(null);
  const [live, setLive] = useState(true);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [refreshIntervalMinutes, setRefreshIntervalMinutes] = useState(() =>
    Number.parseInt(localStorage.getItem('refreshIntervalMinutes') || '1', 10)
  );
  const [sourceOpen, setSourceOpen] = useState(() => localStorage.getItem('overlayEnabled') === 'true');
  const [aboutOpen, setAboutOpen] = useState(false);
  const [localVoteVersion, setLocalVoteVersion] = useState(0);
  const lastTransitionAtRef = useRef(0);
  const stateRef = useRef({});

  stateRef.current = {
    images,
    displayedImage,
    live,
    historyIndex,
    refreshIntervalMinutes
  };

  function logWarning(message) {
    console.warn(message);
  }

  function transitionTo(record, options = {}) {
    if (!record?.imageUrl) {
      return;
    }

    const current = stateRef.current.displayedImage;

    if (!options.force && current?.id === record.id) {
      setDisplayedImage(record);
      return;
    }

    lastTransitionAtRef.current = Date.now();
    setDisplayedImage(record);
  }

  function maybeAdvanceLive(latestImage) {
    const snapshot = stateRef.current;
    const latest = latestImage || snapshot.images[0];

    if (!snapshot.live || !latest) {
      return;
    }

    if (!snapshot.displayedImage) {
      transitionTo(latest, { force: true });
      return;
    }

    const enoughTimePassed = Date.now() - lastTransitionAtRef.current >= snapshot.refreshIntervalMinutes * 60 * 1000;

    if (latest.id !== snapshot.displayedImage.id && enoughTimePassed) {
      transitionTo(latest);
    }
  }

  async function refreshHistory() {
    const payload = await fetchJson(`/api/images?limit=${HISTORY_LIMIT}`);
    const nextImages = payload.images || [];
    const snapshot = stateRef.current;
    const nextHistoryIndex = snapshot.historyIndex > nextImages.length - 1 ? 0 : snapshot.historyIndex;

    setImages(nextImages);
    setHistoryIndex(nextHistoryIndex);

    if (!snapshot.displayedImage && nextImages[0]) {
      transitionTo(nextImages[0], { force: true });
    }

    maybeAdvanceLive(nextImages[0]);
  }

  async function refreshCurrent() {
    const payload = await fetchJson('/api/images/current');
    const current = payload.image;

    if (!current) {
      return;
    }

    const snapshot = stateRef.current;
    const nextImages =
      snapshot.images[0]?.id === current.id
        ? [current, ...snapshot.images.slice(1)]
        : [current, ...snapshot.images.filter((image) => image.id !== current.id)];

    setImages(nextImages);

    if (snapshot.displayedImage?.id === current.id) {
      setDisplayedImage(current);
    }

    maybeAdvanceLive(current);
  }

  function stepHistory(direction) {
    const snapshot = stateRef.current;

    if (snapshot.images.length === 0) {
      return;
    }

    if (direction < 0) {
      const nextIndex = snapshot.live ? 1 : Math.min(snapshot.historyIndex + 1, snapshot.images.length - 1);
      setLive(false);
      setHistoryIndex(nextIndex);
      transitionTo(snapshot.images[nextIndex], { force: true });
      return;
    }

    if (snapshot.live) {
      return;
    }

    const nextIndex = Math.max(0, snapshot.historyIndex - 1);
    setHistoryIndex(nextIndex);

    if (nextIndex === 0) {
      setLive(true);
    }

    transitionTo(snapshot.images[nextIndex], { force: true });
  }

  async function sendFeedback(vote) {
    const record = stateRef.current.displayedImage;

    if (!record) {
      return;
    }

    const previousVote = getLocalVote(record.id);
    const nextVote = previousVote === vote ? null : vote;
    setLocalVote(record.id, nextVote);
    setLocalVoteVersion((version) => version + 1);

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
        setDisplayedImage(updatedImage);
        setImages((currentImages) => currentImages.map((image) => (image.id === updatedImage.id ? updatedImage : image)));
      }
    } catch (error) {
      setLocalVote(record.id, previousVote);
      setLocalVoteVersion((version) => version + 1);
      logWarning(error.message);
    }
  }

  function handleRefreshIntervalChange(nextMinutes) {
    const interval = config?.refreshInterval || { min: 1, max: 30 };
    const clamped = Math.min(Math.max(nextMinutes, interval.min), interval.max);
    setRefreshIntervalMinutes(clamped);
    localStorage.setItem('refreshIntervalMinutes', String(clamped));
  }

  function handleSourceToggle() {
    setSourceOpen((current) => {
      const next = !current;
      localStorage.setItem('overlayEnabled', String(next));
      return next;
    });
  }

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const configPayload = await fetchJson('/api/config');

        if (cancelled) {
          return;
        }

        const interval = configPayload.refreshInterval;
        const clamped = Math.min(Math.max(refreshIntervalMinutes || interval.default, interval.min), interval.max);
        setConfig(configPayload);
        setRefreshIntervalMinutes(clamped);
        localStorage.setItem('refreshIntervalMinutes', String(clamped));
        await refreshHistory();
        await refreshCurrent();
      } catch (error) {
        logWarning(`Could not load the API: ${error.message}`);
      }
    }

    void init();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const currentPollId = window.setInterval(() => {
      void refreshCurrent().catch((error) => {
        logWarning(`Current image check failed: ${error.message}`);
      });
    }, 15000);
    const historyPollId = window.setInterval(() => {
      void refreshHistory().catch((error) => {
        logWarning(`History refresh failed: ${error.message}`);
      });
    }, 60000);

    return () => {
      window.clearInterval(currentPollId);
      window.clearInterval(historyPollId);
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        stepHistory(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        stepHistory(1);
      } else if (event.key.toLowerCase() === 'l') {
        event.preventDefault();
        const latest = stateRef.current.images[0];
        setLive(true);
        setHistoryIndex(0);

        if (latest) {
          transitionTo(latest, { force: true });
        }
      } else if (event.key.toLowerCase() === 'o') {
        event.preventDefault();
        handleSourceToggle();
      } else if (event.key === 'Escape') {
        setAboutOpen(false);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const selected = live ? displayedImage || images[0] : images[historyIndex];
  const historyText = selected
    ? `${live ? 'Live view' : 'Manual rewind'} • ${formatDistance(selected)} • Left/right arrows rewind. Press L for live.`
    : 'Waiting for image history';
  const localVote = getLocalVote(displayedImage?.id) || null;

  return (
    <main className="stage">
      <div className={`stage__frame ${sourceOpen ? 'is-overlay-active' : ''}`}>
        <ClockImage image={displayedImage} />
        <About
          config={config}
          historyText={historyText}
          image={displayedImage}
          isOpen={aboutOpen}
          onClose={() => setAboutOpen(false)}
          onRefreshIntervalChange={handleRefreshIntervalChange}
          onToggle={() => setAboutOpen((current) => !current)}
          refreshIntervalMinutes={refreshIntervalMinutes}
        />
        <Info
          image={displayedImage}
          isOpen={sourceOpen}
          localVote={localVote}
          localVoteVersion={localVoteVersion}
          onFeedback={sendFeedback}
          onToggle={handleSourceToggle}
        />
      </div>
    </main>
  );
}
