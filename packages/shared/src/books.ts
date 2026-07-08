/**
 * Canonical book metadata (Protestant 66-book canon).
 * Ids are USFM book codes — the same codes API.Bible uses.
 * `names` holds per-locale display names + accepted abbreviations for parsing;
 * adding a locale (e.g. Danish) is data, not code.
 */

export type BookId = (typeof BOOKS)[number]['id']

export interface Book {
  id: string
  /** English display name */
  name: string
  /** Lowercase parse aliases (name itself is always accepted) */
  aliases: readonly string[]
  chapters: number
}

export const BOOKS = [
  { id: 'GEN', name: 'Genesis', aliases: ['gen', 'ge', 'gn'], chapters: 50 },
  { id: 'EXO', name: 'Exodus', aliases: ['exo', 'ex', 'exod'], chapters: 40 },
  { id: 'LEV', name: 'Leviticus', aliases: ['lev', 'le', 'lv'], chapters: 27 },
  { id: 'NUM', name: 'Numbers', aliases: ['num', 'nu', 'nm', 'nb'], chapters: 36 },
  { id: 'DEU', name: 'Deuteronomy', aliases: ['deu', 'dt', 'deut'], chapters: 34 },
  { id: 'JOS', name: 'Joshua', aliases: ['jos', 'josh', 'jsh'], chapters: 24 },
  { id: 'JDG', name: 'Judges', aliases: ['jdg', 'judg', 'jg'], chapters: 21 },
  { id: 'RUT', name: 'Ruth', aliases: ['rut', 'ru', 'rth'], chapters: 4 },
  { id: '1SA', name: '1 Samuel', aliases: ['1sa', '1sam', '1 sam', '1 samuel', 'i samuel'], chapters: 31 },
  { id: '2SA', name: '2 Samuel', aliases: ['2sa', '2sam', '2 sam', '2 samuel', 'ii samuel'], chapters: 24 },
  { id: '1KI', name: '1 Kings', aliases: ['1ki', '1kgs', '1 kgs', '1 kings', 'i kings'], chapters: 22 },
  { id: '2KI', name: '2 Kings', aliases: ['2ki', '2kgs', '2 kgs', '2 kings', 'ii kings'], chapters: 25 },
  { id: '1CH', name: '1 Chronicles', aliases: ['1ch', '1chr', '1 chr', '1 chronicles', 'i chronicles'], chapters: 29 },
  { id: '2CH', name: '2 Chronicles', aliases: ['2ch', '2chr', '2 chr', '2 chronicles', 'ii chronicles'], chapters: 36 },
  { id: 'EZR', name: 'Ezra', aliases: ['ezr', 'ez'], chapters: 10 },
  { id: 'NEH', name: 'Nehemiah', aliases: ['neh', 'ne'], chapters: 13 },
  { id: 'EST', name: 'Esther', aliases: ['est', 'es', 'esth'], chapters: 10 },
  { id: 'JOB', name: 'Job', aliases: ['job', 'jb'], chapters: 42 },
  { id: 'PSA', name: 'Psalms', aliases: ['psa', 'ps', 'psalm', 'pss', 'psm'], chapters: 150 },
  { id: 'PRO', name: 'Proverbs', aliases: ['pro', 'pr', 'prov', 'prv'], chapters: 31 },
  { id: 'ECC', name: 'Ecclesiastes', aliases: ['ecc', 'ec', 'eccl', 'qoh'], chapters: 12 },
  { id: 'SNG', name: 'Song of Solomon', aliases: ['sng', 'song', 'sos', 'song of songs', 'canticles'], chapters: 8 },
  { id: 'ISA', name: 'Isaiah', aliases: ['isa', 'is'], chapters: 66 },
  { id: 'JER', name: 'Jeremiah', aliases: ['jer', 'je', 'jr'], chapters: 52 },
  { id: 'LAM', name: 'Lamentations', aliases: ['lam', 'la'], chapters: 5 },
  { id: 'EZK', name: 'Ezekiel', aliases: ['ezk', 'ezek', 'eze'], chapters: 48 },
  { id: 'DAN', name: 'Daniel', aliases: ['dan', 'da', 'dn'], chapters: 12 },
  { id: 'HOS', name: 'Hosea', aliases: ['hos', 'ho'], chapters: 14 },
  { id: 'JOL', name: 'Joel', aliases: ['jol', 'joe', 'jl'], chapters: 3 },
  { id: 'AMO', name: 'Amos', aliases: ['amo', 'am'], chapters: 9 },
  { id: 'OBA', name: 'Obadiah', aliases: ['oba', 'ob', 'obad'], chapters: 1 },
  { id: 'JON', name: 'Jonah', aliases: ['jon', 'jnh'], chapters: 4 },
  { id: 'MIC', name: 'Micah', aliases: ['mic', 'mi', 'mc'], chapters: 7 },
  { id: 'NAM', name: 'Nahum', aliases: ['nam', 'nah', 'na'], chapters: 3 },
  { id: 'HAB', name: 'Habakkuk', aliases: ['hab', 'hb'], chapters: 3 },
  { id: 'ZEP', name: 'Zephaniah', aliases: ['zep', 'zeph', 'zp'], chapters: 3 },
  { id: 'HAG', name: 'Haggai', aliases: ['hag', 'hg'], chapters: 2 },
  { id: 'ZEC', name: 'Zechariah', aliases: ['zec', 'zech', 'zc'], chapters: 14 },
  { id: 'MAL', name: 'Malachi', aliases: ['mal', 'ml'], chapters: 4 },
  { id: 'MAT', name: 'Matthew', aliases: ['mat', 'mt', 'matt'], chapters: 28 },
  { id: 'MRK', name: 'Mark', aliases: ['mrk', 'mk', 'mar', 'mark'], chapters: 16 },
  { id: 'LUK', name: 'Luke', aliases: ['luk', 'lk', 'lu'], chapters: 24 },
  { id: 'JHN', name: 'John', aliases: ['jhn', 'jn', 'joh'], chapters: 21 },
  { id: 'ACT', name: 'Acts', aliases: ['act', 'ac'], chapters: 28 },
  { id: 'ROM', name: 'Romans', aliases: ['rom', 'ro', 'rm'], chapters: 16 },
  { id: '1CO', name: '1 Corinthians', aliases: ['1co', '1cor', '1 cor', '1 corinthians', 'i corinthians'], chapters: 16 },
  { id: '2CO', name: '2 Corinthians', aliases: ['2co', '2cor', '2 cor', '2 corinthians', 'ii corinthians'], chapters: 13 },
  { id: 'GAL', name: 'Galatians', aliases: ['gal', 'ga'], chapters: 6 },
  { id: 'EPH', name: 'Ephesians', aliases: ['eph', 'ep'], chapters: 6 },
  { id: 'PHP', name: 'Philippians', aliases: ['php', 'phil', 'philip'], chapters: 4 },
  { id: 'COL', name: 'Colossians', aliases: ['col'], chapters: 4 },
  { id: '1TH', name: '1 Thessalonians', aliases: ['1th', '1thess', '1 thess', '1 thessalonians', 'i thessalonians'], chapters: 5 },
  { id: '2TH', name: '2 Thessalonians', aliases: ['2th', '2thess', '2 thess', '2 thessalonians', 'ii thessalonians'], chapters: 3 },
  { id: '1TI', name: '1 Timothy', aliases: ['1ti', '1tim', '1 tim', '1 timothy', 'i timothy'], chapters: 6 },
  { id: '2TI', name: '2 Timothy', aliases: ['2ti', '2tim', '2 tim', '2 timothy', 'ii timothy'], chapters: 4 },
  { id: 'TIT', name: 'Titus', aliases: ['tit', 'ti'], chapters: 3 },
  { id: 'PHM', name: 'Philemon', aliases: ['phm', 'phlm', 'philem'], chapters: 1 },
  { id: 'HEB', name: 'Hebrews', aliases: ['heb'], chapters: 13 },
  { id: 'JAS', name: 'James', aliases: ['jas', 'jm', 'jam'], chapters: 5 },
  { id: '1PE', name: '1 Peter', aliases: ['1pe', '1pet', '1 pet', '1 peter', 'i peter'], chapters: 5 },
  { id: '2PE', name: '2 Peter', aliases: ['2pe', '2pet', '2 pet', '2 peter', 'ii peter'], chapters: 3 },
  { id: '1JN', name: '1 John', aliases: ['1jn', '1joh', '1 jn', '1 john', 'i john'], chapters: 5 },
  { id: '2JN', name: '2 John', aliases: ['2jn', '2joh', '2 jn', '2 john', 'ii john'], chapters: 1 },
  { id: '3JN', name: '3 John', aliases: ['3jn', '3joh', '3 jn', '3 john', 'iii john'], chapters: 1 },
  { id: 'JUD', name: 'Jude', aliases: ['jud', 'jd'], chapters: 1 },
  { id: 'REV', name: 'Revelation', aliases: ['rev', 're', 'apocalypse'], chapters: 22 },
] as const satisfies readonly Book[]

const byAlias = new Map<string, Book>()
for (const book of BOOKS) {
  byAlias.set(book.name.toLowerCase(), book)
  byAlias.set(book.id.toLowerCase(), book)
  for (const alias of book.aliases) byAlias.set(alias, book)
}

export function findBook(nameOrAlias: string): Book | undefined {
  const normalized = nameOrAlias
    .trim()
    .toLowerCase()
    .replace(/^(\d)\s*/, '$1 ') // "1john"/"1  john" → "1 john"
    .replace(/\s+/g, ' ')
  return byAlias.get(normalized) ?? byAlias.get(normalized.replace(/^(\d) /, '$1'))
}

export function getBook(id: string): Book | undefined {
  return BOOKS.find((b) => b.id === id)
}

export function bookIndex(id: string): number {
  return BOOKS.findIndex((b) => b.id === id)
}
