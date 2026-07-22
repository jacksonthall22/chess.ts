import { Move } from './index'

export const PGN_HEADER_NAME_REGEX =
  /^[A-Za-z0-9][A-Za-z0-9_+#=:-]*$/

export const parsePgnHeaderName = (value: unknown): string => {
  if (typeof value !== 'string' || !PGN_HEADER_NAME_REGEX.test(value)) {
    throw new TypeError(`Invalid PGN header name: ${String(value)}`)
  }
  return value
}

export const parsePgnHeaderValue = (value: unknown): string => {
  if (
    typeof value !== 'string' ||
    value.includes('\n') ||
    value.includes('\r')
  ) {
    throw new TypeError('PGN header values must be strings without line breaks')
  }
  return value
}

/** Parses the canonical UCI value stored on a structured child-node edge. */
export const parseGameMoveUci = (value: unknown): string => {
  if (typeof value !== 'string') {
    throw new TypeError('Child moveUci must be a canonical UCI string')
  }
  let canonical: string
  try {
    canonical = Move.fromUci(value).uci()
  } catch {
    throw new TypeError('Child moveUci must be a canonical UCI string')
  }
  if (canonical !== value) {
    throw new TypeError('Child moveUci must be a canonical UCI string')
  }
  return canonical
}
