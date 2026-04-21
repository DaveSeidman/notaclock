import { useEffect, useRef } from 'react';
import './index.scss';

function buildIntervalOptions(config) {
  const interval = config?.refreshInterval || {
    min: 1,
    max: 30,
    default: 1
  };

  return Array.from({ length: interval.max - interval.min + 1 }, (_, index) => interval.min + index);
}

export default function About({
  config,
  image,
  isOpen,
  onClose,
  onToggle,
  refreshIntervalMinutes,
  historyText,
  onRefreshIntervalChange
}) {
  const cardRef = useRef(null);
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

        <p className="info-card__body">
          A quiet clock disguised as a picture. Somewhere inside the image, the hour and minute are folded into the
          composition. Squint a little; the numbers are there, but they prefer not to announce themselves.
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
        <p className="meta">{historyText}</p>
      </aside>
    </>
  );
}
