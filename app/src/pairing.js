// Suggest a drink pairing for a movie based on its genre and decade. Just
// for fun — we pick from a small fixed library so the suggestion is stable
// across reloads. Decade overrides beat genre when there's a strong period
// vibe (e.g. anything from the '20s gets a sidecar regardless of genre).

const PAIRINGS = {
  Action:            { type: 'cocktail', name: 'Boulevardier',       why: 'bold and bitter for an explosive ride' },
  Adventure:         { type: 'beer',     name: 'Amber Ale',          why: 'a sturdy pour for sweeping vistas' },
  Animation:         { type: 'cocktail', name: 'Aperol Spritz',      why: 'bright and bubbly to match the colors' },
  Comedy:            { type: 'beer',     name: 'Pilsner',            why: 'crisp and easy — pairs with laughs' },
  Crime:             { type: 'cocktail', name: 'Old Fashioned',      why: 'classic, smoky, slightly dangerous' },
  Documentary:       { type: 'wine',     name: 'Pinot Noir',         why: 'thoughtful and quietly complex' },
  Drama:             { type: 'wine',     name: 'Cabernet Sauvignon', why: 'full-bodied for the heavy moments' },
  Family:            { type: 'beer',     name: 'Root Beer (or a hefeweizen)', why: 'kids at the table, kids at heart' },
  Fantasy:           { type: 'cocktail', name: 'Gin & Tonic',        why: 'herbal magic for otherworldly stories' },
  History:           { type: 'wine',     name: 'Port',               why: 'vintage gravity, fortified with age' },
  Horror:            { type: 'shot',     name: 'Tequila',            why: 'one quick gulp before something jumps out' },
  Music:             { type: 'cocktail', name: 'French 75',          why: 'effervescent — keep the rhythm' },
  Musical:           { type: 'cocktail', name: 'French 75',          why: 'effervescent — keep the rhythm' },
  Mystery:           { type: 'cocktail', name: 'Dry Martini',        why: 'sharp and clean — keep your wits' },
  Romance:           { type: 'wine',     name: 'Rosé',               why: 'soft and a little sweet' },
  'Science Fiction': { type: 'cocktail', name: 'Aviation',           why: 'something otherworldly in the glass' },
  Thriller:          { type: 'cocktail', name: 'Negroni',            why: 'every sip tightens the tension' },
  War:               { type: 'beer',     name: 'Stout',              why: 'dark, heavy, and earned' },
  Western:           { type: 'shot',     name: 'Whiskey, neat',      why: 'no ice, no apologies' },
  'TV Movie':        { type: 'beer',     name: 'Lager',              why: 'sit back, no notes' },
};

// Decade-driven overrides for distinctive eras. Keys are decade ints (the
// `decade` column on movies). Anything not listed falls through to genre.
const DECADE_OVERRIDES = {
  1920: { type: 'cocktail', name: 'Sidecar',                 why: 'pre-Prohibition energy' },
  1950: { type: 'cocktail', name: 'Manhattan',               why: 'mid-century steady-handed' },
  1970: { type: 'cocktail', name: 'Tequila Sunrise',         why: 'shag carpet in a glass' },
  1980: { type: 'cocktail', name: 'Cosmopolitan',            why: 'neon, hairspray, cocktail glasses' },
};

const DEFAULT = { type: 'wine', name: "Whatever's already open", why: 'no strong opinion this round' };

export function pickPairing(movie) {
  if (movie?.decade && DECADE_OVERRIDES[movie.decade]) {
    return { ...DECADE_OVERRIDES[movie.decade], source: 'decade' };
  }
  for (const g of (movie?.genres || [])) {
    if (PAIRINGS[g]) return { ...PAIRINGS[g], source: 'genre', genre: g };
  }
  return { ...DEFAULT, source: 'fallback' };
}

const TYPE_LABEL = {
  cocktail: 'Cocktail',
  beer:     'Beer',
  wine:     'Wine',
  shot:     'Shot',
};
const TYPE_EMOJI = {
  cocktail: '🍸',
  beer:     '🍺',
  wine:     '🍷',
  shot:     '🥃',
};
export function typeLabel(t) { return TYPE_LABEL[t] || t; }
export function typeEmoji(t) { return TYPE_EMOJI[t] || '🥂'; }
