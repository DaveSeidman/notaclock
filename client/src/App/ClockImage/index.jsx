import { useEffect, useState } from 'react';
import './index.scss';

const EMPTY_SLOT = {
  id: '',
  imageUrl: '',
  maskUrl: '',
  alt: ''
};

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

export default function ClockImage({ image }) {
  const [renderState, setRenderState] = useState({
    activeSlot: 0,
    slots: [EMPTY_SLOT, EMPTY_SLOT]
  });

  useEffect(() => {
    if (!image?.imageUrl) {
      return;
    }

    let cancelled = false;

    async function loadNextImage() {
      await Promise.all([preloadImage(image.imageUrl), preloadImage(image.maskUrl)]);

      if (cancelled) {
        return;
      }

      setRenderState((current) => {
        if (current.slots[current.activeSlot]?.id === image.id) {
          return current;
        }

        const nextSlot = current.activeSlot === 0 ? 1 : 0;
        const slots = [...current.slots];
        slots[nextSlot] = {
          id: image.id,
          imageUrl: image.imageUrl,
          maskUrl: image.maskUrl || '',
          alt: `${image.displayDate} ${image.displayTime}`
        };

        return {
          activeSlot: nextSlot,
          slots
        };
      });
    }

    void loadNextImage();

    return () => {
      cancelled = true;
    };
  }, [image?.id, image?.imageUrl, image?.maskUrl, image?.displayDate, image?.displayTime]);

  return (
    <>
      {renderState.slots.map((slot, index) => (
        <img
          alt={slot.alt}
          className={`stage__image ${index === renderState.activeSlot ? 'is-visible' : ''}`}
          key={`image-${index}`}
          src={slot.imageUrl || undefined}
        />
      ))}
      {renderState.slots.map((slot, index) => (
        <img
          alt=""
          className={`stage__overlay ${index === renderState.activeSlot ? 'is-visible' : ''}`}
          key={`overlay-${index}`}
          src={slot.maskUrl || undefined}
        />
      ))}
      <div className="stage__wash" />
    </>
  );
}
