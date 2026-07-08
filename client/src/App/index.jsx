import { useEffect, useRef, useState } from 'react';
import About from './About';
import ClockImage from './ClockImage';
import Info from './Info';
import { loadStaticCatalog } from './static-catalog';
import './index.scss';

const DRAG_DEAD_ZONE_PX = 8;
const DRAG_STEP_PX = 56;
const DRAG_VERTICAL_CANCEL_PX = 14;
const LOG_PREFIX = '[notaclock]';
const CLOCK_TICK_MS = 15000;

function getFullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function canRequestFullscreen(element) {
  return Boolean(element?.requestFullscreen || element?.webkitRequestFullscreen);
}

async function requestFullscreen(element) {
  if (element.requestFullscreen) {
    await element.requestFullscreen();
    return;
  }

  element.webkitRequestFullscreen?.();
}

async function exitFullscreen() {
  if (document.exitFullscreen) {
    await document.exitFullscreen();
    return;
  }

  document.webkitExitFullscreen?.();
}

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

function normalizeRefreshInterval(nextMinutes, interval = { min: 5, max: 60, step: 5, default: 5 }) {
  const min = interval.min ?? 5;
  const max = interval.max ?? 60;
  const step = interval.step || 5;
  const fallback = interval.default ?? min;
  const raw = Number.isFinite(nextMinutes) ? nextMinutes : fallback;
  const clamped = Math.min(Math.max(raw, min), max);

  return Math.min(max, min + Math.round((clamped - min) / step) * step);
}

function getHistoryIndex(snapshot) {
  const imageIndex = snapshot.displayedImage?.id
    ? snapshot.images.findIndex((image) => image.id === snapshot.displayedImage.id)
    : -1;

  if (imageIndex >= 0) {
    return imageIndex;
  }

  return Math.min(snapshot.historyIndex, Math.max(0, snapshot.images.length - 1));
}

function isInteractiveElement(target) {
  return Boolean(target?.closest?.('button, select, input, textarea, label, a, .info-card, .source-card'));
}

function getClockParts(date, timeZone) {
  if (!timeZone) {
    return {
      hour: date.getHours(),
      minute: date.getMinutes()
    };
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));

  return {
    hour: Number.parseInt(parts.hour, 10),
    minute: Number.parseInt(parts.minute, 10)
  };
}

function getClockMinute(date = new Date(), timeZone = '') {
  const { hour, minute } = getClockParts(date, timeZone);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return 0;
  }

  return (hour % 12) * 60 + minute;
}

function normalizeSlotMinute(record) {
  const value = Number.parseInt(record?.slotMinute, 10);

  if (Number.isFinite(value)) {
    return ((value % 720) + 720) % 720;
  }

  const match = String(record?.displaySlotKey || '').match(/^(\d{2})(\d{2})$/);

  if (!match) {
    return 0;
  }

  return Number.parseInt(match[1], 10) * 60 + Number.parseInt(match[2], 10);
}

function sortBySlot(images) {
  return [...images].sort((left, right) => normalizeSlotMinute(left) - normalizeSlotMinute(right));
}

function findCurrentImage(images, config, date = new Date()) {
  if (!images.length) {
    return null;
  }

  const currentMinute = getClockMinute(date, config?.timezone || '');
  const sorted = sortBySlot(images);
  let selected = sorted[sorted.length - 1];

  for (const image of sorted) {
    if (normalizeSlotMinute(image) > currentMinute) {
      break;
    }

    selected = image;
  }

  return selected;
}

function buildCycleHistory(images, currentImage) {
  const sorted = sortBySlot(images);

  if (!currentImage) {
    return [...sorted].reverse();
  }

  const currentMinute = normalizeSlotMinute(currentImage);
  const beforeOrCurrent = sorted.filter((image) => normalizeSlotMinute(image) <= currentMinute).reverse();
  const after = sorted.filter((image) => normalizeSlotMinute(image) > currentMinute).reverse();

  return [...beforeOrCurrent, ...after];
}

