import './index.scss';

export default function Info({ image, isOpen, localVote, onToggle, onFeedback }) {
  const feedback = image?.feedback || { up: 0, down: 0 };
  const title = isOpen ? 'Hide source control image' : 'Show source control image';

  return (
    <>
      <button
        aria-label={title}
        aria-pressed={isOpen}
        className={`overlay-toggle ${isOpen ? 'is-active' : ''}`}
        onClick={onToggle}
        title={title}
        type="button"
      >
        <svg className="eye-icon eye-icon--open" viewBox="0 0 48 48" aria-hidden="true">
          <path d="M5 24s7-11 19-11 19 11 19 11-7 11-19 11S5 24 5 24Z" />
          <circle cx="24" cy="24" r="5.5" />
        </svg>
        <svg className="eye-icon eye-icon--closed" viewBox="0 0 48 48" aria-hidden="true">
          <path d="M7 31c4.7-5.2 10.4-7.8 17-7.8S36.3 25.8 41 31" />
          <path d="M14 35l-3 4M24 36v5M34 35l3 4" />
        </svg>
      </button>

      <aside className="source-card" hidden={!isOpen || !image}>
        <p className="source-card__label">Current prompt</p>
        <p className="source-card__prompt">{image?.prompt || 'No prompt recorded for this frame.'}</p>
        <div className="feedback" aria-label="Rate this image">
          <button
            aria-label="Thumbs up"
            aria-pressed={localVote === 'up'}
            className={`feedback__button ${localVote === 'up' ? 'is-active' : ''}`}
            onClick={() => onFeedback('up')}
            type="button"
          >
            👍
          </button>
          <button
            aria-label="Thumbs down"
            aria-pressed={localVote === 'down'}
            className={`feedback__button ${localVote === 'down' ? 'is-active' : ''}`}
            onClick={() => onFeedback('down')}
            type="button"
          >
            👎
          </button>
        </div>
        <p className="source-card__meta">
          {feedback.up || 0} up • {feedback.down || 0} down
        </p>
      </aside>
    </>
  );
}
