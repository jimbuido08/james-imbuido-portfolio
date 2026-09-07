/**
 * TS port of the reference repo's text frontend
 * (`synthesizer/utils/{symbols,text,cleaners,numbers}.py`) — the exact
 * `english_cleaners` pipeline the Tacotron was trained with:
 * unidecode → lowercase → number expansion → abbreviation expansion →
 * whitespace collapse, then `text_to_sequence` into the 66-symbol table.
 *
 * Deviations (documented, checked by the golden text fixtures):
 * - `unidecode` is approximated by a small Latin-1/smart-punctuation map;
 *   anything else non-ASCII is dropped (the demo's inputs are English ASCII —
 *   fixtures pin the behaviour).
 * - `inflect` number-to-words is reimplemented for the forms the reference
 *   rules produce (cardinals without "and", the year/group-2 form, ordinals).
 */
import { EOS_ID, VOICE_SYMBOLS } from "./modelContract";

const SYMBOL_TO_ID: ReadonlyMap<string, number> = new Map(
  VOICE_SYMBOLS.map((symbol, id) => [symbol, id]),
);

/** Characters that survive cleaning (everything else is skipped, matching the
 * reference's `_should_keep_symbol` filter). */
function shouldKeep(symbol: string): boolean {
  return SYMBOL_TO_ID.has(symbol) && symbol !== "_" && symbol !== "~";
}

// ---- unidecode-lite --------------------------------------------------------

/** Common non-ASCII → ASCII replacements; everything else is dropped. */
const UNIDECODE_MAP: ReadonlyMap<string, string> = new Map(
  Object.entries({
    "‘": "'", // '
    "’": "'", // '
    "“": '"', // "
    "”": '"', // "
    "–": "-", // –
    "—": "-", // —
    "…": "...", // …
    " ": " ",
    "£": "£", // £ kept — the number rules consume it
    "é": "e", "è": "e", "ê": "e", "ë": "e",
    "É": "E", "È": "E", "Ê": "E", "Ë": "E",
    "á": "a", "à": "a", "â": "a", "ä": "a",
    "Á": "A", "À": "A", "Â": "A", "Ä": "A",
    "í": "i", "ì": "i", "î": "i", "ï": "i",
    "Í": "I", "Ì": "I", "Î": "I", "Ï": "I",
    "ó": "o", "ò": "o", "ô": "o", "ö": "o",
    "Ó": "O", "Ò": "O", "Ô": "O", "Ö": "O",
    "ú": "u", "ù": "u", "û": "u", "ü": "u",
    "Ú": "U", "Ù": "U", "Û": "U", "Ü": "U",
    "ç": "c", "Ç": "C",
    "ñ": "n", "Ñ": "N",
  }),
);

function convertToAscii(text: string): string {
  let out = "";
  for (const char of text) {
    if (char.charCodeAt(0) < 128) {
      out += char;
    } else {
      out += UNIDECODE_MAP.get(char) ?? "";
    }
  }
  return out;
}

// ---- number expansion (synthesizer/utils/numbers.py + inflect) -------------

const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight",
  "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
  "sixteen", "seventeen", "eighteen", "nineteen",
];
const TENS = [
  "", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty",
  "ninety",
];

/** inflect.engine().number_to_words(n, andword="") for 0 ≤ n < 10^15. */
function numberToWords(num: number): string {
  if (num < 20) return ONES[num];
  if (num < 100) {
    const tens = TENS[Math.floor(num / 10)];
    const ones = num % 10;
    return ones === 0 ? tens : `${tens}-${ONES[ones]}`;
  }
  const scales: Array<[number, string]> = [
    [1_000_000_000_000, "trillion"],
    [1_000_000_000, "billion"],
    [1_000_000, "million"],
    [1000, "thousand"],
    [100, "hundred"],
  ];
  for (const [scale, name] of scales) {
    if (num >= scale) {
      const head = Math.floor(num / scale);
      const rest = num % scale;
      return rest === 0
        ? `${numberToWords(head)} ${name}`
        : `${numberToWords(head)} ${name} ${numberToWords(rest)}`;
    }
  }
  return String(num);
}

/** inflect group=2 form (pairs of digits read as numbers, zero → "oh"). */
function numberToWordsGroup2(num: number): string {
  const digits = String(num);
  const padded = digits.length % 2 === 1 ? `0${digits}` : digits;
  const groups: string[] = [];
  for (let i = 0; i < padded.length; i += 2) {
    groups.push(padded.slice(i, i + 2));
  }
  return groups
    .map((g) => {
      const value = Number(g);
      if (value === 0) return "oh";
      if (value < 10) return `oh ${ONES[value]}`; // "oh five", "oh one"
      return numberToWords(value);
    })
    .join(" ");
}

