// Suggest a drink pairing for a movie based on its genres.
//
// How it works:
//   1. We build a "vibe profile" by collecting descriptors from each of
//      the movie's genres. A descriptor mentioned by multiple genres
//      weighs more than one mentioned by a single genre.
//   2. Every drink in the library has its own descriptor set. We score
//      each drink by summing the genre weights of the descriptors it
//      shares with the movie's vibe profile.
//   3. The highest score wins. Ties first prefer "tighter" drinks (fewer
//      unmatched descriptors), then break deterministically by the
//      movie's id so different movies with the same top score still get
//      different pours, but the same movie keeps the same pour on reload.
//
// Note on decades: we deliberately don't use `movie.decade` here. That
// field is derived from the release year, not the era the movie depicts —
// a 2024 film set in Ancient Rome would still register as 2020s and
// muddy the pairing. If we ever get reliable "depicted era" metadata, we
// can re-introduce decade as another contributor to the vibe profile.
//
// The "why" line surfaces the descriptors that lined up — that's the
// algorithm's reasoning, not a hand-written tasting note.

// One-line gloss per descriptor — a plain-language read on what that vibe
// tag actually means. Surfaced by the explain popup so the user can see
// what each matched note is bringing to the pairing.
export const DESCRIPTOR_GLOSS = {
  intense:       'high-stakes, no breathing room',
  punchy:        'quick hits, decisive energy',
  bold:          'loud, unapologetic',
  strong:        'dense and undiluted',
  fast:          'momentum-driven',
  fiery:         'hot energy with a spicy edge',
  expansive:     'sweeping, world-widening',
  sturdy:        'dependable, weight-bearing',
  warm:          'sun-on-your-skin energy',
  hopeful:       'optimistic, forward-looking',
  rustic:        'hand-built, slightly weathered',
  bright:        'high-light, alert',
  colorful:      'saturated, eye-catching',
  fizzy:         'effervescent, light',
  playful:       'mischievous, kid-coded',
  sweet:         'soft and forgiving palate',
  light:         'low-density, easy to keep up with',
  easy:          'low-stakes, drinkable',
  smoky:         'low-burning, slightly dangerous',
  dark:          'shadow-heavy, low-contrast joy',
  classic:       'long-canon, timeless silhouette',
  urban:         'city-coded, late-night',
  bitter:        'astringent — makes you pay attention',
  sharp:         'precise, no-fluff',
  contemplative: 'thoughtful, slow-thinking',
  restrained:    "quiet, doesn't shout",
  complex:       'multi-layered, rewards repeated visits',
  heavy:         'dense, sits in your stomach',
  serious:       'earnest, no winking',
  rich:          'opulent, full-bodied',
  gentle:        'low-impact and kind',
  soft:          'tender, unhurried',
  simple:        'few moving parts',
  herbal:        'aromatic, garden-coded',
  magical:       'wondrous, otherworldly',
  'old-world':   'tradition-bound, European-leaning',
  romantic:      'tender and warm-hearted',
  unfamiliar:    'alien, slightly exotic',
  fortified:     'strengthened, built-up',
  period:        'era-coded, costume-driven',
  unsettling:    'puts you off-balance',
  tense:         'tightly wound',
  rhythmic:      'beat-driven',
  celebratory:   'festive, occasion-marking',
  cool:          'composed, low-temperature',
  futuristic:    'forward-leaning, modern',
  modern:        'contemporary, of-the-moment',
  dry:           'parched, not sweet',
  dusty:         'frontier-coded, worn-in',
  crisp:         'clean and dry',
};

