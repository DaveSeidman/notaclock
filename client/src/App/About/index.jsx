import { useEffect, useRef, useState } from 'react';
import './index.scss';

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
  onClose,
  onToggle,
  onSelectImage,
  refreshIntervalMinutes,
  selectedIndex,
  onRefreshIntervalChange
}) {
  const cardRef = useRef(null);
  const railRef = useRef(null);
  const triggerRef = useRef(null);

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

  const intervalOptions = buildIntervalOptions(config);
  const selectedImage = image || images?.[selectedIndex] || null;
  const displayImages = (images || []).map((entry, index) => ({ entry, index }));

  function handleThumbnailClick(event, index) {
    onSelectImage(index);
    event.currentTarget.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center'
    });
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

        <label className="field" htmlFor="refresh-interval">
          <span>Update Every:</span>
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

        <div className="history-gallery">
          <div className="history-gallery__rail" ref={railRef}>
            {displayImages.map(({ entry, index }) => {
              const isSelected = entry.id === selectedImage?.id;

              return (
                <button
                  aria-pressed={isSelected}
                  className={`history-thumb ${isSelected ? 'is-selected' : ''}`}
                  data-history-index={index}
                  key={entry.id}
                  onClick={(event) => handleThumbnailClick(event, index)}
                  type="button"
                >
                  <HistoryThumbnailImage
                    eager={isSelected || entry.id === images?.[0]?.id}
                    entry={entry}
                    rootRef={railRef}
                  />
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
