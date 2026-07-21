import { describe, expect, test } from 'vitest'

import { isspace, lstrip } from '../utils'

const PYTHON_WHITESPACE =
  '\u0009\u000a\u000b\u000c\u000d' +
  '\u001c\u001d\u001e\u001f\u0020' +
  '\u0085\u00a0\u1680' +
  '\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a' +
  '\u2028\u2029\u202f\u205f\u3000'

describe('Python string whitespace parity', () => {
  test('lstrip removes Python-only information separators', () => {
    expect(lstrip('\u001c\u001d\u001e\u001fvalue')).toBe('value')
  })

  test('lstrip does not treat BOM or zero-width space as whitespace', () => {
    expect(lstrip('\ufeffvalue')).toBe('\ufeffvalue')
    expect(lstrip('\u200bvalue')).toBe('\u200bvalue')
  })

  test('isspace uses Python exact-set and empty-string semantics', () => {
    expect(PYTHON_WHITESPACE).toHaveLength(29)
    for (const character of PYTHON_WHITESPACE) {
      expect(isspace(character)).toBe(true)
    }

    expect(isspace(PYTHON_WHITESPACE)).toBe(true)
    expect(isspace('')).toBe(false)
    expect(isspace('\u0008')).toBe(false)
    expect(isspace('\u001b')).toBe(false)
    expect(isspace('\u0021')).toBe(false)
    expect(isspace('\u0084')).toBe(false)
    expect(isspace('\u0086')).toBe(false)
    expect(isspace('\ufeff')).toBe(false)
    expect(isspace('\u200b')).toBe(false)
    expect(isspace('\u3001')).toBe(false)
  })
})
