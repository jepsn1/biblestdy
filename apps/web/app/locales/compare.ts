import i18n from "~/lib/i18n";

/**
 * Compare translations' own words (#167), en + da. They ship with the
 * dialog's lazy chunk, not in the reader's first paint (bundle budget):
 * importing this module adds them to i18next (merged into `compare`, whose
 * load-failure line stays in en.ts / da.ts for when this chunk can't load).
 */
const en = {
  title: "Compare translations",
  reading: "You’re reading: {{abbr}} · {{name}}",
  group: "Compare with:",
  cap: "You can compare up to {{n}} at a time",
  empty: "Choose at least one translation above",
  renumbered: "Verse numbers differ here: {{ref}} in {{abbr}}",
  moved: "Placed at {{ref}} in this translation",
  absent: "This translation has no verse {{n}}",
  psalmTitle: "The psalm title has no verse number in this translation",
  unmapped: "Couldn’t match the verses in this translation",
  loading: "Loading {{abbr}} — a few seconds",
  limited: "{{abbr}} can’t be shown right now. Try again in about {{wait}}.",
  daily: "{{abbr}} can’t be shown right now. Try again tomorrow.",
  failed: "{{abbr}} didn’t load.",
  retry: "Try again",
  close: "Close",
  // Phone steps (#218): pick, then compare
  choose: "Choose translations",
  go: "Compare",
  change: "Change translations",
  verse: "verse {{n}}",
  verses: "verses {{from}} to {{to}}",
  // The compact picker (#258)
  picker: "Translations",
  pickerName: "Compare translations, {{count}} selected",
  readingNote: "You’re reading this one",
  filter: "Filter translations",
  noMatch: "No translation matches",
};

const da: typeof en = {
  title: "Sammenlign oversættelser",
  reading: "Du læser i: {{abbr}} · {{name}}",
  group: "Sammenlign med:",
  cap: "Du kan sammenligne op til {{n}} ad gangen",
  empty: "Vælg mindst én oversættelse ovenfor",
  renumbered: "Versene har andre numre her: {{ref}} i {{abbr}}",
  moved: "Står i {{ref}} i denne oversættelse",
  absent: "Denne oversættelse har intet vers {{n}}",
  psalmTitle: "Salmens overskrift har intet versnummer i denne oversættelse",
  unmapped: "Versene kunne ikke findes i denne oversættelse",
  loading: "Henter {{abbr}} — et øjeblik",
  limited: "{{abbr}} kan ikke vises lige nu. Prøv igen om cirka {{wait}}.",
  daily: "{{abbr}} kan ikke vises lige nu. Prøv igen i morgen.",
  failed: "{{abbr}} kunne ikke hentes.",
  retry: "Prøv igen",
  close: "Luk",
  choose: "Vælg oversættelser",
  go: "Sammenlign",
  change: "Skift oversættelser",
  verse: "vers {{n}}",
  verses: "vers {{from}} til {{to}}",
  picker: "Oversættelser",
  pickerName: "Sammenlign oversættelser, {{count}} valgt",
  readingNote: "Den du læser i",
  filter: "Filtrér oversættelser",
  noMatch: "Ingen oversættelser passer",
};

/** The palette's Compare rows (the palette is its own chunk too). */
export const paletteEn = {
  compareAction: "Compare translations · {{ref}}",
  compareRef: "Compare {{ref}}",
};
const paletteDa: typeof paletteEn = {
  compareAction: "Sammenlign oversættelser · {{ref}}",
  compareRef: "Sammenlign {{ref}}",
};

i18n.addResourceBundle("en", "translation", { compare: en, palette: paletteEn }, true, false);
i18n.addResourceBundle("da", "translation", { compare: da, palette: paletteDa }, true, false);
