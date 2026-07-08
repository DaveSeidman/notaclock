import { useEffect, useRef, useState } from 'react';
import './index.scss';

const DRAG_SUPPRESS_MS = 140;

function formatSlotStatus(record) {
  if (!record) {
    return 'Waiting for image history';
  }

  return record.approved ? 'Approved slot' : 'Open slot';
}

function buildIntervalOptions(config) {
  const interval = config?.refreshInterval || {
    min: 5,
    max: 60,
    step: 5,
    default: 5
  };

  const step = interval.step || 5;
  const optionCount = Math.floor((interval.max - interval.min) / step) + 1;

  return Array.from({ length: optionCount }, (_, index) => interval.min + index * step);
}

function HistoryThumbnailImage({ entry, eager, rootRef }) {
  const imageRef = useRef(null);
  const [shouldLoad, setShouldLoad] = useState(eager);

  useEffect(() => {
    if (eager) {
      setShouldLoad(true);
      return undefined;
    }

    const node = imageRef.current;

    if (!node) {
      return undefined;
    }

    if (!('IntersectionObserver' in window)) {
      setShouldLoad(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([item]) => {
        if (item.isIntersecting) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      {
        root: rootRef.current,
        rootMargin: '180px 260px'
      }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [eager, entry.id, rootRef]);

  return (
    <img
      alt={`${entry.displayDate} ${entry.displayTime}`}
      className="history-thumb__image"
      decoding="async"
      draggable={false}
      fetchPriority={eager ? 'high' : 'auto'}
      loading={eager ? 'eager' : 'lazy'}
      ref={imageRef}
      src={shouldLoad ? entry.imageUrl : undefined}
    />
  );
}

export default function About({
  config,
  image,
  images,
  isOpen,
  live,
  onClose,
  onToggle,
  onSelectImage,
  refreshIntervalMinutes,
  selectedIndex,
  onRefreshIntervalChange
}) {
  const cardRef = useRef(null);
  const railRef = useRef(null);
  const thumbnailRefs = useRef(new Map());
  const triggerRef = useRef(null);
  const [railDragging, setRailDragging] = useState(false);
  const dragRef = useRef({
    pointerId: null,
    startX: 0,
    scrollLeft: 0,
    dragged: false,
    pressedIndex: null
  });
  const suppressClickUntilRef = useRef(0);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handlePointerDown(event) {
      if (cardRef.current?.contains(event.target) || triggerRef.current === event.target) {
        return;
      }

      onClose();
    }

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const thumbnail = thumbnailRefs.current.get(image?.id);

    if (!thumbnail) {
      return;
    }

    thumbnail.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center'
    });
  }, [image?.id, isOpen]);

  const intervalOptions = buildIntervalOptions(config);
  const selectedImage = image || images?.[selectedIndex] || null;
  const displayImages = isOpen ? (images || []).map((entry, index) => ({ entry, index })) : [];
  const latestImage = images?.[0] || null;
  const statusText = !selectedImage
    ? 'Waiting for image history'
    : selectedImage.id === latestImage?.id
      ? 'Current local slot'
      : live
        ? 'Waiting for cadence'
        : 'Browsing cycle';

  function handleRailPointerDown(event) {
    if (!event.isPrimary || !railRef.current) {
      return;
    }

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      scrollLeft: railRef.current.scrollLeft,
      dragged: false,
      pressedIndex: Number.parseInt(event.target?.closest?.('[data-history-index]')?.dataset?.historyIndex || '', 10)
    };

    railRef.current.setPointerCapture?.(event.pointerId);
    setRailDragging(true);
  }

  function handleRailPointerMove(event) {
    const drag = dragRef.current;

    if (drag.pointerId !== event.pointerId || !railRef.current) {
      return;
    }

    const deltaX = event.clientX - drag.startX;

    if (!drag.dragged && Math.abs(deltaX) > 6) {
      drag.dragged = true;
    }

    if (!drag.dragged) {
      return;
    }

    event.preventDefault();
    railRef.current.scrollLeft = drag.scrollLeft - deltaX;
  }

  function handleRailPointerUp(event) {
    const drag = dragRef.current;

    if (drag.pointerId !== event.pointerId || !railRef.current) {
      return;
    }

    railRef.current.releasePointerCapture?.(event.pointerId);

    if (drag.dragged) {
      suppressClickUntilRef.current = Date.now() + DRAG_SUPPRESS_MS;
    } else if (Number.isInteger(drag.pressedIndex)) {
      event.preventDefault();
      onSelectImage(drag.pressedIndex);
    }

    dragRef.current = {
      pointerId: null,
      startX: 0,
      scrollLeft: 0,
      dragged: false,
      pressedIndex: null
    };
    setRailDragging(false);
  }

  function handleThumbnailSelect(index) {
    if (Date.now() < suppressClickUntilRef.current) {
      return;
    }

    onSelectImage(index);
  }

  return (
    <>
      <div className="stage__brand">
        <button
          aria-controls="info-card"
          aria-expanded={isOpen}
          className="stage__label"
          onClick={onToggle}
          ref={triggerRef}
          type="button"
        >
          Not A Clock
        </button>
      </div>

      <aside
        aria-hidden={!isOpen}
        className={`info-card ${isOpen ? 'is-open' : ''}`}
        id="info-card"
        ref={cardRef}
      >
        <div className="info-card__header">
          <button className="info-card__close" onClick={onClose} type="button" aria-label="Close details">
            Close
          </button>
        </div>

        <p className="info-card__label">Current prompt</p>
        <p className="info-card__prompt">
          {selectedImage?.prompt || 'No prompt recorded for this frame yet.'}
        </p>

        <label className="field" htmlFor="refresh-interval">
          <span>Viewer cadence</span>
          <select
            id="refresh-interval"
            onChange={(event) => onRefreshIntervalChange(Number.parseInt(event.target.value, 10))}
            value={refreshIntervalMinutes}
          >
            {intervalOptions.map((minute) => (
              <option key={minute} value={minute}>
                {minute} minute{minute === 1 ? '' : 's'}
              </option>
            ))}
          </select>
        </label>

        <p className="meta">
          {image ? `${image.displayDate} • ${image.displayTime}` : 'Waiting for the first render...'}
        </p>

        <div className="history-gallery">
          <div className="history-gallery__header">
            <p className="history-gallery__status">
              {selectedImage ? `${statusText} • ${formatSlotStatus(selectedImage)}` : statusText}
            </p>
          </div>

          <div
            className={`history-gallery__rail ${railDragging ? 'is-dragging' : ''}`}
            onPointerCancel={handleRailPointerUp}
            onPointerDown={handleRailPointerDown}
            onPointerMove={handleRailPointerMove}
            onPointerUp={handleRailPointerUp}
            ref={railRef}
          >
            {displayImages.map(({ entry, index }) => {
              const isSelected = entry.id === selectedImage?.id;

              return (
                <button
                  aria-pressed={isSelected}
                  className={`history-thumb ${isSelected ? 'is-selected' : ''}`}
                  data-history-index={index}
                  key={entry.id}
                  onClick={(event) => {
                    if (event.detail === 0) {
                      handleThumbnailSelect(index);
                    }
                  }}
                  ref={(node) => {
                    if (node) {
                      thumbnailRefs.current.set(entry.id, node);
                    } else {
                      thumbnailRefs.current.delete(entry.id);
                    }
                  }}
                  type="button"
                >
                  <HistoryThumbnailImage
                    eager={isSelected || entry.id === images?.[0]?.id}
                    entry={entry}
                    rootRef={railRef}
                  />
                  <span className="history-thumb__time">{entry.displayTime}</span>
                  {entry.id === images?.[0]?.id && <span className="history-thumb__badge">Now</span>}
                </button>
              );
            })}
          </div>

          {selectedImage && (
            <div className="history-gallery__footer">
              <p className="history-gallery__meta">
                {selectedImage.displayDate} • {selectedImage.displayTime}
              </p>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