// Each genre carries a set of vibe descriptors. Tags are intentionally
// reused across genres so the frequency-map step can reward overlap
// (e.g. Crime + Mystery both score "classic" + "urban" + "sharp").
const GENRE_DESCRIPTORS = {
  Action:            ['intense', 'punchy', 'bold', 'strong', 'fast', 'fiery'],
  Adventure:         ['expansive', 'sturdy', 'warm', 'bold', 'hopeful', 'rustic'],
  Animation:         ['bright', 'colorful', 'fizzy', 'playful', 'sweet'],
  Comedy:            ['light', 'bright', 'fizzy', 'easy', 'playful'],
  Crime:             ['smoky', 'dark', 'classic', 'urban', 'bitter', 'sharp'],
  Documentary:       ['contemplative', 'restrained', 'complex', 'classic', 'old-world'],
  Drama:             ['heavy', 'complex', 'classic', 'serious', 'rich'],
  Family:            ['gentle', 'sweet', 'soft', 'bright', 'easy', 'simple'],
  Fantasy:           ['herbal', 'magical', 'colorful', 'old-world', 'romantic', 'unfamiliar'],
  History:           ['classic', 'old-world', 'period', 'fortified', 'rich', 'serious'],
  Horror:            ['dark', 'smoky', 'sharp', 'unsettling', 'bitter', 'fiery', 'tense'],
  Music:             ['fizzy', 'bright', 'rhythmic', 'sweet', 'celebratory'],
  Musical:           ['fizzy', 'bright', 'rhythmic', 'sweet', 'celebratory'],
  Mystery:           ['classic', 'sharp', 'cool', 'urban', 'tense', 'dry'],
  Romance:           ['sweet', 'romantic', 'soft', 'fizzy', 'gentle', 'celebratory'],
  'Science Fiction': ['cool', 'futuristic', 'unfamiliar', 'bright', 'sharp', 'modern'],
  Thriller:          ['bitter', 'sharp', 'tense', 'classic', 'dark', 'urban'],
  War:               ['heavy', 'dark', 'intense', 'serious', 'rich', 'fortified'],
  Western:           ['rustic', 'dusty', 'fiery', 'bold', 'classic', 'warm'],
  'TV Movie':        ['easy', 'gentle', 'simple', 'light'],
};