export default function App() {
  const [config, setConfig] = useState(null);
  const [catalogImages, setCatalogImages] = useState([]);
  const [images, setImages] = useState([]);
  const [displayedImage, setDisplayedImage] = useState(null);
  const [live, setLive] = useState(true);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [refreshIntervalMinutes, setRefreshIntervalMinutes] = useState(() =>
    Number.parseInt(localStorage.getItem('refreshIntervalMinutes') || '5', 10)
  );
  const [sourceOpen, setSourceOpen] = useState(() => localStorage.getItem('overlayEnabled') === 'true');
  const [aboutOpen, setAboutOpen] = useState(false);
  const [localVoteVersion, setLocalVoteVersion] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenAvailable, setFullscreenAvailable] = useState(false);
  const stageRef = useRef(null);
  const catalogRef = useRef([]);
  const lastTransitionAtRef = useRef(0);
  const stateRef = useRef({});
  const dragRef = useRef({
    pointerId: null,
    startX: 0,
    startY: 0,
    active: false
  });

  catalogRef.current = catalogImages;
  stateRef.current = {
    catalogImages,
    images,
    displayedImage,
    live,
    historyIndex,
    refreshIntervalMinutes
  };

  function logWarning(message) {
    console.warn(message);
  }

  function logInfo(message, details) {
    if (details === undefined) {
      console.info(`${LOG_PREFIX} ${message}`);
      return;
    }

    console.info(`${LOG_PREFIX} ${message}`, details);
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

  function refreshStaticClock(options = {}) {
    const catalog = catalogRef.current;

    if (!catalog.length) {
      return null;
    }

    const snapshot = stateRef.current;
    const currentImage = findCurrentImage(catalog, config);
    const nextImages = buildCycleHistory(catalog, currentImage);
    const displayedIndex = snapshot.displayedImage
      ? nextImages.findIndex((image) => image.id === snapshot.displayedImage.id)
      : -1;

    setImages(nextImages);

    if (snapshot.displayedImage && displayedIndex >= 0 && displayedIndex !== snapshot.historyIndex) {
      setHistoryIndex(displayedIndex);
    } else if (snapshot.historyIndex > nextImages.length - 1) {
      setHistoryIndex(0);
    }

    if (!snapshot.displayedImage && currentImage) {
      setHistoryIndex(0);
      transitionTo(currentImage, { force: true });
      return currentImage;
    }

    const enoughTimePassed =
      options.force || Date.now() - lastTransitionAtRef.current >= snapshot.refreshIntervalMinutes * 60 * 1000;

    if (snapshot.live && currentImage && enoughTimePassed && currentImage.id !== snapshot.displayedImage?.id) {
      setHistoryIndex(0);
      transitionTo(currentImage);
    }

    return currentImage;
  }

  function stepHistory(direction) {
    const snapshot = stateRef.current;

    if (snapshot.images.length === 0) {
      return false;
    }

    const currentIndex = getHistoryIndex(snapshot);

    if (direction < 0) {
      if (currentIndex >= snapshot.images.length - 1) {
        return false;
      }

      const nextIndex = currentIndex + 1;

      setLive(false);
      setHistoryIndex(nextIndex);
      transitionTo(snapshot.images[nextIndex], { force: true });
      return true;
    }

    if (currentIndex <= 0) {
      return false;
    }

    const nextIndex = currentIndex - 1;

    setHistoryIndex(nextIndex);
    setLive(nextIndex === 0);

    transitionTo(snapshot.images[nextIndex], { force: true });
    return true;
  }

  function selectImageAtIndex(index) {
    const snapshot = stateRef.current;
    const nextImage = snapshot.images[index];

    if (!nextImage) {
      return;
    }

    setHistoryIndex(index);
    setLive(index === 0);
    transitionTo(nextImage, { force: true });
  }

  function sendFeedback(vote) {
    const record = stateRef.current.displayedImage;

    if (!record) {
      return;
    }

    const previousVote = getLocalVote(record.id);
    const nextVote = previousVote === vote ? null : vote;
    setLocalVote(record.id, nextVote);
    setLocalVoteVersion((version) => version + 1);
  }

  function handleRefreshIntervalChange(nextMinutes) {
    const clamped = normalizeRefreshInterval(nextMinutes, config?.refreshInterval);
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

  async function handleFullscreenToggle() {
    const stage = stageRef.current;

    if (!stage || !canRequestFullscreen(stage)) {
      return;
    }

    try {
      if (getFullscreenElement()) {
        await exitFullscreen();
        return;
      }

      await requestFullscreen(stage);
    } catch (error) {
      logWarning(`Fullscreen request failed: ${error.message}`);
    }
  }

  function resetDrag() {
    dragRef.current = {
      pointerId: null,
      startX: 0,
      startY: 0,
      active: false
    };
    setIsDragging(false);
  }

  function handleStagePointerDown(event) {
    if (!event.isPrimary || isInteractiveElement(event.target)) {
      return;
    }

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      active: false
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handleStagePointerMove(event) {
    const drag = dragRef.current;

    if (drag.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;

    if (!drag.active) {
      if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > DRAG_VERTICAL_CANCEL_PX) {
        resetDrag();
        return;
      }

      if (Math.abs(deltaX) < DRAG_DEAD_ZONE_PX) {
        return;
      }

      drag.active = true;
      setIsDragging(true);
    }

    event.preventDefault();

    if (Math.abs(deltaX) >= DRAG_STEP_PX) {
      stepHistory(deltaX < 0 ? -1 : 1);
      drag.startX = event.clientX;
      drag.startY = event.clientY;
    }
  }

  function handleStagePointerUp(event) {
    const drag = dragRef.current;

    if (drag.pointerId !== event.pointerId) {
      return;
    }

    event.currentTarget.releasePointerCapture?.(event.pointerId);
    resetDrag();
  }

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        logInfo('app booting from static catalog');
        const catalog = await loadStaticCatalog();

        if (cancelled) {
          return;
        }

        const interval = catalog.refreshInterval || { min: 5, max: 60, step: 5, default: 5 };
        const clamped = normalizeRefreshInterval(refreshIntervalMinutes, interval);
        const nextConfig = {
          timezone: import.meta.env.VITE_CLOCK_TIMEZONE || catalog.timezone || '',
          clockFormat: catalog.clockFormat || '12h',
          imageSize: 1024,
          refreshInterval: interval,
          coverage: catalog.coverage,
          staticMode: true
        };
        const nextCatalogImages = sortBySlot(catalog.images || []);
        const currentImage = findCurrentImage(nextCatalogImages, nextConfig);
        const nextImages = buildCycleHistory(nextCatalogImages, currentImage);

        catalogRef.current = nextCatalogImages;
        setCatalogImages(nextCatalogImages);
        setImages(nextImages);
        setConfig(nextConfig);
        setRefreshIntervalMinutes(clamped);
        setLoadError('');
        setHistoryIndex(0);
        localStorage.setItem('refreshIntervalMinutes', String(clamped));

        if (currentImage) {
          transitionTo(currentImage, { force: true });
        }

        logInfo(`static catalog ready with ${nextCatalogImages.length} clock slots`, {
          currentSlot: currentImage?.displaySlotKey ?? null,
          maxInterval: catalog.coverage?.maxMinutesBetweenCoveredSlots ?? null
        });
      } catch (error) {
        setLoadError(error.message);
        logWarning(`Could not load the static catalog: ${error.message}`);
      }
    }

    void init();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!catalogImages.length) {
      return undefined;
    }

    const clockId = window.setInterval(() => {
      refreshStaticClock();
    }, CLOCK_TICK_MS);

    return () => {
      window.clearInterval(clockId);
    };
  }, [catalogImages.length, config, refreshIntervalMinutes]);

  useEffect(() => {
    const stage = stageRef.current;

    setFullscreenAvailable(canRequestFullscreen(stage) && Boolean(document.fullscreenEnabled ?? true));

    function handleFullscreenChange() {
      setIsFullscreen(getFullscreenElement() === stage);
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
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
      } else if (event.key.toLowerCase() === 'f') {
        event.preventDefault();
        void handleFullscreenToggle();
      } else if (event.key === 'Escape') {
        setAboutOpen(false);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const selectedIndex = getHistoryIndex({ displayedImage, images, live, historyIndex });
  const localVote = getLocalVote(displayedImage?.id) || null;

  return (
    <main className="stage" ref={stageRef}>
      <div
        className={`stage__frame ${sourceOpen ? 'is-overlay-active' : ''} ${isDragging ? 'is-dragging' : ''}`}
        onPointerCancel={resetDrag}
        onPointerDown={handleStagePointerDown}
        onPointerLeave={handleStagePointerUp}
        onPointerMove={handleStagePointerMove}
        onPointerUp={handleStagePointerUp}
      >
        <ClockImage image={displayedImage} />
        {!displayedImage && (
          <p className="stage__message">{loadError ? `catalog unavailable: ${loadError}` : 'loading image catalog...'}</p>
        )}
        {fullscreenAvailable && (
          <button
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            aria-pressed={isFullscreen}
            className="fullscreen-toggle"
            onClick={handleFullscreenToggle}
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            type="button"
          >
            <svg
              aria-hidden="true"
              className={`fullscreen-toggle__icon ${isFullscreen ? 'is-hidden' : ''}`}
              viewBox="0 0 24 24"
            >
              <path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5" />
            </svg>
            <svg
              aria-hidden="true"
              className={`fullscreen-toggle__icon ${isFullscreen ? '' : 'is-hidden'}`}
              viewBox="0 0 24 24"
            >
              <path d="M9 3v6H3M15 3v6h6M21 15h-6v6M3 15h6v6" />
            </svg>
          </button>
        )}
        <About
          config={config}
          image={displayedImage}
          images={images}
          isOpen={aboutOpen}
          live={live}
          onClose={() => setAboutOpen(false)}
          onRefreshIntervalChange={handleRefreshIntervalChange}
          onSelectImage={selectImageAtIndex}
          onToggle={() => setAboutOpen((current) => !current)}
          refreshIntervalMinutes={refreshIntervalMinutes}
          selectedIndex={selectedIndex}
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
