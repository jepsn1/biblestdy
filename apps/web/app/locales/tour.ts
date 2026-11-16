import i18n from "~/lib/i18n";

/**
 * The notes tours' words (#162), en + da. They ship with the lazy chunks
 * that use them (the tours, Settings, the palette) — never the reader's
 * first paint (bundle budget). Importing this module adds them to i18next.
 */
const en = {
  note: {
    body: "Write here – the note saves itself.",
    verse: "+ Verse brings a verse into the text (or type @).",
    refs: "Every verse in the note is listed here – select one to read it.",
  },
  notes: {
    search: "Search all your notes – their verses and topics too.",
    sort: "See your latest notes first, or in Bible order.",
    new: "+ New note starts a note of its own. Add verses whenever you like.",
    mark: "Or select words in the Bible to start a note right there.",
  },
  label: "Tour, {{n}} of {{total}}",
  count: "{{n}} of {{total}}",
  next: "Next",
  done: "Done",
  skip: "Skip",
  announce: "Tip {{n}} of {{total}}: {{text}}",
  keys: "Tab reaches the tip, Esc closes it.",
  replay: "Show the tour again",
  replayKeywords: "tour tips help onboarding introduction notes",
  replayLater: "The tour will show again next time you open a note or the Notes page.",
};

const da: typeof en = {
  note: {
    body: "Skriv her – noten gemmer sig selv.",
    verse: "+ Bibelvers henter et vers ind i teksten (eller skriv @).",
    refs: "Her ser du alle bibelvers i noten – tryk for at læse.",
  },
  notes: {
    search: "Søg i alle dine noter – også i deres bibelvers og emner.",
    sort: "Se de nyeste noter først, eller i Bibelens orden.",
    new: "+ Ny note starter en note for sig selv. Bibelvers kan du tilføje når som helst.",
    mark: "Eller markér ord i Bibelen for at lave en note lige der.",
  },
  label: "Rundvisning, {{n}} af {{total}}",
  count: "{{n}} af {{total}}",
  next: "Næste",
  done: "Færdig",
  skip: "Spring over",
  announce: "Tip {{n}} af {{total}}: {{text}}",
  keys: "Tab fører til tippet, Esc lukker det.",
  replay: "Vis rundvisningen igen",
  replayKeywords: "rundvisning tips hjælp introduktion noter",
  replayLater: "Rundvisningen vises igen, næste gang du åbner en note eller siden Noter.",
};

i18n.addResourceBundle("en", "translation", { tour: en }, true, false);
i18n.addResourceBundle("da", "translation", { tour: da }, true, false);
