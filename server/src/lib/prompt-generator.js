import { createSeedFromString, mulberry32, pick } from './utils.js';

const COLLECTIONS = [
  {
    key: 'landscape',
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
    subjects: [
      'graphic portrait with oversized sunglasses',
      'bananas, flowers, and sneakers arranged as an icon study',
      'roller skater in bold side profile',
      'cat lounging beside a checkerboard vase',
      'group of friends cropped into bold silhouette blocks'
    ],
    styles: [
      'bold pop-art silkscreen aesthetic',
      'halftone comic-inspired painting',
      'cut-paper collage with saturated color fields',
      'graphic printmaking style'
    ],
    moods: ['playful and punchy', 'bold and collectible', 'high-contrast and iconic']
  },
  {
    key: 'abstract',
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

const DAYPART_SUBJECTS = {
  dawn: ['fog drifting through trees', 'sleepy waterfront rooftops', 'pale blush sky over hills'],
  day: ['bright citrus still life', 'open sea under crisp daylight', 'sun-washed Mediterranean alley'],
  dusk: ['lamplight through curtains', 'violet sky above rooftops', 'embers of sunset over water'],
  night: ['moonlit garden painting', 'quiet street after rainfall', 'deep indigo horizon with soft lights']
};

function getDaypart(date, timeZone) {
  const hour = Number.parseInt(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      hour12: false
    }).format(date),
    10
  );

  if (hour >= 5 && hour < 9) {
    return 'dawn';
  }

  if (hour >= 9 && hour < 17) {
    return 'day';
  }

  if (hour >= 17 && hour < 21) {
    return 'dusk';
  }

  return 'night';
}

export class PromptGenerator {
  constructor(config) {
    this.config = config;
  }

  generate(date, minuteKey) {
    const seed = createSeedFromString(`${minuteKey}:${this.config.clockTimezone}`);
    const rng = mulberry32(seed);

    if (this.config.promptPresets.length > 0) {
      return {
        prompt: pick(this.config.promptPresets, rng),
        negativePrompt: this.config.negativePrompt
      };
    }

    const daypart = getDaypart(date, this.config.clockTimezone);
    const collection = pick(
      [
        COLLECTIONS[0],
        COLLECTIONS[0],
        COLLECTIONS[1],
        COLLECTIONS[2],
        COLLECTIONS[3],
        COLLECTIONS[3],
        COLLECTIONS[4],
        COLLECTIONS[5],
        COLLECTIONS[6]
      ],
      rng
    );

    const subject =
      collection.key === 'landscape' && rng() > 0.72 ? pick(DAYPART_SUBJECTS[daypart], rng) : pick(collection.subjects, rng);
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
