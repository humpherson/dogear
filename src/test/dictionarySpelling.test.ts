import { expect, it } from 'vitest';
import { toUkDictionarySpelling } from '../services/dictionarySpelling';

it('converts common spelling families and their explicit inflections', () => {
  expect(
    toUkDictionarySpelling(
      'A colorful organization analyzes behavior in neighboring theaters, ' +
        'favoring gray fibers and modeling jewelry.',
    ),
  ).toBe(
    'A colourful organisation analyses behaviour in neighbouring theatres, ' +
      'favouring grey fibres and modelling jewellery.',
  );
});

it('preserves sentence case, capitals, punctuation and possessives', () => {
  expect(
    toUkDictionarySpelling(
      "Color: COLORS. A neighbor’s favorite; a traveler's honor.",
    ),
  ).toBe("Colour: COLOURS. A neighbour’s favourite; a traveller's honour.");
});

it('leaves ambiguous words, British spellings and embedded substrings alone', () => {
  const original =
    'Practice medicine; license software; a computer program; a parking meter. ' +
    'Colour, organise, size, prize, exercise, colourful, metacenter, coloré and recolor.';
  expect(toUkDictionarySpelling(original)).toBe(original);
});

it('preserves URLs, email addresses, Unicode text and unusual brand casing', () => {
  const original =
    'https://example.com/color?flavor=gray www.example.com/center ' +
    'color@example.com ColorSync iColor café 日本語';
  expect(toUkDictionarySpelling(original)).toBe(original);
});

it('is stable on repeated conversion and handles ordinary object property names', () => {
  const result = toUkDictionarySpelling(
    'Color and behavior; constructor prototype toString.',
  );
  expect(result).toBe('Colour and behaviour; constructor prototype toString.');
  expect(toUkDictionarySpelling(result)).toBe(result);
});
