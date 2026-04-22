import { createSeedFromString, mulberry32, pick } from './utils.js';

const COLLECTIONS = [
  {
    key: 'landscape',
    weight: 16,
    subjects: [
      'sunlit coastal painting',
      'misty mountain overlook',
      'quiet forest path after rain',
      'weathered harbor at blue hour',
      'desert cliffs under gentle dawn light',
      'wildflower meadow with depth and atmosphere'
    ],
    styles: [
      'gallery-quality oil painting',
      'soft watercolor illustration',
      'dreamy cinematic photograph',
      'textured gouache artwork'
    ],
    moods: ['calm and contemplative', 'airy and refined', 'quietly nostalgic']
  },
  {
    key: 'interior',
    weight: 12,
    subjects: [
      'warm reading nook near a tall window',
      'sunlit dining room with sculptural chairs',
      'kitchen corner with fruit, glass, and morning light',
      'hotel lobby vignette with lush plants',
      'bedroom with rumpled linen and a single lamp'
    ],
    styles: [
      'editorial interior photograph',
      'fine art print with painterly finish',
      'muted acrylic painting',
      'soft film still aesthetic'
    ],
    moods: ['minimal and elegant', 'moody but welcoming', 'richly textured and serene']
  },
  {
    key: 'still-life',
    weight: 12,
    subjects: [
      'still life with ceramic vessels and linen',
      'citrus and glass arranged on a marble ledge',
      'flowers collapsing in a striped pitcher',
      'bowls, pears, and folded cloth on a wooden table',
      'shells and silver objects under studio light'
    ],
    styles: [
      'classical oil painting',
      'pastel chalk composition',
      'modern still-life photograph',
      'textured gouache artwork'
    ],
    moods: ['balanced and refined', 'quietly nostalgic', 'museum-grade restraint']
  },
  {
    key: 'portrait',
    weight: 14,
    subjects: [
      'editorial portrait of a woman in a patterned coat',
      'older man reading beside a rain-streaked window',
      'young dancer adjusting shoes backstage',
      'two friends in a diner booth',
      'swimmers resting near a tiled pool',
      'child on a bicycle under late afternoon light'
    ],
    styles: [
      'fashion photograph with painterly softness',
      'oil portrait on canvas',
      'vintage film photograph',
      'mixed-media portrait study'
    ],
    moods: ['cinematic and human', 'intimate and observant', 'stylish but understated']
  },
  {
    key: 'street',
    weight: 10,
    subjects: [
      'crowded crosswalk after rainfall',
      'couple walking past a neon storefront',
      'summer basketball court at dusk',
      'market scene with umbrellas and motion blur',
      'train platform with commuters in bold coats'
    ],
    styles: [
      'documentary street photograph',
      'cinematic 35mm still',
      'painterly urban scene',
      'graphic color photograph'
    ],
    moods: ['alive and observational', 'stylish urban energy', 'fleeting and atmospheric']
  },
  {
    key: 'pop-art',
    weight: 11,
    subjects: [
      'graphic portrait with oversized sunglasses',
      'bananas, flowers, and sneakers arranged as an icon study',
      'roller skater in bold side profile',
      'cat lounging beside a checkerboard vase',
      'group of friends cropped into bold silhouette blocks',
      'textless comic panel of a surprised swimmer',
      'giant cherries and chrome sunglasses on striped fabric',
      'bold hand holding a melting ice cream cone'
    ],
    styles: [
      'bold pop-art silkscreen aesthetic',
      'halftone comic-inspired painting',
      'cut-paper collage with saturated color fields',
      'graphic printmaking style',
      'textless vintage advertising art',
      'risograph poster style with no typography'
    ],
    moods: ['playful and punchy', 'bold and collectible', 'high-contrast and iconic']
  },
  {
    key: 'abstract',
    weight: 11,
    subjects: [
      'abstract landscape with layered brushwork',
      'geometric abstraction with curved color blocks',
      'gestural paint study with thick texture',
      'paper collage forms drifting in space',
      'minimal composition of stripes and organic shapes'
    ],
    styles: [
      'museum-scale abstract painting',
      'textured mixed-media work',
      'soft chalk abstraction',
      'modernist color-field study'
    ],
    moods: ['meditative and bold', 'graphic and refined', 'subtle visual tension']
  },
  {
    key: 'surreal',
    weight: 8,
    subjects: [
      'impossible room with a small indoor ocean',
      'floating stone staircase above a quiet garden',
      'oversized moon resting behind a dinner table',
      'pear-shaped doorway opening onto a painted sky',
      'library with clouds drifting between the shelves',
      'swimmer suspended above a tiled courtyard'
    ],
    styles: [
      'contemporary surrealist painting',
      'dreamlike editorial photograph',
      'magical realism oil painting',
      'soft cinematic matte painting'
    ],
    moods: ['strange but elegant', 'quietly uncanny', 'poetic and collectible']
  },
  {
    key: 'sci-fi',
    weight: 8,
    subjects: [
      'retrofuturist apartment overlooking an orbital garden',
      'desert research outpost under a glass dome',
      'astronaut greenhouse filled with sculptural plants',
      'quiet spaceport lounge with curved furniture',
      'alien coastline with tiny human figures',
      'sleek observation deck above a ringed planet'
    ],
    styles: [
      '1970s sci-fi paperback cover art without text',
      'retrofuturist airbrush illustration',
      'cinematic sci-fi concept painting',
      'gallery-grade speculative landscape'
    ],
    moods: ['wonder-filled and atmospheric', 'sleek but warm', 'cosmic and contemplative']
  },
  {
    key: 'botanical',
    weight: 9,
    subjects: [
      'oversized botanical study of tropical leaves',
      'glasshouse plants casting shadows on tiled floor',
      'cactus garden with ceramic sculptures',
      'orchids and cut stems arranged on linen',
      'fern collection in a quiet conservatory'
    ],
    styles: [
      'botanical fine art print',
      'painted natural history plate without labels',
      'lush editorial garden photograph',
      'delicate watercolor study'
    ],
    moods: ['fresh and composed', 'organic and refined', 'quietly lush']
  },
  {
    key: 'architecture',
    weight: 8,
    subjects: [
      'brutalist courtyard with long afternoon shadows',
      'modernist beach house above dark water',
      'art deco cinema lobby with velvet seating',
      'spiral staircase in a sunlit museum',
      'sunken conversation pit with sculptural lamps',
      'quiet concrete chapel with colored glass'
    ],
    styles: [
      'architectural digest editorial photograph',
      'modernist architectural painting',
      'cinematic production design still',
      'clean graphic architectural illustration'
    ],
    moods: ['designed and atmospheric', 'elegant with strong geometry', 'quietly monumental']
  },
  {
    key: 'poster',
    weight: 7,
    subjects: [
      'textless vintage travel poster of a mountain lake',
      'minimal exhibition poster made from color blocks only',
      'textless jazz club poster with musicians in silhouette',
      'beach umbrella pattern in a bold poster composition',
      'textless film poster for an imaginary summer mystery'
    ],
    styles: [
      'screenprinted poster art without typography',
      'mid-century graphic illustration',
      'risograph art print',
      'bold Bauhaus-inspired composition'
    ],
    moods: ['graphic and charming', 'collectible and crisp', 'stylized with playful restraint']
  },
  {
    key: 'textile',
    weight: 6,
    subjects: [
      'woven tapestry pattern with birds and flowers',
      'quilt-like landscape made from irregular color fields',
      'ceramic tile mural of swimmers and plants',
      'embroidered folk-art garden scene',
      'patterned rug study with animals hidden in the border'
    ],
    styles: [
      'contemporary textile artwork',
      'folk-art inspired painting',
      'handmade ceramic mural aesthetic',
      'soft woven wall hanging texture'
    ],
    moods: ['handmade and warm', 'playful but refined', 'tactile and home-like']
  }
];

