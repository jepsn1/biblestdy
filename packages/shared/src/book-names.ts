import type { BookId } from './books.js'

export type BookLocale = 'en' | 'da'

/**
 * Danish book names (#53): display name first, then extra lowercase parse
 * aliases (Bibelselskabet abbreviations + the full official title). The
 * display name itself is always accepted, as are ASCII spellings of æ/ø/å.
 */
export const DANISH_BOOKS: Record<BookId, readonly [string, ...string[]]> = {
  GEN: ['1 Mosebog', '1 mos', 'første mosebog', 'genesis'],
  EXO: ['2 Mosebog', '2 mos', 'anden mosebog'],
  LEV: ['3 Mosebog', '3 mos', 'tredje mosebog'],
  NUM: ['4 Mosebog', '4 mos', 'fjerde mosebog'],
  DEU: ['5 Mosebog', '5 mos', 'femte mosebog'],
  JOS: ['Josva', 'jos', 'josvabogen'],
  JDG: ['Dommerbogen', 'dom', 'dommer'],
  RUT: ['Ruth', 'rut', 'ruths bog'],
  '1SA': ['1 Samuelsbog', '1 sam', 'første samuelsbog'],
  '2SA': ['2 Samuelsbog', '2 sam', 'anden samuelsbog'],
  '1KI': ['1 Kongebog', '1 kong', 'første kongebog'],
  '2KI': ['2 Kongebog', '2 kong', 'anden kongebog'],
  '1CH': ['1 Krønikebog', '1 krøn', 'første krønikebog'],
  '2CH': ['2 Krønikebog', '2 krøn', 'anden krønikebog'],
  EZR: ['Ezra', 'ezr', 'ezras bog'],
  NEH: ['Nehemias', 'neh', "nehemias' bog"],
  EST: ['Ester', 'est', 'esters bog'],
  JOB: ['Job', 'jobs bog'],
  PSA: ['Salmerne', 'sl', 'salme', 'salmer', 'salmernes bog'],
  PRO: ['Ordsprogene', 'ordsp', 'ordsprogenes bog'],
  ECC: ['Prædikeren', 'præd', 'prædikerens bog'],
  SNG: ['Højsangen', 'højs'],
  ISA: ['Esajas', 'es', 'esa', "esajas' bog"],
  JER: ['Jeremias', 'jer', "jeremias' bog"],
  LAM: ['Klagesangene', 'klages', 'klag'],
  EZK: ['Ezekiel', 'ez', 'ezek', 'ezekiels bog'],
  DAN: ['Daniel', 'dan', 'daniels bog'],
  HOS: ['Hoseas', 'hos', "hoseas' bog"],
  JOL: ['Joel', 'joels bog'],
  AMO: ['Amos', 'am', "amos' bog"],
  OBA: ['Obadias', 'obad', "obadias' bog"],
  JON: ['Jonas', 'jon', "jonas' bog"],
  MIC: ['Mika', 'mik', 'mikas bog'],
  NAM: ['Nahum', 'nah', 'nahums bog'],
  HAB: ['Habakkuk', 'hab', 'habakkuks bog'],
  ZEP: ['Sefanias', 'sef', "sefanias' bog"],
  HAG: ['Haggaj', 'hag', 'haggajs bog'],
  ZEC: ['Zakarias', 'zak', "zakarias' bog"],
  MAL: ['Malakias', 'mal', "malakias' bog"],
  MAT: ['Matthæus', 'matt', 'matthæusevangeliet'],
  MRK: ['Markus', 'mark', 'markusevangeliet'],
  LUK: ['Lukas', 'luk', 'lukasevangeliet'],
  JHN: ['Johannes', 'joh', 'johannesevangeliet'],
  ACT: ['Apostlenes Gerninger', 'apg', 'apostlenes gerninger'],
  ROM: ['Romerbrevet', 'rom', 'romerne'],
  '1CO': ['1 Korintherbrev', '1 kor', 'første korintherbrev'],
  '2CO': ['2 Korintherbrev', '2 kor', 'andet korintherbrev'],
  GAL: ['Galaterbrevet', 'gal'],
  EPH: ['Efeserbrevet', 'ef', 'efes'],
  PHP: ['Filipperbrevet', 'fil'],
  COL: ['Kolossenserbrevet', 'kol'],
  '1TH': ['1 Thessalonikerbrev', '1 thess', 'første thessalonikerbrev'],
  '2TH': ['2 Thessalonikerbrev', '2 thess', 'andet thessalonikerbrev'],
  '1TI': ['1 Timotheusbrev', '1 tim', 'første timotheusbrev'],
  '2TI': ['2 Timotheusbrev', '2 tim', 'andet timotheusbrev'],
  TIT: ['Titusbrevet', 'tit'],
  PHM: ['Filemonbrevet', 'filem'],
  HEB: ['Hebræerbrevet', 'hebr'],
  JAS: ['Jakobsbrev', 'jak', 'jakobs brev'],
  '1PE': ['1 Petersbrev', '1 pet', 'første petersbrev'],
  '2PE': ['2 Petersbrev', '2 pet', 'andet petersbrev'],
  '1JN': ['1 Johannesbrev', '1 joh', 'første johannesbrev'],
  '2JN': ['2 Johannesbrev', '2 joh', 'andet johannesbrev'],
  '3JN': ['3 Johannesbrev', '3 joh', 'tredje johannesbrev'],
  JUD: ['Judasbrev', 'jud', 'judas'],
  REV: ['Åbenbaringen', 'åb', 'åbenb', "johannes' åbenbaring"],
}

/** æ→ae, ø→oe/o, å→aa/a: people often type Danish names on English keyboards. */
export function asciiVariants(s: string): string[] {
  if (!/[æøå]/.test(s)) return []
  const long = s.replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa')
  const short = s.replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a')
  return long === short ? [long] : [long, short]
}