/** `_expand_number` — the reference's year/century special cases included. */
function expandBareNumber(num: number): string {
  if (num > 1000 && num < 3000) {
    if (num === 2000) return "two thousand";
    if (num > 2000 && num < 2010) return `two thousand ${numberToWords(num % 100)}`;
    if (num % 100 === 0) return `${numberToWords(Math.floor(num / 100))} hundred`;
    return numberToWordsGroup2(num);
  }
  return numberToWords(num);
}

const ORDINAL_SPECIAL = new Map([
  [1, "first"], [2, "second"], [3, "third"], [5, "fifth"], [8, "eighth"],
  [9, "ninth"], [12, "twelfth"],
]);

/** inflect number_to_words("21st") → "twenty-first" (last word ordinalised). */
function ordinalWords(suffixDigits: number): string {
  const cardinal = numberToWords(suffixDigits);
  const special = ORDINAL_SPECIAL.get(suffixDigits % 100);
  if (special) {
    const parts = cardinal.split(" ");
    parts[parts.length - 1] = special;
    return parts.join(" ");
  }
  if (cardinal.endsWith("y")) {
    return `${cardinal.slice(0, -1)}ieth`;
  }
  return `${cardinal}th`;
}

function expandNumbers(text: string): string {
  // ([0-9][0-9,]+[0-9]) — strip commas from grouped numbers (≥ 3 digits).
  text = text.replace(/\d[\d,]+\d/g, (m) => m.replace(/,/g, ""));
  // £([0-9,]*[0-9]+) → "<n> pounds"
  text = text.replace(/£(\d[\d,]*)/g, (_m, digits: string) =>
    `${Number(digits.replace(/,/g, ""))} pounds`,
  );
  // $([0-9.,]*[0-9]+) → dollars/cents sentence
  text = text.replace(/\$([\d.,]*\d)/g, (_m, match: string) => {
    const parts = match.split(".");
    if (parts.length > 2) return `${match} dollars`;
    const dollars = parts[0] ? Number(parts[0]) : 0;
    const cents = parts.length > 1 && parts[1] ? Number(parts[1]) : 0;
    const dollarUnit = dollars === 1 ? "dollar" : "dollars";
    const centUnit = cents === 1 ? "cent" : "cents";
    if (dollars && cents) return `${dollars} ${dollarUnit}, ${cents} ${centUnit}`;
    if (dollars) return `${dollars} ${dollarUnit}`;
    if (cents) return `${cents} ${centUnit}`;
    return "zero dollars";
  });
  // ([0-9]+\.[0-9]+) → decimal point
  text = text.replace(/\d+\.\d+/g, (m) => m.replace(".", " point "));
  // ordinals: [0-9]+(st|nd|rd|th)
  text = text.replace(/\d+(st|nd|rd|th)/g, (m) =>
    ordinalWords(Number(m.replace(/(st|nd|rd|th)$/, ""))),
  );
  // bare integers
  text = text.replace(/\d+/g, (m) => expandBareNumber(Number(m)));
  return text;
}

// ---- abbreviations (synthesizer/utils/cleaners.py) -------------------------

const ABBREVIATIONS: ReadonlyArray<[RegExp, string]> = [
  [/\bmrs\./gi, "misess"],
  [/\bmr\./gi, "mister"],
  [/\bdr\./gi, "doctor"],
  [/\bst\./gi, "saint"],
  [/\bco\./gi, "company"],
  [/\bjr\./gi, "junior"],
  [/\bmaj\./gi, "major"],
  [/\bgen\./gi, "general"],
  [/\bdrs\./gi, "doctors"],
  [/\brev\./gi, "reverend"],
  [/\blt\./gi, "lieutenant"],
  [/\bhon\./gi, "honorable"],
  [/\bsgt\./gi, "sergeant"],
  [/\bcapt\./gi, "captain"],
  [/\besq\./gi, "esquire"],
  [/\bltd\./gi, "limited"],
  [/\bcol\./gi, "colonel"],
  [/\bft\./gi, "fort"],
];

function expandAbbreviations(text: string): string {
  for (const [regex, replacement] of ABBREVIATIONS) {
    text = text.replace(regex, replacement);
  }
  return text;
}

// ---- pipeline --------------------------------------------------------------

/**
 * `english_cleaners(text)` + `text_to_sequence(text, ["english_cleaners"])`:
 * returns the symbol-id sequence (EOS appended) the synthesizer graph
 * consumes. Symbols outside the 66-character table are skipped, exactly like
 * the reference's `_should_keep_symbol`.
 */
export function textToSequence(input: string): number[] {
  const cleaned = expandAbbreviations(
    expandNumbers(
      convertToAscii(input)
        .toLowerCase(),
    ),
  ).replace(/\s+/g, " ");

  const sequence: number[] = [];
  for (const char of cleaned) {
    const id = SYMBOL_TO_ID.get(char);
    if (id !== undefined && shouldKeep(char)) {
      sequence.push(id);
    }
  }
  sequence.push(EOS_ID);
  return sequence;
}