const LIGHTING = [
  'golden hour illumination',
  'soft north-light shadows',
  'muted twilight glow',
  'overcast diffused light',
  'gentle morning haze',
  'candlelit warmth'
];

const DETAILS = [
  'subtle visual rhythm',
  'balanced composition',
  'delicate surface texture',
  'museum-style framing energy',
  'tasteful negative space',
  'convincing brushstroke variation'
];

const PALETTES = [
  'warm earth tones',
  'dusty pastel palette',
  'deep jewel tones',
  'sun-faded summer color',
  'graphic black, cream, and red',
  'muted mineral palette',
  'electric pop colors'
];

const COMPOSITIONS = [
  'carefully cropped composition',
  'strong central focal point',
  'asymmetrical gallery composition',
  'layered foreground and background depth',
  'negative space that feels intentional'
];

function pickWeighted(items, rng) {
  const totalWeight = items.reduce((sum, item) => sum + (item.weight || 1), 0);
  let target = rng() * totalWeight;

  for (const item of items) {
    target -= item.weight || 1;

    if (target <= 0) {
      return item;
    }
  }

  return items[items.length - 1];
}

export class PromptGenerator {
  constructor(config) {
    this.config = config;
  }

  generate(_date, minuteKey) {
    const seed = createSeedFromString(`${minuteKey}:${this.config.clockTimezone}`);
    const rng = mulberry32(seed);

    if (this.config.promptPresets.length > 0) {
      return {
        prompt: pick(this.config.promptPresets, rng),
        negativePrompt: this.config.negativePrompt
      };
    }

    const collection = pickWeighted(COLLECTIONS, rng);
    const subject = pick(collection.subjects, rng);
    const style = pick(collection.styles, rng);
    const lighting = pick(LIGHTING, rng);
    const mood = pick(collection.moods, rng);
    const detail = pick(DETAILS, rng);
    const palette = pick(PALETTES, rng);
    const composition = pick(COMPOSITIONS, rng);

    const prompt = [
      subject,
      style,
      lighting,
      mood,
      palette,
      composition,
      detail,
      'high detail',
      'wall art',
      'tasteful image suitable for display in a home',
      'no visible text'
    ].join(', ');

    return {
      prompt,
      negativePrompt: this.config.negativePrompt
    };
  }
}
