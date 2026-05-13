import { useEffect, useMemo, useState } from 'react';
import './index.scss';

const ADMIN_PASSWORD_KEY = 'notaclockAdminPassword';

function getTimeSlotLabel(image) {
  if (image?.displayTime) {
    return image.displayTime;
  }

  const match = String(image?.timeSlotKey || image?.minuteKey || '').match(/(\d{2})(\d{2})$/);
  return match ? `${match[1]}:${match[2]}` : 'unknown';
}

function getTimeSlotKey(image) {
  const match = String(image?.timeSlotKey || image?.minuteKey || '').match(/(\d{4})$/);
  return match ? match[1] : '';
}

function normalizeSearch(input) {
  return input.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export default function Admin({ apiBase, config, images: liveImages, onImageUpdated, onRefreshHistory }) {
  const [password, setPassword] = useState(() => localStorage.getItem(ADMIN_PASSWORD_KEY) || '');
  const [images, setImages] = useState([]);
  const [status, setStatus] = useState('Loading images...');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState('');

  async function request(path, options = {}) {
    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers: {
        'content-type': 'application/json',
        'x-admin-password': password,
        ...(options.headers || {})
      }
    });

    if (!response.ok) {
      throw new Error(response.status === 401 ? 'Password rejected.' : `Request failed with ${response.status}`);
    }

    return response.json();
  }

  async function loadImages() {
    try {
      setStatus('Loading images...');
      const payload = await request('/api/admin/images?limit=1440');
      setImages(payload.images || []);
      setStatus(`${payload.protectedCount || 0} keepers locked, ${payload.total || 0} images loaded`);
      localStorage.setItem(ADMIN_PASSWORD_KEY, password);
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function toggleProtection(image) {
    const nextProtected = !image.protected;
    setBusyId(image.id);

    try {
      const payload = await request(`/api/admin/images/${encodeURIComponent(image.id)}/protection`, {
        method: 'POST',
        body: JSON.stringify({ protected: nextProtected })
      });
      const updatedImage = payload.image;
      setImages((currentImages) => currentImages.map((entry) => (entry.id === updatedImage.id ? updatedImage : entry)));
      onImageUpdated(updatedImage);
      setStatus(`${getTimeSlotLabel(updatedImage)} ${updatedImage.protected ? 'locked' : 'released'}`);
      void onRefreshHistory().catch(() => {});
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusyId('');
    }
  }

  useEffect(() => {
    void loadImages();
  }, []);

  const visibleImages = useMemo(() => {
    const searchKey = normalizeSearch(search);
    return images.filter((image) => {
      if (filter === 'keepers' && !image.protected) {
        return false;
      }

      if (filter === 'open' && image.protected) {
        return false;
      }

      if (!searchKey) {
        return true;
      }

      return normalizeSearch(`${image.displayTime} ${image.displayDate} ${image.minuteKey} ${image.prompt}`).includes(searchKey);
    });
  }, [filter, images, search]);

  const liveIds = new Set((liveImages || []).map((image) => image.id));

  return (
    <main className="admin-view">
      <header className="admin-header">
        <div>
          <p className="admin-kicker">Not A Clock</p>
          <h1>Keeper Admin</h1>
        </div>
        <a className="admin-link" href="/">
          View clock
        </a>
      </header>

      <section className="admin-toolbar">
        {config?.adminRequiresPassword && (
          <label className="admin-field">
            <span>Password</span>
            <input
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="ADMIN_PASSWORD"
              type="password"
              value={password}
            />
          </label>
        )}
        <label className="admin-field">
          <span>Search</span>
          <input onChange={(event) => setSearch(event.target.value)} placeholder="3:28, May 13, prompt..." value={search} />
        </label>
        <div className="admin-segments" role="group" aria-label="Filter images">
          <button className={filter === 'all' ? 'is-active' : ''} onClick={() => setFilter('all')} type="button">
            All
          </button>
          <button className={filter === 'keepers' ? 'is-active' : ''} onClick={() => setFilter('keepers')} type="button">
            Keepers
          </button>
          <button className={filter === 'open' ? 'is-active' : ''} onClick={() => setFilter('open')} type="button">
            Open
          </button>
        </div>
        <button className="admin-refresh" onClick={loadImages} type="button">
          Refresh
        </button>
      </section>

      <p className="admin-status">{status}</p>

      <section className="admin-grid" aria-label="Generated images">
        {visibleImages.map((image) => (
          <article className={`admin-card ${image.protected ? 'is-protected' : ''}`} key={image.id}>
            <img alt={`${image.displayDate} ${image.displayTime}`} loading="lazy" src={image.imageUrl} />
            <div className="admin-card__body">
              <div>
                <p className="admin-card__time">{getTimeSlotLabel(image)}</p>
                <p className="admin-card__date">
                  {image.displayDate} - slot {getTimeSlotKey(image)}
                  {liveIds.has(image.id) ? ' - in history' : ''}
                </p>
              </div>
              <button disabled={busyId === image.id} onClick={() => toggleProtection(image)} type="button">
                {image.protected ? 'Release' : 'Keep'}
              </button>
            </div>
            <p className="admin-card__prompt">{image.prompt}</p>
            {image.reusedFromMinuteKey && <p className="admin-card__reuse">Reused from {image.reusedFromMinuteKey}</p>}
          </article>
        ))}
      </section>
    </main>
  );
}