// Drink library. Each entry has a type (cocktail / beer / wine / shot), a
// name, and a list of vibe descriptors that describe what it tastes /
// drinks like in mood terms. Don't be shy with descriptors — overlap is
// what powers the scoring.
const DRINKS = [
  // Cocktails
  { type: 'cocktail', name: 'Old Fashioned',           desc: ['classic', 'smoky', 'dark', 'serious', 'urban', 'rich', 'strong', 'sturdy'] },
  { type: 'cocktail', name: 'Negroni',                 desc: ['bitter', 'classic', 'sharp', 'urban', 'tense'] },
  { type: 'cocktail', name: 'Negroni Sbagliato',       desc: ['bitter', 'fizzy', 'classic', 'tense', 'urban'] },
  { type: 'cocktail', name: 'Boulevardier',            desc: ['bold', 'bitter', 'smoky', 'urban', 'classic', 'rich', 'sturdy'] },
  { type: 'cocktail', name: 'Aperol Spritz',           desc: ['fizzy', 'bright', 'light', 'easy', 'playful', 'colorful', 'hopeful'] },
  { type: 'cocktail', name: 'French 75',               desc: ['fizzy', 'bright', 'celebratory', 'romantic', 'classic', 'sharp', 'hopeful'] },
  { type: 'cocktail', name: 'Dry Martini',             desc: ['classic', 'sharp', 'cool', 'urban', 'dry', 'restrained'] },
  { type: 'cocktail', name: 'Vesper',                  desc: ['classic', 'cool', 'sharp', 'urban', 'bitter', 'tense'] },
  { type: 'cocktail', name: 'Manhattan',               desc: ['classic', 'rich', 'serious', 'urban', 'strong', 'sturdy'] },
  { type: 'cocktail', name: 'Black Manhattan',         desc: ['bitter', 'classic', 'serious', 'urban', 'tense'] },
  { type: 'cocktail', name: 'Sidecar',                 desc: ['classic', 'period', 'old-world', 'sharp', 'bright', 'celebratory'] },
  { type: 'cocktail', name: 'Aviation',                desc: ['cool', 'unfamiliar', 'futuristic', 'sharp', 'romantic', 'modern'] },
  { type: 'cocktail', name: 'Margarita',               desc: ['fiery', 'bright', 'punchy', 'easy', 'playful', 'sharp', 'fast'] },
  { type: 'cocktail', name: 'Smoked Margarita',        desc: ['smoky', 'fiery', 'punchy', 'sharp', 'fast'] },
  { type: 'cocktail', name: 'Tequila Paloma',          desc: ['fiery', 'bright', 'punchy', 'fizzy', 'easy', 'fast'] },
  { type: 'cocktail', name: 'Mai Tai',                 desc: ['playful', 'expansive', 'bright', 'sweet', 'rustic', 'hopeful', 'warm'] },
  { type: 'cocktail', name: 'Mimosa',                  desc: ['fizzy', 'bright', 'celebratory', 'gentle', 'soft', 'easy', 'hopeful'] },
  { type: 'cocktail', name: 'Bellini',                 desc: ['fizzy', 'sweet', 'soft', 'romantic', 'gentle', 'playful', 'hopeful'] },
  { type: 'cocktail', name: 'Cosmopolitan',            desc: ['bright', 'period', 'urban', 'classic', 'sharp', 'modern'] },
  { type: 'cocktail', name: 'Whiskey Sour',            desc: ['bold', 'rustic', 'sharp', 'classic', 'warm', 'sturdy'] },
  { type: 'cocktail', name: 'Whiskey Smash',           desc: ['warm', 'bright', 'rustic', 'soft', 'hopeful'] },
  { type: 'cocktail', name: 'Mezcal Negroni',          desc: ['smoky', 'bitter', 'fiery', 'dark', 'unsettling'] },
  { type: 'cocktail', name: 'Smoky Old Fashioned',     desc: ['smoky', 'dark', 'tense', 'classic', 'serious', 'strong', 'bold'] },
  { type: 'cocktail', name: 'Corpse Reviver No. 2',    desc: ['classic', 'sharp', 'unsettling', 'tense', 'romantic', 'unfamiliar'] },
  { type: 'cocktail', name: 'Last Word',               desc: ['herbal', 'classic', 'unfamiliar', 'sharp', 'tense', 'magical'] },
  { type: 'cocktail', name: 'Vieux Carré',             desc: ['classic', 'old-world', 'rich', 'urban', 'serious'] },
  { type: 'cocktail', name: 'Blood and Sand',          desc: ['rich', 'smoky', 'period', 'romantic', 'old-world'] },
  { type: 'cocktail', name: 'Hugo Spritz',             desc: ['fizzy', 'gentle', 'light', 'soft', 'romantic', 'herbal'] },
  { type: 'cocktail', name: 'Lavender Gin Fizz',       desc: ['herbal', 'romantic', 'soft', 'fizzy', 'gentle', 'magical'] },
  { type: 'cocktail', name: 'Tequila Sunrise',         desc: ['period', 'bright', 'playful', 'sweet', 'colorful', 'hopeful'] },
  { type: 'cocktail', name: 'Dark and Stormy',         desc: ['dark', 'rustic', 'expansive', 'fiery', 'strong', 'bold'] },
  { type: 'cocktail', name: 'Gin & Tonic',             desc: ['herbal', 'classic', 'easy', 'bright', 'sharp'] },
  { type: 'cocktail', name: 'Whiskey Highball',        desc: ['classic', 'easy', 'rustic', 'warm', 'sturdy', 'bold'] },

  // Beers
  { type: 'beer', name: 'Pilsner',                     desc: ['light', 'easy', 'classic', 'crisp', 'simple'] },
  { type: 'beer', name: 'Lager',                       desc: ['easy', 'simple', 'light', 'gentle', 'classic'] },
  { type: 'beer', name: 'Hefeweizen',                  desc: ['soft', 'gentle', 'sweet', 'playful', 'rustic', 'hopeful'] },
  { type: 'beer', name: 'Witbier',                     desc: ['soft', 'bright', 'easy', 'light', 'playful'] },
  { type: 'beer', name: 'Saison',                      desc: ['rustic', 'complex', 'bright', 'sharp', 'expansive'] },
  { type: 'beer', name: 'Belgian Tripel',              desc: ['old-world', 'complex', 'rich', 'celebratory', 'magical', 'fortified'] },
  { type: 'beer', name: 'Amber Ale',                   desc: ['warm', 'sturdy', 'rustic', 'easy', 'expansive', 'classic', 'hopeful'] },
  { type: 'beer', name: 'IPA',                         desc: ['bold', 'punchy', 'sharp', 'bitter', 'modern', 'fast'] },
  { type: 'beer', name: 'Hazy IPA',                    desc: ['bold', 'colorful', 'modern', 'punchy', 'bright'] },
  { type: 'beer', name: 'Stout',                       desc: ['dark', 'heavy', 'serious', 'rich', 'classic', 'sturdy', 'bold'] },
  { type: 'beer', name: 'Imperial Stout',              desc: ['dark', 'heavy', 'intense', 'serious', 'rich', 'strong', 'bold', 'expansive'] },
  { type: 'beer', name: 'Smoked Porter',               desc: ['smoky', 'dark', 'rich', 'unsettling', 'rustic'] },
  { type: 'beer', name: 'Cream Ale',                   desc: ['gentle', 'soft', 'easy', 'simple', 'light'] },

  // Wines
  { type: 'wine', name: 'Cabernet Sauvignon',          desc: ['heavy', 'rich', 'classic', 'serious', 'dark', 'strong', 'bold', 'sturdy'] },
  { type: 'wine', name: 'Malbec',                      desc: ['intense', 'dark', 'bold', 'rich', 'sturdy'] },
  { type: 'wine', name: 'Pinot Noir',                  desc: ['contemplative', 'complex', 'soft', 'classic'] },
  { type: 'wine', name: 'Burgundy Pinot Noir',         desc: ['old-world', 'complex', 'classic', 'urban', 'contemplative'] },
  { type: 'wine', name: 'Petit Verdot',                desc: ['dark', 'tense', 'rich', 'serious', 'intense', 'bold'] },
  { type: 'wine', name: 'Mourvèdre',                   desc: ['rustic', 'dark', 'unfamiliar', 'expansive', 'futuristic'] },
  { type: 'wine', name: 'Syrah',                       desc: ['intense', 'rich', 'fiery', 'dark', 'bold', 'sturdy'] },
  { type: 'wine', name: 'Rosé',                        desc: ['soft', 'sweet', 'romantic', 'gentle', 'light', 'celebratory', 'hopeful'] },
  { type: 'wine', name: 'Brut Rosé',                   desc: ['fizzy', 'romantic', 'gentle', 'celebratory', 'bright', 'hopeful'] },
  { type: 'wine', name: 'Champagne',                   desc: ['fizzy', 'celebratory', 'classic', 'romantic', 'bright', 'hopeful'] },
  { type: 'wine', name: 'Demi-sec Champagne',          desc: ['fizzy', 'sweet', 'soft', 'romantic', 'gentle'] },
  { type: 'wine', name: 'Port',                        desc: ['fortified', 'classic', 'old-world', 'period', 'rich', 'sturdy'] },
  { type: 'wine', name: 'Vintage Port',                desc: ['fortified', 'period', 'classic', 'old-world', 'serious', 'sturdy'] },
  { type: 'wine', name: 'Aged Bordeaux',               desc: ['old-world', 'period', 'classic', 'serious', 'rich', 'sturdy', 'expansive'] },
  { type: 'wine', name: 'Amarone',                     desc: ['intense', 'dark', 'period', 'unsettling', 'serious'] },
  { type: 'wine', name: 'Barolo',                      desc: ['old-world', 'intense', 'serious', 'tense', 'fortified', 'sturdy'] },
  { type: 'wine', name: 'Riesling',                    desc: ['sweet', 'soft', 'gentle', 'bright'] },
  { type: 'wine', name: 'Sauvignon Blanc',             desc: ['bright', 'sharp', 'light', 'crisp'] },
  { type: 'wine', name: 'Prosecco',                    desc: ['fizzy', 'easy', 'celebratory', 'playful', 'bright', 'hopeful'] },
  { type: 'wine', name: 'Sparkling Vouvray',           desc: ['fizzy', 'period', 'romantic', 'old-world', 'soft'] },

  // Shots
  { type: 'shot', name: 'Tequila Reposado',            desc: ['fiery', 'punchy', 'rustic', 'dusty', 'warm', 'fast'] },
  { type: 'shot', name: 'Mezcal',                      desc: ['smoky', 'fiery', 'unsettling', 'dark', 'sharp', 'fast'] },
  { type: 'shot', name: 'Rye Whiskey',                 desc: ['bold', 'sharp', 'classic', 'serious', 'strong', 'fast'] },
  { type: 'shot', name: 'Bourbon',                     desc: ['warm', 'rich', 'rustic', 'classic', 'strong', 'sturdy'] },
  { type: 'shot', name: 'Fernet-Branca',               desc: ['bitter', 'sharp', 'unsettling', 'dark', 'urban', 'fast'] },
];

