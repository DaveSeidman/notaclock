import { useEffect, useRef } from 'react';
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
          A quiet clock disguised as a picture. Images generated at random every few minutes. Load fullscreen on a passive display and enjoy. Coded by <a href="https://daveseidman.com" target="_blank">Dave Seidman</a>
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
