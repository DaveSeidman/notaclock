const PUBLIC_BASE = import.meta.env.BASE_URL || '/';
const DEFAULT_CATALOG_PATH = 'clock-media/catalog.json';

function withPublicBase(inputPath) {
  if (!inputPath) {
    return '';
  }

  if (/^(?:https?:|data:|blob:)/i.test(inputPath)) {
    return inputPath;
  }

  const base = PUBLIC_BASE.endsWith('/') ? PUBLIC_BASE : `${PUBLIC_BASE}/`;
  return `${base}${String(inputPath).replace(/^\/+/, '')}`;
}

function getCatalogUrl() {
  return withPublicBase(import.meta.env.VITE_STATIC_CATALOG_URL || DEFAULT_CATALOG_PATH);
}

export async function loadStaticCatalog() {
  const response = await fetch(getCatalogUrl(), {
    cache: 'default'
  });

  if (!response.ok) {
    throw new Error(`Catalog request failed with ${response.status}`);
  }

  const catalog = await response.json();
  const images = Array.isArray(catalog.images)
    ? catalog.images.map((image) => ({
        ...image,
        imageUrl: withPublicBase(image.imageUrl),
        maskUrl: withPublicBase(image.maskUrl)
      }))
    : [];

  return {
    ...catalog,
    images
  };
}