const DEFAULT = { type: 'wine', name: "Whatever's already open", why: 'no genre data — open whatever you reach first', source: 'fallback' };

export function pickPairing(movie) {
  const genres = (movie?.genres || []);
  if (!genres.length) return { ...DEFAULT };

  // Frequency map: descriptors collected from each genre. A descriptor that
  // appears in multiple genres is weighted more heavily.
  const freq = new Map();
  for (const g of genres) {
    for (const d of (GENRE_DESCRIPTORS[g] || [])) {
      freq.set(d, (freq.get(d) || 0) + 1);
    }
  }
  if (freq.size === 0) return { ...DEFAULT };

  // Score every drink by summing the weights of its overlapping
  // descriptors. Drop drinks that don't match anything.
  const scored = DRINKS.map((d) => {
    const matches = d.desc.filter((tag) => freq.has(tag));
    const score = matches.reduce((acc, tag) => acc + freq.get(tag), 0);
    return { drink: d, score, matches };
  }).filter((s) => s.score > 0);

  if (!scored.length) return { ...DEFAULT };

  // Sort: highest score first; then prefer drinks where most of their
  // descriptors hit (tighter fit, less drift); then alphabetically by name
  // for a deterministic baseline.
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aHitRate = a.matches.length / a.drink.desc.length;
    const bHitRate = b.matches.length / b.drink.desc.length;
    if (bHitRate !== aHitRate) return bHitRate - aHitRate;
    return a.drink.name.localeCompare(b.drink.name);
  });

  // Within the top-tied score group, vary the pick by a stable hash of the
  // movie's id so different movies with similar vibes don't all pour the
  // same thing — same movie still gets the same drink across reloads.
  const topScore = scored[0].score;
  const topGroup = scored.filter((s) => s.score === topScore);
  const seed = Math.abs(Number(movie?.id) || Number(movie?.tmdb_id) || 0);
  const winner = topGroup[seed % topGroup.length];

  return {
    type:    winner.drink.type,
    glass:   pourEmoji(winner.drink),
    name:    winner.drink.name,
    why:     formatWhy(winner.matches, freq),
    matches: winner.matches,
    tagToGenres: tagToGenresMap(winner.matches, genres),
    score:   winner.score,
    candidates: scored.slice(0, 5).map((s) => s.drink.name),
    source:  'algorithm',
  };
}

// For each matched descriptor, list which of the movie's genres carry it.
// Used by the explain popup to show the per-genre case for the pour.
function tagToGenresMap(matches, genres) {
  const out = {};
  for (const tag of matches) {
    out[tag] = genres.filter((g) => (GENRE_DESCRIPTORS[g] || []).includes(tag));
  }
  return out;
}

// Pick the descriptors with the highest weights (those mentioned by the
// most genres) and string them as the "why" line. Caps at three so the
// label stays scannable.
function formatWhy(matches, freq) {
  if (!matches.length) return '';
  const sorted = [...matches].sort((a, b) => (freq.get(b) || 0) - (freq.get(a) || 0));
  return sorted.slice(0, 3).join(' · ');
}

const TYPE_LABEL = {
  cocktail: 'Cocktail',
  beer:     'Beer',
  wine:     'Wine',
  shot:     'Shot',
};
// Default emoji per type — used as a fallback when a drink doesn't have a
// more specific glass shape mapped below.
const TYPE_EMOJI = {
  cocktail: '🍸',
  beer:     '🍺',
  wine:     '🍷',
  shot:     '🥃',
};

// Per-drink glass shape, picked to resemble how the drink is actually
// served. Anything not listed falls back to TYPE_EMOJI for its type.
//   🍸 V-shaped cocktail / coupe
//   🥃 rocks tumbler / shot glass
//   🥂 sparkling flute (fizzy / brunch / champagne)
//   🍹 tropical / highball with garnish
//   🍷 still wine
//   🍺 beer mug
const GLASS_FOR_DRINK = {
  // Stirred / spirit-forward cocktails → rocks
  'Old Fashioned':       '🥃',
  'Negroni':             '🥃',
  'Negroni Sbagliato':   '🥃',
  'Boulevardier':        '🥃',
  'Whiskey Sour':        '🥃',
  'Whiskey Smash':       '🥃',
  'Mezcal Negroni':      '🥃',
  'Smoky Old Fashioned': '🥃',
  'Vieux Carré':         '🥃',
  'Gin & Tonic':         '🥃',
  'Whiskey Highball':    '🥃',
  // Up-style cocktails → coupe / martini
  'Dry Martini':           '🍸',
  'Vesper':                '🍸',
  'Manhattan':             '🍸',
  'Black Manhattan':       '🍸',
  'Sidecar':               '🍸',
  'Aviation':              '🍸',
  'Cosmopolitan':          '🍸',
  'Corpse Reviver No. 2':  '🍸',
  'Last Word':             '🍸',
  'Blood and Sand':        '🍸',
  'Lavender Gin Fizz':     '🍸',
  // Sparkling / brunch → flute
  'Aperol Spritz':         '🥂',
  'French 75':             '🥂',
  'Mimosa':                '🥂',
  'Bellini':               '🥂',
  'Hugo Spritz':           '🥂',
  // Tropical / highball with garnish
  'Margarita':             '🍹',
  'Smoked Margarita':      '🍹',
  'Tequila Paloma':        '🍹',
  'Mai Tai':               '🍹',
  'Tequila Sunrise':       '🍹',
  'Dark and Stormy':       '🍹',
  // Sparkling wines → flute
  'Brut Rosé':             '🥂',
  'Champagne':             '🥂',
  'Demi-sec Champagne':    '🥂',
  'Prosecco':              '🥂',
  'Sparkling Vouvray':     '🥂',
};

function pourEmoji(drink) {
  return GLASS_FOR_DRINK[drink.name] || TYPE_EMOJI[drink.type] || '🥂';
}

export function typeLabel(t) { return TYPE_LABEL[t] || t; }
export function typeEmoji(t) { return TYPE_EMOJI[t] || '🥂'; }
