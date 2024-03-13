/**
 * A chess library with move generation and validation,
 * Polyglot opening book probing, PGN reading and writing,
 * Gaviota tablebase probing,
 * Syzygy tablebase probing, and XBoard/UCI engine communication.
 *
 * All credit goes to the authors of the python-chess library.
 * This is a direct port of their excellent library to TypeScript.
 */

/** ========== Custom declarations (no mirror in python-chess) ========== */

import * as utils from './utils';


export type RankOrFileIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;


/** Allow the truthy/falsy indexing trick, like `this.occupiedCo[colorIdx(WHITE)]` */
export const colorIdx = (color: Color): 1 | 0 => utils.boolToNumber(color);



/** ========== Direct transpilation ========== */

export const __author__ = 'Niklas Fiekas';
export const __email__ = 'niklas.fiekas@backscattering.de';
export const __version__ = '1.10.0';

export const __transpilerAuthor__ = 'Jackson Thurner Hall';
export const __transpiledVersion__ = '0.0.1';

export type EnPassantSpec = 'legal' | 'fen' | 'xfen';

export type Color = boolean;
export const [WHITE, BLACK] = [true, false];
export const COLORS: Color[] = [WHITE, BLACK];
export type ColorName = 'white' | 'black';
export const COLOR_NAMES: ColorName[] = ['white', 'black'];

export const enum PieceType {
  PAWN = 1,
  KNIGHT, // = 2, etc.
  BISHOP,
  ROOK,
  QUEEN,
  KING,
}
export const PIECE_TYPES: PieceType[] = Array.from({ length: 6 }, (_, i) => i + 1);
export const [PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING] = PIECE_TYPES;
export const PIECE_SYMBOLS: (string | null)[] = [null, 'p', 'n', 'b', 'r', 'q', 'k'];
export const PIECE_NAMES: (string | null)[] = [
  null,
  'pawn',
  'knight',
  'bishop',
  'rook',
  'queen',
  'king',
];

export const pieceSymbol = (pieceType: PieceType) => {
  return PIECE_SYMBOLS[pieceType] as string;
};

export const pieceName = (pieceType: PieceType) => {
  return PIECE_NAMES[pieceType] as string;
};

export const UNICODE_PIECE_SYMBOLS: { [key: string]: string } = {
  R: '♖',
  r: '♜',
  N: '♘',
  n: '♞',
  B: '♗',
  b: '♝',
  Q: '♕',
  q: '♛',
  K: '♔',
  k: '♚',
  P: '♙',
  p: '♟',
};

export const FILE_NAMES: string[] = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

export const RANK_NAMES: string[] = ['1', '2', '3', '4', '5', '6', '7', '8'];

/** The FEN for the standard chess starting position. */
export const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** The board part of the FEN for the standard chess starting position. */
export const STARTING_BOARD_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';

export const enum Status {
  VALID = 0,
  NO_WHITE_KING = 1 << 0,
  NO_BLACK_KING = 1 << 1,
  TOO_MANY_KINGS = 1 << 2,
  TOO_MANY_WHITE_PAWNS = 1 << 3,
  TOO_MANY_BLACK_PAWNS = 1 << 4,
  PAWNS_ON_BACKRANK = 1 << 5,
  TOO_MANY_WHITE_PIECES = 1 << 6,
  TOO_MANY_BLACK_PIECES = 1 << 7,
  BAD_CASTLING_RIGHTS = 1 << 8,
  INVALID_EP_SQUARE = 1 << 9,
  OPPOSITE_CHECK = 1 << 10,
  EMPTY = 1 << 11,
  RACE_CHECK = 1 << 12,
  RACE_OVER = 1 << 13,
  RACE_MATERIAL = 1 << 14,
  TOO_MANY_CHECKERS = 1 << 15,
  IMPOSSIBLE_CHECK = 1 << 16,
}

export const STATUS_VALID = Status.VALID;
export const STATUS_NO_WHITE_KING = Status.NO_WHITE_KING;
export const STATUS_NO_BLACK_KING = Status.NO_BLACK_KING;
export const STATUS_TOO_MANY_KINGS = Status.TOO_MANY_KINGS;
export const STATUS_TOO_MANY_WHITE_PAWNS = Status.TOO_MANY_WHITE_PAWNS;
export const STATUS_TOO_MANY_BLACK_PAWNS = Status.TOO_MANY_BLACK_PAWNS;
export const STATUS_PAWNS_ON_BACKRANK = Status.PAWNS_ON_BACKRANK;
export const STATUS_TOO_MANY_WHITE_PIECES = Status.TOO_MANY_WHITE_PIECES;
export const STATUS_TOO_MANY_BLACK_PIECES = Status.TOO_MANY_BLACK_PIECES;
export const STATUS_BAD_CASTLING_RIGHTS = Status.BAD_CASTLING_RIGHTS;
export const STATUS_INVALID_EP_SQUARE = Status.INVALID_EP_SQUARE;
export const STATUS_OPPOSITE_CHECK = Status.OPPOSITE_CHECK;
export const STATUS_EMPTY = Status.EMPTY;
export const STATUS_RACE_CHECK = Status.RACE_CHECK;
export const STATUS_RACE_OVER = Status.RACE_OVER;
export const STATUS_RACE_MATERIAL = Status.RACE_MATERIAL;
export const STATUS_TOO_MANY_CHECKERS = Status.TOO_MANY_CHECKERS;
export const STATUS_IMPOSSIBLE_CHECK = Status.IMPOSSIBLE_CHECK;

/**
 * Enum with reasons for a game to be over.
 */
export enum Termination {
  /** See :func:`chess.Board.isCheckmate()`. */
  CHECKMATE,
  /** See :func:`chess.Board.isStalemate()`. */
  STALEMATE,
  /** See :func:`chess.Board.isInsufficientMaterial()`. */
  INSUFFICIENT_MATERIAL,
  /** See :func:`chess.Board.isSeventyfiveMoves()`. */
  SEVENTYFIVE_MOVES,
  /** See :func:`chess.Board.isFivefoldRepetition()`. */
  FIVEFOLD_REPETITION,
  /** See :func:`chess.Board.canClaimFiftyMoves()`. */
  FIFTY_MOVES,
  /** See :func:`chess.Board.canClaimThreefoldRepetition()`. */
  THREEFOLD_REPETITION,
  /** See :func:`chess.Board.isVariantWin()`. */
  VARIANT_WIN,
  /** See :func:`chess.Board.isVariantLoss()`. */
  VARIANT_LOSS,
  /** See :func:`chess.Board.isVariantDraw()`. */
  VARIANT_DRAW,
}

/**
 * Information about the outcome of an ended game, usually obtained from
 * :func:`chess.Board.outcome()`.
 */
export class Outcome {
  termination: Termination;
  /** The reason for the game to have ended. */

  winner: Color | null;
  /** The winning color or ``null`` if drawn. */

  constructor(termination: Termination, winner: Color | null) {
    this.termination = termination;
    this.winner = winner;
  }

  /**
   * Returns ``1-0``, ``0-1`` or ``1/2-1/2``.
   */
  result(): '1-0' | '0-1' | '1/2-1/2' {
    return this.winner === null ? '1/2-1/2' : this.winner ? '1-0' : '0-1';
  }
}

/**
 * Raised when move notation is not syntactically valid
 */
export class InvalidMoveError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'InvalidMoveError';
    Object.setPrototypeOf(this, InvalidMoveError.prototype);
  }
}

/**
 * Raised when the attempted move is illegal in the current position
 */
export class IllegalMoveError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'IllegalMoveError';
    Object.setPrototypeOf(this, IllegalMoveError.prototype);
  }
}

/**
 * Raised when the attempted move is ambiguous in the current position
 */
export class AmbiguousMoveError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'AmbiguousMoveError';
    Object.setPrototypeOf(this, AmbiguousMoveError.prototype);
  }
}

// prettier-ignore
export const enum Square { // Instead of `Square = number`
  A1, B1, C1, D1, E1, F1, G1, H1,
  A2, B2, C2, D2, E2, F2, G2, H2,
  A3, B3, C3, D3, E3, F3, G3, H3,
  A4, B4, C4, D4, E4, F4, G4, H4,
  A5, B5, C5, D5, E5, F5, G5, H5,
  A6, B6, C6, D6, E6, F6, G6, H6,
  A7, B7, C7, D7, E7, F7, G7, H7,
  A8, B8, C8, D8, E8, F8, G8, H8,
}
export const SQUARES = Array.from(utils.range(64)) as Square[];
// prettier-ignore
export const [
  A1, B1, C1, D1, E1, F1, G1, H1,
  A2, B2, C2, D2, E2, F2, G2, H2,
  A3, B3, C3, D3, E3, F3, G3, H3,
  A4, B4, C4, D4, E4, F4, G4, H4,
  A5, B5, C5, D5, E5, F5, G5, H5,
  A6, B6, C6, D6, E6, F6, G6, H6,
  A7, B7, C7, D7, E7, F7, G7, H7,
  A8, B8, C8, D8, E8, F8, G8, H8,
] = SQUARES;

export const SQUARE_NAMES = RANK_NAMES.flatMap(r => FILE_NAMES.map(f => f + r));

/**
 * Gets the square index for the given square *name*
 * (e.g., ``a1`` returns ``0``).
 *
 * @throws :exc:`Error` if the square name is invalid.
 */
export const parseSquare = (name: string): Square => {
  const idx = SQUARE_NAMES.indexOf(name);
  if (idx === -1) {
    throw new Error(`Invalid square name ${name}`);
  }
  return idx as Square;
};

/**
 * Gets the name of the square, like ``a3``.
 */
export const squareName = (square: Square): string => {
  return SQUARE_NAMES[square];
};

/**
 * Gets a square number by file and rank index.
 */
export const square = (
  fileIndex: RankOrFileIndex,
  rankIndex: RankOrFileIndex,
): Square => {
  return (rankIndex * 8 + fileIndex) as Square;
};

/**
 * Gets the file index of the square where ``0`` is the a-file.
 */
export const squareFile = (square: Square): RankOrFileIndex => {
  return (square & 7) as RankOrFileIndex;
};

/**
 * Gets the rank index of the square where ``0`` is the first rank.
 */
export const squareRank = (square: Square): RankOrFileIndex => {
  return (square >> 3) as RankOrFileIndex;
};

/**
 * Gets the Chebyshev distance (i.e., the number of king steps) from square *a* to *b*.
 */
export const squareDistance = (a: Square, b: Square): number => {
  return Math.max(
    Math.abs(squareFile(a) - squareFile(b)),
    Math.abs(squareRank(a) - squareRank(b)),
  );
};

/**
 * Gets the Manhattan/Taxicab distance (i.e., the number of orthogonal king steps) from square *a* to *b*.
 */
export const squareManhattanDistance = (a: Square, b: Square): number => {
  return (
    Math.abs(squareFile(a) - squareFile(b)) +
    Math.abs(squareRank(a) - squareRank(b))
  );
};

/**
 * Gets the Knight distance (i.e., the number of knight moves) from square *a* to *b*.
 */
export const squareKnightDistance = (a: Square, b: Square): number => {
  const dx = Math.abs(squareFile(a) - squareFile(b));
  const dy = Math.abs(squareRank(a) - squareRank(b));

  if (dx + dy === 1) {
    return 3;
  } else if (dx === dy && dy == 2) {
    return 4;
  } else if (dx === dy && dy == 1) {
    if (BB_SQUARES[a] & BB_CORNERS || BB_SQUARES[b] & BB_CORNERS) {
      // Special case only for corner squares
      return 4;
    }
  }

  const m = Math.ceil(Math.max(dx / 2, dy / 2, (dx + dy) / 3));
  return m + ((m + dx + dy) % 2);
};

/**
 * Mirrors the square vertically.
 */
export const squareMirror = (square: Square): Square => {
  return square ^ (0x38 as Square);
};

export const SQUARES_180 = SQUARES.map(squareMirror);

export type Bitboard = bigint;
export const BB_EMPTY = 0n;
export const BB_ALL = 0xffff_ffff_ffff_ffffn;

export const BB_SQUARES = SQUARES.map(s => 1n << BigInt(s));
// prettier-ignore
export const [
  BB_A1, BB_B1, BB_C1, BB_D1, BB_E1, BB_F1, BB_G1, BB_H1,
  BB_A2, BB_B2, BB_C2, BB_D2, BB_E2, BB_F2, BB_G2, BB_H2,
  BB_A3, BB_B3, BB_C3, BB_D3, BB_E3, BB_F3, BB_G3, BB_H3,
  BB_A4, BB_B4, BB_C4, BB_D4, BB_E4, BB_F4, BB_G4, BB_H4,
  BB_A5, BB_B5, BB_C5, BB_D5, BB_E5, BB_F5, BB_G5, BB_H5,
  BB_A6, BB_B6, BB_C6, BB_D6, BB_E6, BB_F6, BB_G6, BB_H6,
  BB_A7, BB_B7, BB_C7, BB_D7, BB_E7, BB_F7, BB_G7, BB_H7,
  BB_A8, BB_B8, BB_C8, BB_D8, BB_E8, BB_F8, BB_G8, BB_H8,
] = BB_SQUARES;

export const BB_CORNERS = BB_A1 | BB_H1 | BB_A8 | BB_H8;
export const BB_CENTER = BB_D4 | BB_E4 | BB_D5 | BB_E5;

export const BB_LIGHT_SQUARES = 0x55aa_55aa_55aa_55aan;
export const BB_DARK_SQUARES = 0xaa55_aa55_aa55_aa55n;

export const BB_FILES = Array.from(utils.range(8)).map(
  i => 0x0101_0101_0101_0101n << BigInt(i),
);
export const [
  BB_FILE_A,
  BB_FILE_B,
  BB_FILE_C,
  BB_FILE_D,
  BB_FILE_E,
  BB_FILE_F,
  BB_FILE_G,
  BB_FILE_H,
] = BB_FILES;

export const BB_RANKS = Array.from(utils.range(8)).map(i => 0xffn << BigInt(8 * i));
export const [
  BB_RANK_1,
  BB_RANK_2,
  BB_RANK_3,
  BB_RANK_4,
  BB_RANK_5,
  BB_RANK_6,
  BB_RANK_7,
  BB_RANK_8,
] = BB_RANKS;

export const BB_BACKRANKS = BB_RANK_1 | BB_RANK_8;

export const lsb = (bb: Bitboard): Square => {
  return utils.bitLength(bb & -bb) - 1;
};

export function* scanForward(bb: Bitboard): IterableIterator<Square> {
  while (bb) {
    let r = bb & -bb;
    yield (utils.bitLength(r) - 1) as Square;
    bb ^= r;
  }
}

export const msb = (bb: Bitboard): Square => {
  return (utils.bitLength(bb) - 1) as Square;
};

export function* scanReversed(bb: Bitboard): IterableIterator<Square> {
  while (bb) {
    let r = utils.bitLength(bb) - 1;
    yield r as Square;
    bb ^= BB_SQUARES[r];
  }
}

export const popcount = (bb: Bitboard): number => utils.bitCount(bb);

export const flipVertical = (bb: Bitboard): Bitboard => {
  // https://www.chessprogramming.org/Flipping_Mirroring_and_Rotating#FlipVertically
  bb =
    ((bb >> 8n) & 0x00ff_00ff_00ff_00ffn) |
    ((bb & 0x00ff_00ff_00ff_00ffn) << 8n);
  bb =
    ((bb >> 16n) & 0x0000_ffff_0000_ffffn) |
    ((bb & 0x0000_ffff_0000_ffffn) << 16n);
  bb = (bb >> 32n) | ((bb & 0x0000_0000_ffff_ffffn) << 32n);
  return bb;
};

export const flipHorizontal = (bb: Bitboard): Bitboard => {
  // https://www.chessprogramming.org/Flipping_Mirroring_and_Rotating#MirrorHorizontally
  bb =
    ((bb >> 1n) & 0x5555_5555_5555_5555n) |
    ((bb & 0x5555_5555_5555_5555n) << 1n);
  bb =
    ((bb >> 2n) & 0x3333_3333_3333_3333n) |
    ((bb & 0x3333_3333_3333_3333n) << 2n);
  bb =
    ((bb >> 4n) & 0x0f0f_0f0f_0f0f_0f0fn) |
    ((bb & 0x0f0f_0f0f_0f0f_0f0fn) << 4n);
  return bb;
};

export const flipDiagonal = (bb: Bitboard): Bitboard => {
  // https://www.chessprogramming.org/Flipping_Mirroring_and_Rotating#FlipabouttheDiagonal
  let t = (bb ^ (bb << 28n)) & 0x0f0f_0f0f_0000_0000n;
  bb = bb ^ t ^ (t >> 28n);
  t = (bb ^ (bb << 14n)) & 0x3333_0000_3333_0000n;
  bb = bb ^ t ^ (t >> 14n);
  t = (bb ^ (bb << 7n)) & 0x5500_5500_5500_5500n;
  bb = bb ^ t ^ (t >> 7n);
  return bb;
};

export const flipAntiDiagonal = (bb: Bitboard): Bitboard => {
  // https://www.chessprogramming.org/Flipping_Mirroring_and_Rotating#FlipabouttheAntidiagonal
  let t = bb ^ (bb << 36n);
  bb = bb ^ ((t ^ (bb >> 36n)) & 0xf0f0_f0f0_0f0f_0f0fn);
  t = (bb ^ (bb << 18n)) & 0xcccc_0000_cccc_0000n;
  bb = bb ^ t ^ (t >> 18n);
  t = (bb ^ (bb << 9n)) & 0xaa00_aa00_aa00_aa00n;
  bb = bb ^ t ^ (t >> 9n);
  return bb;
};

export const shiftDown = (b: Bitboard): Bitboard => {
  return b >> 8n;
};

export const shift2Down = (b: Bitboard): Bitboard => {
  return b >> 16n;
};

export const shiftUp = (b: Bitboard): Bitboard => {
  return (b << 8n) & BB_ALL;
};

export const shift2Up = (b: Bitboard): Bitboard => {
  return (b << 16n) & BB_ALL;
};

export const shiftRight = (b: Bitboard): Bitboard => {
  return (b << 1n) & ~BB_FILE_A & BB_ALL;
};

export const shift2Right = (b: Bitboard): Bitboard => {
  return (b << 2n) & ~BB_FILE_A & ~BB_FILE_B & BB_ALL;
};

export const shiftLeft = (b: Bitboard): Bitboard => {
  return (b >> 1n) & ~BB_FILE_H;
};

export const shift2Left = (b: Bitboard): Bitboard => {
  return (b >> 2n) & ~BB_FILE_G & ~BB_FILE_H;
};

export const shiftUpLeft = (b: Bitboard): Bitboard => {
  return (b << 7n) & ~BB_FILE_H & BB_ALL;
};

export const shiftUpRight = (b: Bitboard): Bitboard => {
  return (b << 9n) & ~BB_FILE_A & BB_ALL;
};

export const shiftDownLeft = (b: Bitboard): Bitboard => {
  return (b >> 9n) & ~BB_FILE_H;
};

export const shiftDownRight = (b: Bitboard): Bitboard => {
  return (b >> 7n) & ~BB_FILE_A;
};

export const _slidingAttacks = (
  square: Square,
  occupied: Bitboard,
  deltas: number[],
) => {
  let attacks = BB_EMPTY;

  for (const delta of deltas) {
    let sq = square;

    while (true) {
      sq += delta;
      if (!(0 <= sq && sq < 64) || squareDistance(sq, sq - delta) > 2) {
        break;
      }

      attacks |= BB_SQUARES[sq];

      if (occupied & BB_SQUARES[sq]) {
        break;
      }
    }
  }

  return attacks;
};

export const _stepAttacks = (square: Square, deltas: number[]): Bitboard => {
  return _slidingAttacks(square, BB_ALL, deltas);
};

export const BB_KNIGHT_ATTACKS = SQUARES.map(sq =>
  _stepAttacks(sq, [17, 15, 10, 6, -17, -15, -10, -6]),
);
export const BB_KING_ATTACKS = SQUARES.map(sq =>
  _stepAttacks(sq, [9, 8, 7, 1, -9, -8, -7, -1]),
);
export const BB_PAWN_ATTACKS = [
  [-7, -9],
  [7, 9],
].map(deltas => SQUARES.map(sq => _stepAttacks(sq, deltas)));

export const _edges = (square: Square): Bitboard => {
  return (
    ((BB_RANK_1 | BB_RANK_8) & ~BB_RANKS[squareRank(square)]) |
    ((BB_FILE_A | BB_FILE_H) & ~BB_FILES[squareFile(square)])
  );
};

export function* _carryRippler(mask: Bitboard): IterableIterator<Bitboard> {
  // # Carry-Rippler trick to iterate subsets of mask.
  let subset = BB_EMPTY;
  while (true) {
    yield subset;

    subset = (subset - mask) & mask;
    if (!subset) {
      break;
    }
  }
}

export const _attackTable = (
  deltas: number[],
): [Bitboard[], Map<Bitboard, Bitboard>[]] => {
  const maskTable: Bitboard[] = [];
  const attackTable: Map<Bitboard, Bitboard>[] = [];

  for (const square of SQUARES) {
    const attacks = new Map<Bitboard, Bitboard>();

    const mask =
      _slidingAttacks(square, 0n as Bitboard, deltas) & ~_edges(square);
    for (const subset of _carryRippler(mask)) {
      attacks.set(subset, _slidingAttacks(square, subset, deltas));
    }

    attackTable.push(attacks);
    maskTable.push(mask);
  }

  return [maskTable, attackTable];
}

export const [BB_DIAG_MASKS, BB_DIAG_ATTACKS] = _attackTable([-9, -7, 7, 9]);
export const [BB_FILE_MASKS, BB_FILE_ATTACKS] = _attackTable([-8, 8]);
export const [BB_RANK_MASKS, BB_RANK_ATTACKS] = _attackTable([-1, 1]);

export const _rays = (): Bitboard[][] => {
  let rays: Bitboard[][] = [];
  BB_SQUARES.forEach((bbA, a) => {
    let raysRow: Bitboard[] = [];
    BB_SQUARES.forEach((bbB, b) => {
      if ((BB_DIAG_ATTACKS[a].get(0n) as Bitboard) & bbB) {
        raysRow.push(
          ((BB_DIAG_ATTACKS[a].get(0n) as Bitboard) &
            (BB_DIAG_ATTACKS[b].get(0n) as Bitboard)) |
            bbA |
            bbB,
        );
      } else if ((BB_RANK_ATTACKS[a].get(0n) as Bitboard) & bbB) {
        raysRow.push((BB_RANK_ATTACKS[a].get(0n) as Bitboard) | bbA);
      } else if ((BB_FILE_ATTACKS[a].get(0n) as Bitboard) & bbB) {
        raysRow.push((BB_FILE_ATTACKS[a].get(0n) as Bitboard) | bbA);
      } else {
        raysRow.push(BB_EMPTY);
      }
    });
    rays.push(raysRow);
  });

  return rays;
};

export const BB_RAYS = _rays();

export const ray = (a: Square, b: Square): Bitboard => {
  return BB_RAYS[a][b];
};

export const between = (a: Square, b: Square): Bitboard => {
  const bb = BB_RAYS[a][b] & ((BB_ALL << BigInt(a)) ^ (BB_ALL << BigInt(b)));
  return bb & (bb - 1n);
};

export const SAN_REGEX =
  /^([NBKRQ])?([a-h])?([1-8])?[\\-x]?([a-h][1-8])(=?[nbrqkNBRQK])?[\\+#]?$/;

export const FEN_CASTLING_REGEX = /^(?:-|[KQABCDEFGH]{0,2}[kqabcdefgh]{0,2})$/;

/**
 * A piece with type and color.
 */
export class Piece {
  /** The piece type. */
  pieceType: PieceType;

  /** The piece color. */
  color: Color;

  constructor(pieceType: PieceType, color: Color) {
    this.pieceType = pieceType;
    this.color = color;
  }

  /**
   * Gets the symbol ``P``, ``N``, ``B``, ``R``, ``Q`` or ``K`` for white
   * pieces or the lower-case variants for the black pieces.
   */
  symbol(): string {
    const symbol = pieceSymbol(this.pieceType);
    return this.color ? symbol.toUpperCase() : symbol;
  }

  /**
   * Gets the Unicode character for the piece.
   */
  unicodeSymbol(
    { invertColor }: { invertColor: boolean } = { invertColor: false },
  ): string {
    const swapcase = (symbol: string) =>
      symbol === symbol.toUpperCase()
        ? symbol.toLowerCase()
        : symbol.toUpperCase();
    const symbol = invertColor ? swapcase(this.symbol()) : this.symbol();
    return UNICODE_PIECE_SYMBOLS[symbol];
  }

  hash(): number {
    return this.pieceType + (this.color ? -1 : 5);
  }

  toString(): string {
    return this.symbol();
  }

  toRepr(): string {
    return `Piece.fromSymbol(${this.symbol()})`;
  }

  _reprSvg_(): string {
    // todo
    throw new Error('Not implemented');
  }

  static fromSymbol(symbol: string): Piece {
    return new Piece(
      PIECE_SYMBOLS.indexOf(symbol.toLowerCase()),
      symbol === symbol.toUpperCase(),
    );
  }
}

/**
 * Represents a move from a square to a square and possibly the promotion
 * piece type.
 *
 * Drops and null moves are supported.
 */
export class Move {
  /** The source square. */
  fromSquare: Square;

  /** The target square. */
  toSquare: Square;

  /** The promotion piece type or ``null``. */
  promotion: PieceType | null;

  /** The drop piece type or ``null``. */
  drop: PieceType | null;

  constructor(
    fromSquare: Square,
    toSquare: Square,
    {
      promotion = null,
      drop = null,
    }: { promotion?: PieceType | null; drop?: PieceType | null } = {},
  ) {
    this.fromSquare = fromSquare;
    this.toSquare = toSquare;
    this.promotion = promotion;
    this.drop = drop;
  }

  /**
   * Gets a UCI string for the move.
   *
   * For example, a move from a7 to a8 would be ``a7a8`` or ``a7a8q``
   * (if the latter is a promotion to a queen).
   *
   * The UCI representation of a null move is ``0000``.
   */
  uci(): string {
    if (this.drop) {
      return (
        pieceSymbol(this.drop).toUpperCase() + '@' + SQUARE_NAMES[this.toSquare]
      );
    } else if (this.promotion) {
      return (
        SQUARE_NAMES[this.fromSquare] +
        SQUARE_NAMES[this.toSquare] +
        pieceSymbol(this.promotion)
      );
    } else if (this.bool()) {
      return SQUARE_NAMES[this.fromSquare] + SQUARE_NAMES[this.toSquare];
    } else {
      return '0000';
    }
  }

  xboard(): string {
    return this.bool() ? this.uci() : '@@@@';
  }

  bool(): boolean {
    return utils.bool(
      this.fromSquare ||
        this.toSquare ||
        this.promotion !== null ||
        this.drop !== null,
    );
  }

  toRepr(): string {
    return `Move.fromUci(${this.uci()})`;
  }

  toString(): string {
    return this.uci();
  }

  copy(): Move {
    // NOTE: No python-chess mirror, included for convenience
    return new Move(this.fromSquare, this.toSquare, {
      promotion: this.promotion,
      drop: this.drop,
    });
  }

  /**
   * Parses a UCI string.
   *
   * @thrwos :exc:`InvalidMoveError` if the UCI string is invalid.
   */
  static fromUci(uci: string): Move {
    if (uci == '0000') {
      return Move.null();
    } else if (uci.length == 4 && '@' == uci[1]) {
      const drop = PIECE_SYMBOLS.indexOf(uci[0].toLowerCase()) as
        | PieceType
        | -1;
      const square = SQUARE_NAMES.indexOf(uci.slice(2)) as Square | -1;
      if (drop === -1 || square === -1) {
        throw new InvalidMoveError(`invalid uci: ${uci}`);
      }
      return new Move(square, square, { drop });
    } else if (4 <= uci.length && uci.length <= 5) {
      const fromSquare = SQUARE_NAMES.indexOf(uci.slice(0, 2));
      const toSquare = SQUARE_NAMES.indexOf(uci.slice(2, 4));
      const promotion =
        uci.length == 5
          ? (PIECE_SYMBOLS.indexOf(uci[4]) as PieceType | -1)
          : null;
      if (fromSquare === -1 || toSquare === -1 || promotion === -1) {
        throw new InvalidMoveError(`invalid uci: {$uci}`);
      }
      if (fromSquare == toSquare) {
        throw new InvalidMoveError(
          `invalid uci (use 0000 for null moves): ${uci}`,
        );
      }
      return new Move(fromSquare, toSquare, { promotion });
    } else {
      throw new InvalidMoveError(
        `expected uci string to be of length 4 or 5: ${uci}`,
      );
    }
  }

  /**
   * Gets a null move.
   *
   * A null move just passes the turn to the other side (and possibly
   * forfeits en passant capturing). Null moves evaluate to ``False`` in
   * boolean contexts.
   *
   *      >>> import chess
   *      >>>
   *      >>> bool(chess.Move.null())
   *      False
   */
  static null(): Move {
    return new Move(0, 0);
  }
}

/**
 * A board representing the position of chess pieces. See
 * :class:`~chess.Board` for a full board with move generation.
 *
 * The board is initialized with the standard chess starting position, unless
 * otherwise specified in the optional *boardFen* argument. If *boardFen*
 * is ``null``, an empty board is created.
 */
export class BaseBoard {
  occupied: Bitboard;
  occupiedCo: [Bitboard, Bitboard];
  pawns: Bitboard;
  knights: Bitboard;
  bishops: Bitboard;
  rooks: Bitboard;
  queens: Bitboard;
  kings: Bitboard;
  promoted: Bitboard;

  constructor(boardFen: string | null = null) {
    this.occupiedCo = [BB_EMPTY, BB_EMPTY];

    // NOTE: We have to initialize these to avoid TS errors.
    //       The calls below will set them to the correct values.
    this.occupied = null!;
    this.pawns = null!;
    this.knights = null!;
    this.bishops = null!;
    this.rooks = null!;
    this.queens = null!;
    this.kings = null!;
    this.promoted = null!;

    if (boardFen === null) {
      this._clearBoard();
    } else if (boardFen === STARTING_BOARD_FEN) {
      this._resetBoard();
    } else {
      this._setBoardFen(boardFen);
    }
  }

  _resetBoard(): void {
    this.pawns = BB_RANK_2 | BB_RANK_7;
    this.knights = BB_B1 | BB_G1 | BB_B8 | BB_G8;
    this.bishops = BB_C1 | BB_F1 | BB_C8 | BB_F8;
    this.rooks = BB_CORNERS;
    this.queens = BB_D1 | BB_D8;
    this.kings = BB_E1 | BB_E8;

    this.promoted = BB_EMPTY;

    this.occupiedCo[colorIdx(WHITE)] = BB_RANK_1 | BB_RANK_2;
    this.occupiedCo[colorIdx(BLACK)] = BB_RANK_7 | BB_RANK_8;
    this.occupied = BB_RANK_1 | BB_RANK_2 | BB_RANK_7 | BB_RANK_8;
  }

  /**
   * Resets pieces to the starting position.
   *
   * :class:`~chess.Board` also resets the move stack, but not turn,
   * castling rights and move counters. Use :func:`chess.Board.reset()` to
   * fully restore the starting position.
   */
  resetBoard(): void {
    this._resetBoard();
  }

  _clearBoard(): void {
    this.pawns = BB_EMPTY;
    this.knights = BB_EMPTY;
    this.bishops = BB_EMPTY;
    this.rooks = BB_EMPTY;
    this.queens = BB_EMPTY;
    this.kings = BB_EMPTY;

    this.promoted = BB_EMPTY;

    this.occupiedCo[colorIdx(WHITE)] = BB_EMPTY;
    this.occupiedCo[colorIdx(BLACK)] = BB_EMPTY;
    this.occupied = BB_EMPTY;
  }

  /**
   * Clears the board.
   *
   * :class:`~chess.Board` also clears the move stack.
   */
  clearBoard(): void {
    this._clearBoard();
  }

  piecesMask(pieceType: PieceType, color: Color): Bitboard {
    let bb: Bitboard;
    if (pieceType === PAWN) {
      bb = this.pawns;
    } else if (pieceType === KNIGHT) {
      bb = this.knights;
    } else if (pieceType === BISHOP) {
      bb = this.bishops;
    } else if (pieceType === ROOK) {
      bb = this.rooks;
    } else if (pieceType === QUEEN) {
      bb = this.queens;
    } else if (pieceType === KING) {
      bb = this.kings;
    } else {
      throw new Error(`expected PieceType, got ${pieceType}`);
    }

    return bb & this.occupiedCo[colorIdx(color)];
  }

  /**
   * Gets pieces of the given type and color.
   *
   * Returns a :class:`set of squares <chess.SquareSet>`.
   */
  pieces(pieceType: PieceType, color: Color): SquareSet {
    return new SquareSet(this.piecesMask(pieceType, color));
  }

  /**
   * Gets the :class:`piece <chess.Piece>` at the given square.
   */
  pieceAt(square: Square): Piece | null {
    const pieceType = this.pieceTypeAt(square);
    if (pieceType !== null) {
      const mask = BB_SQUARES[square];
      const color = utils.bool(this.occupiedCo[colorIdx(WHITE)] & mask);
      return new Piece(pieceType, color);
    } else {
      return null;
    }
  }

  /**
   * Gets the piece type at the given square.
   */
  pieceTypeAt(square: Square): PieceType | null {
    const mask = BB_SQUARES[square];

    if (!(this.occupied & mask)) {
      return null; // Early return
    } else if (this.pawns & mask) {
      return PAWN;
    } else if (this.knights & mask) {
      return KNIGHT;
    } else if (this.bishops & mask) {
      return BISHOP;
    } else if (this.rooks & mask) {
      return ROOK;
    } else if (this.queens & mask) {
      return QUEEN;
    } else {
      return KING;
    }
  }

  /**
   * Gets the color of the piece at the given square.
   */
  colorAt(square: Square): Color | null {
    const mask = BB_SQUARES[square];
    if (this.occupiedCo[colorIdx(WHITE)] & mask) {
      return WHITE;
    } else if (this.occupiedCo[colorIdx(BLACK)] & mask) {
      return BLACK;
    } else {
      return null;
    }
  }

  /**
   * Finds the king square of the given side. Returns ``null`` if there
   * is no king of that color.
   *
   * In variants with king promotions, only non-promoted kings are
   * considered.
   */
  king(color: Color): Square | null {
    const kingMask =
      this.occupiedCo[colorIdx(color)] & this.kings & ~this.promoted;
    return kingMask ? msb(kingMask) : null;
  }

  attacksMask(square: Square): Bitboard {
    const bbSquare = BB_SQUARES[square];

    if (bbSquare & this.pawns) {
      const color = utils.bool(bbSquare & this.occupiedCo[colorIdx(WHITE)]);
      return BB_PAWN_ATTACKS[colorIdx(color)][square];
    } else if (bbSquare & this.knights) {
      return BB_KNIGHT_ATTACKS[square];
    } else if (bbSquare & this.kings) {
      return BB_KING_ATTACKS[square];
    } else {
      let attacks = 0n;
      if ((bbSquare & this.bishops) || (bbSquare & this.queens)) {
        attacks = BB_DIAG_ATTACKS[square].get(
          BB_DIAG_MASKS[square] & this.occupied,
        ) as Bitboard;
      }
      if ((bbSquare & this.rooks) || (bbSquare & this.queens)) {
        attacks |=
          (BB_RANK_ATTACKS[square].get(
            BB_RANK_MASKS[square] & this.occupied,
          ) as Bitboard) |
          (BB_FILE_ATTACKS[square].get(
            BB_FILE_MASKS[square] & this.occupied,
          ) as Bitboard);
      }
      return attacks;
    }
  }

  /**
   * Gets the set of attacked squares from the given square.
   *
   * There will be no attacks if the square is empty. Pinned pieces are
   * still attacking other squares.
   *
   * Returns a :class:`set of squares <chess.SquareSet>`.
   */
  attacks(square: Square): SquareSet {
    return new SquareSet(this.attacksMask(square));
  }

  _attackersMask(color: Color, square: Square, occupied: Bitboard): Bitboard {
    const rankPieces = BB_RANK_MASKS[square] & occupied;
    const filePieces = BB_FILE_MASKS[square] & occupied;
    const diagPieces = BB_DIAG_MASKS[square] & occupied;

    const queensAndRooks = this.queens | this.rooks;
    const queensAndBishops = this.queens | this.bishops;

    const attackers =
      (BB_KING_ATTACKS[square] & this.kings) |
      (BB_KNIGHT_ATTACKS[square] & this.knights) |
      ((BB_RANK_ATTACKS[square].get(rankPieces) as Bitboard) & queensAndRooks) |
      ((BB_FILE_ATTACKS[square].get(filePieces) as Bitboard) & queensAndRooks) |
      ((BB_DIAG_ATTACKS[square].get(diagPieces) as Bitboard) &
        queensAndBishops) |
      (BB_PAWN_ATTACKS[colorIdx(!color)][square] & this.pawns);

    return attackers & this.occupiedCo[colorIdx(color)];
  }

  attackersMask(color: Color, square: Square): Bitboard {
    return this._attackersMask(color, square, this.occupied);
  }

  /**
   * Checks if the given side attacks the given square.
   *
   * Pinned pieces still count as attackers. Pawns that can be captured
   * en passant are **not** considered attacked.
   */
  isAttackedBy(color: Color, square: Square): boolean {
    return utils.bool(this.attackersMask(color, square));
  }

  /**
   * Gets the set of attackers of the given color for the given square.
   *
   * Pinned pieces still count as attackers.
   *
   * Returns a :class:`set of squares <chess.SquareSet>`.
   */
  attackers(color: Color, square: Square): SquareSet {
    return new SquareSet(this.attackersMask(color, square));
  }

  pinMask(color: Color, square: Square): Bitboard {
    const king = this.king(color);
    if (king === null) {
      return BB_ALL;
    }

    const squareMask = BB_SQUARES[square];

    for (const [attacks, sliders] of [
      [BB_FILE_ATTACKS, this.rooks | this.queens],
      [BB_RANK_ATTACKS, this.rooks | this.queens],
      [BB_DIAG_ATTACKS, this.bishops | this.queens],
    ] as [Map<Bitboard, Bitboard>[], Bitboard][]) {
      const rays = attacks[king].get(0n) as Bitboard;
      if (rays & squareMask) {
        const snipers = rays & sliders & this.occupiedCo[colorIdx(!color)];
        for (const sniper of scanReversed(snipers)) {
          if (
            (between(sniper, king) & (this.occupied | squareMask)) ===
            squareMask
          ) {
            return ray(king, sniper);
          }
        }

        break;
      }
    }

    return BB_ALL;
  }

  /**
   * Detects an absolute pin (and its direction) of the given square to
   * the king of the given color.
   *
   *      >>> import chess
   *      >>>
   *      >>> board = chess.Board("rnb1k2r/ppp2ppp/5n2/3q4/1b1P4/2N5/PP3PPP/R1BQKBNR w KQkq - 3 7")
   *      >>> board.isPinned(chess.WHITE, chess.C3)
   *      True
   *      >>> direction = board.pin(chess.WHITE, chess.C3)
   *      >>> direction
   *      SquareSet(0x0000_0001_0204_0810)
   *      >>> print(direction)
   *      . . . . . . . .
   *      . . . . . . . .
   *      . . . . . . . .
   *      1 . . . . . . .
   *      . 1 . . . . . .
   *      . . 1 . . . . .
   *      . . . 1 . . . .
   *      . . . . 1 . . .
   *
   * Returns a :class:`set of squares <chess.SquareSet>` that mask the rank,
   * file or diagonal of the pin. If there is no pin, then a mask of the
   * entire board is returned.
   */
  pin(color: Color, square: Square): SquareSet {
    return new SquareSet(this.pinMask(color, square));
  }

  /**
   * Detects if the given square is pinned to the king of the given color.
   */
  isPinned(color: Color, square: Square): boolean {
    return this.pinMask(color, square) !== BB_ALL;
  }

  _removePieceAt(square: Square): PieceType | null {
    const pieceType = this.pieceTypeAt(square);
    const mask = BB_SQUARES[square];

    // prettier-ignore
    switch (pieceType) {
      case PAWN:
        this.pawns ^= mask; break;
      case KNIGHT:
        this.knights ^= mask; break;
      case BISHOP:
        this.bishops ^= mask; break;
      case ROOK:
        this.rooks ^= mask; break;
      case QUEEN:
        this.queens ^= mask; break;
      case KING:
        this.kings ^= mask; break;
      default:
        return null;
    }

    this.occupied ^= mask;
    this.occupiedCo[colorIdx(WHITE)] &= ~mask;
    this.occupiedCo[colorIdx(BLACK)] &= ~mask;

    this.promoted &= ~mask;

    return pieceType;
  }

  /**
   * Removes the piece from the given square. Returns the
   * :class:`Piece` or `null` if the square was already empty.
   *
   * :class:`Board` also clears the move stack.
   */
  removePieceAt(square: Square): Piece | null {
    const color = utils.bool(this.occupiedCo[colorIdx(WHITE)] & BB_SQUARES[square]);
    const pieceType = this._removePieceAt(square);
    return pieceType !== null ? new Piece(pieceType, color) : null;
  }

  _setPieceAt(
    square: Square,
    pieceType: PieceType,
    color: Color,
    promoted: boolean = false,
  ): void {
    this._removePieceAt(square);

    const mask = BB_SQUARES[square];

    // prettier-ignore
    switch (pieceType) {
      case PAWN:
        this.pawns |= mask; break;
      case KNIGHT:
        this.knights |= mask; break;
      case BISHOP:
        this.bishops |= mask; break;
      case ROOK:
        this.rooks |= mask; break;
      case QUEEN:
        this.queens |= mask; break;
      case KING:
        this.kings |= mask; break;
      default:
        return;
    }

    this.occupied ^= mask;
    this.occupiedCo[colorIdx(color)] ^= mask;

    if (promoted) {
      this.promoted ^= mask;
    }
  }

  /**
   * Sets a piece at the given square.
   *
   * An existing piece is replaced. Setting *piece* to `null` is
   * equivalent to :func:`~chess.Board.removePieceAt()`.
   *
   * :class:`~chess.Board` also clears the move stack.
   */
  setPieceAt(square: Square, piece: Piece | null, promoted: boolean = false) {
    if (piece === null) {
      this._removePieceAt(square);
    } else {
      this._setPieceAt(square, piece.pieceType, piece.color, promoted);
    }
  }

  /**
   * Gets the board FEN (e.g.,
   * ``rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR``).
   */
  boardFen({ promoted = false }: { promoted?: boolean | null } = {}): string {
    const builder: string[] = [];
    let empty = 0;

    for (const square of SQUARES_180) {
      const piece = this.pieceAt(square);

      if (!piece) {
        empty++;
      } else {
        if (empty) {
          builder.push(empty.toString());
          empty = 0;
        }
        builder.push(piece.symbol());
        if (promoted && BB_SQUARES[square] & this.promoted) {
          builder.push('~');
        }
      }

      if (BB_SQUARES[square] & BB_FILE_H) {
        if (empty) {
          builder.push(empty.toString());
          empty = 0;
        }

        if (square !== H1) {
          builder.push('/');
        }
      }
    }

    return builder.join('');
  }

  _setBoardFen(fen: string): void {
    // Compatibility with setFen().
    fen = fen.trim();
    if (fen.includes(' ')) {
      throw new Error(
        `ValueError: expected position part of fen, got multiple parts: ${fen}`,
      );
    }

    // Ensure the FEN is valid.
    const rows = fen.split('/');
    if (rows.length !== 8) {
      throw new Error(
        `ValueError: expected 8 rows in position part of fen: ${fen}`,
      );
    }

    // Validate each row.
    for (const row of rows) {
      let fieldSum = 0;
      let previousWasDigit = false;
      let previousWasPiece = false;

      for (const c of row) {
        if (['1', '2', '3', '4', '5', '6', '7', '8'].includes(c)) {
          if (previousWasDigit) {
            throw new Error(
              `ValueError: two subsequent digits in position part of fen: ${fen}`,
            );
          }
          fieldSum += parseInt(c);
          previousWasDigit = true;
          previousWasPiece = false;
        } else if (c === '~') {
          if (!previousWasPiece) {
            throw new Error(
              `ValueError: '~' not after piece in position part of fen: ${fen}`,
            );
          }
          previousWasDigit = false;
          previousWasPiece = false;
        } else if (PIECE_SYMBOLS.includes(c.toLowerCase())) {
          fieldSum += 1;
          previousWasDigit = false;
          previousWasPiece = true;
        } else {
          throw new Error(
            `ValueError: invalid character in position part of fen: ${fen}`,
          );
        }
      }

      if (fieldSum !== 8) {
        throw new Error(
          `ValueError: expected 8 columns per row in position part of fen: ${fen}`,
        );
      }
    }

    // Clear the board.
    this._clearBoard();

    // Put pieces on the board.
    let squareIndex = 0;
    for (const c of fen) {
      if (['1', '2', '3', '4', '5', '6', '7', '8'].includes(c)) {
        squareIndex += parseInt(c);
      } else if (PIECE_SYMBOLS.includes(c.toLowerCase())) {
        const piece = Piece.fromSymbol(c);
        this._setPieceAt(
          SQUARES_180[squareIndex],
          piece.pieceType,
          piece.color,
        );
        squareIndex += 1;
      } else if (c === '~') {
        this.promoted |= BB_SQUARES[SQUARES_180[squareIndex - 1]];
      }
    }
  }

  /**
   * Parses *fen* and sets up the board, where *fen* is the board part of
   * a FEN.
   *
   * :class:`~chess.Board` also clears the move stack.
   *
   * @throws Error if syntactically invalid.
   */
  setBoardFen(fen: string): void {
    this._setBoardFen(fen);
  }

  /**
   * Gets a dictionary of :class:`pieces <chess.Piece>` by square index.
   */
  pieceMap({ mask = BB_ALL }: { mask?: Bitboard } = {}): Map<Square, Piece> {
    const result: Map<Square, Piece> = new Map();
    for (const square of scanReversed(this.occupied & mask)) {
      result.set(square, this.pieceAt(square) as Piece);
    }
    return result;
  }

  _setPieceMap(pieceMap: Map<Square, Piece>): void {
    this._clearBoard();
    for (const [square, piece] of pieceMap) {
      this._setPieceAt(square, piece.pieceType, piece.color);
    }
  }

  /**
   * Sets up the board from a dictionary of :class:`pieces <chess.Piece>`
   * by square index.
   *
   * :class:`~chess.Board` also clears the move stack.
   */
  setPieceMap(pieceMap: Map<Square, Piece>): void {
    this._setPieceMap(pieceMap);
  }

  _setChess960Pos(scharnagl: number): void {
    if (!(0 <= scharnagl && scharnagl <= 959)) {
      throw new Error(
        `ValueError: chess960 position index not 0 <= {scharnagl} <= 959`,
      );
    }

    // See http://www.russellcottrell.com/Chess/Chess960.htm for
    // a description of the algorithm.
    let n: number, bw: number, bb: number, q: number;
    [n, bw] = utils.divmod(scharnagl, 4);
    [n, bb] = utils.divmod(n, 4);
    [n, q] = utils.divmod(n, 6);

    let n1: number = 0;
    let n2: number = 0;
    for (n1 of utils.range(0, 4)) {
      n2 = n + Math.floor(((3 - n1) * (4 - n1)) / 2) - 5;
      if (n1 < n2 && 1 <= n2 && n2 <= 4) {
        break;
      }
    }

    // Bishops.
    const bwFile = bw * 2 + 1;
    const bbFile = bb * 2;
    this.bishops = (BB_FILES[bwFile] | BB_FILES[bbFile]) & BB_BACKRANKS;

    // Queens.
    let qFile = q;
    qFile += utils.boolToNumber(Math.min(bwFile, bbFile) <= qFile);
    qFile += utils.boolToNumber(Math.max(bwFile, bbFile) <= qFile);
    this.queens = BB_FILES[qFile] & BB_BACKRANKS;

    const used = [bwFile, bbFile, qFile];

    // Knights.
    this.knights = BB_EMPTY;
    for (const i of utils.range(0, 8)) {
      if (!used.includes(i)) {
        if (n1 == 0 || n2 == 0) {
          this.knights |= BB_FILES[i] & BB_BACKRANKS;
          used.push(i);
        }
        n1 -= 1;
        n2 -= 1;
      }
    }

    // RKR.
    for (const i of utils.range(0, 8)) {
      if (!used.includes(i)) {
        this.rooks = BB_FILES[i] & BB_BACKRANKS;
        used.push(i);
        break;
      }
    }
    for (const i of utils.range(1, 8)) {
      if (~used.includes(i)) {
        this.kings = BB_FILES[i] & BB_BACKRANKS;
        used.push(i);
        break;
      }
    }
    for (const i of utils.range(2, 8)) {
      if (!used.includes(i)) {
        this.rooks |= BB_FILES[i] & BB_BACKRANKS;
        break;
      }
    }

    // Finalize.
    this.pawns = BB_RANK_2 | BB_RANK_7;
    this.occupiedCo[colorIdx(WHITE)] = BB_RANK_1 | BB_RANK_2;
    this.occupiedCo[colorIdx(BLACK)] = BB_RANK_7 | BB_RANK_8;
    this.occupied = BB_RANK_1 | BB_RANK_2 | BB_RANK_7 | BB_RANK_8;
    this.promoted = BB_EMPTY;
  }

  /**
   * Sets up a Chess960 starting position given its index between 0 and 959.
   * Also see :func:`~chess.BaseBoard.fromChess960Pos()`.
   */
  setChess960Pos(scharnagl: number): void {
    this._setChess960Pos(scharnagl);
  }

  /**
   * Gets the Chess960 starting position index between 0 and 959,
   * or ``None``.
   */
  chess960Pos(): number | null {
    if (this.occupiedCo[colorIdx(WHITE)] !== (BB_RANK_1 | BB_RANK_2)) {
      return null;
    }
    if (this.occupiedCo[colorIdx(BLACK)] !== (BB_RANK_7 | BB_RANK_8)) {
      return null;
    }
    if (this.pawns !== (BB_RANK_2 | BB_RANK_7)) {
      return null;
    }
    if (this.promoted) {
      return null;
    }

    // # Piece counts.
    const brnqk = [
      this.bishops,
      this.rooks,
      this.knights,
      this.queens,
      this.kings,
    ];
    if (
      brnqk.some((pieces, index) => popcount(pieces) !== [4, 4, 4, 2, 2][index])
    ) {
      return null;
    }

    // Symmetry.
    if (
      brnqk.some(pieces => (BB_RANK_1 & pieces) << 56n !== (BB_RANK_8 & pieces))
    ) {
      return null;
    }

    // Algorithm from ChessX, src/database/bitboard.cpp, r2254.
    let x = this.bishops & (2n + 8n + 32n + 128n);
    if (!x) {
      return null;
    }
    const bs1 = Math.floor((lsb(x) - 1) / 2);
    let ccPos = bs1;
    x = this.bishops & (1n + 4n + 16n + 64n);
    if (!x) {
      return null;
    }
    const bs2 = lsb(x) * 2;
    ccPos += bs2;

    let q = 0;
    let qf = false;
    let n0 = 0;
    let n1 = 0;
    let n0f = false;
    let n1f = false;
    let rf = 0;
    const n0s = [0, 4, 7, 9];
    for (const square of utils.range(A1, H1 + 1)) {
      const bb = BB_SQUARES[square];
      if (bb & this.queens) {
        qf = true;
      } else if (bb & this.rooks || bb & this.kings) {
        if (bb & this.kings) {
          if (rf !== 1) {
            return null;
          }
        } else {
          rf += 1;
        }

        if (!qf) {
          q += 1;
        }

        if (!n0f) {
          n0 += 1;
        } else if (!n1f) {
          n1 += 1;
        }
      } else if (bb & this.knights) {
        if (!qf) {
          q += 1;
        }

        if (!n0f) {
          n0f = true;
        } else if (!n1f) {
          n1f = true;
        }
      }
    }

    if (n0 < 4 && n1f && qf) {
      ccPos += q * 16;
      const krn = n0s[n0] + n1;
      ccPos += krn * 96;
      return ccPos;
    } else {
      return null;
    }
  }

  toRepr(): string {
    return `${typeof this}(${this.boardFen()})`;
  }

  toString(): string {
    const builder: string[] = [];

    for (const square of SQUARES_180) {
      const piece = this.pieceAt(square);

      if (piece !== null) {
        builder.push(piece.symbol());
      } else {
        builder.push('.');
      }

      if (BB_SQUARES[square] & BB_FILE_H) {
        if (square != H1) {
          builder.push('\n');
        }
      } else {
        builder.push(' ');
      }
    }

    return builder.join('');
  }

  /**
   * Returns a string representation of the board with Unicode pieces.
   * Useful for pretty-printing to a terminal.
   *
   * @param invertColor: Invert color of the Unicode pieces.
   * @param borders: Show borders and a coordinate margin.
   */
  unicode({
    invertColor = false,
    borders = true,
    emptySquare = '⭘',
    orientation = WHITE,
  }: {
    invertColor?: boolean;
    borders?: boolean;
    emptySquare?: string;
    orientation?: Color;
  } = {}): string {
    const builder: string[] = [];
    for (const rankIndex of (orientation
      ? utils.range(7, -1, -1)
      : utils.range(8)) as IterableIterator<RankOrFileIndex>) {
      if (borders) {
        builder.push('  ');
        builder.push('-'.repeat(17));
        builder.push('\n');

        builder.push(RANK_NAMES[rankIndex]);
        builder.push(' ');
      }

      for (const [i, fileIndex] of utils.enumerate(
        (orientation
          ? utils.range(8)
          : utils.range(7, -1, -1)) as IterableIterator<RankOrFileIndex>,
      )) {
        const squareIndex = square(fileIndex, rankIndex);

        if (borders) {
          builder.push('|');
        } else if (i > 0) {
          builder.push(' ');
        }

        const piece = this.pieceAt(squareIndex);

        if (piece) {
          builder.push(piece.unicodeSymbol({ invertColor: invertColor }));
        } else {
          builder.push(emptySquare);
        }
      }

      if (borders) {
        builder.push('|');
      }

      if (borders || (orientation ? rankIndex > 0 : rankIndex < 7)) {
        builder.push('\n');
      }
    }

    if (borders) {
      builder.push('  ');
      builder.push('-'.repeat(17));
      builder.push('\n');
      const letters = orientation ? 'a b c d e f g h' : 'h g f e d c b a';
      builder.push('   ' + letters);
    }

    return builder.join('');
  }

  _reprSvg(): string {
    // TODO
    throw new Error('Not implemented');
  }

  equals(board: any) {
    if (board instanceof BaseBoard) {
      return (
        this.occupied == board.occupied &&
        this.occupiedCo[colorIdx(WHITE)] == board.occupiedCo[colorIdx(WHITE)] &&
        this.pawns == board.pawns &&
        this.knights == board.knights &&
        this.bishops == board.bishops &&
        this.rooks == board.rooks &&
        this.queens == board.queens &&
        this.kings == board.kings
      );
    } else {
      return false;
    }
  }

  applyTransform(f: (board: Bitboard) => Bitboard): void {
    this.pawns = f(this.pawns);
    this.knights = f(this.knights);
    this.bishops = f(this.bishops);
    this.rooks = f(this.rooks);
    this.queens = f(this.queens);
    this.kings = f(this.kings);

    this.occupiedCo[colorIdx(WHITE)] = f(this.occupiedCo[colorIdx(WHITE)]);
    this.occupiedCo[colorIdx(BLACK)] = f(this.occupiedCo[colorIdx(BLACK)]);
    this.occupied = f(this.occupied);
    this.promoted = f(this.promoted);
  }

  /**
   * Returns a transformed copy of the board (without move stack)
   * by applying a bitboard transformation function.
   *
   * Available transformations include :func:`chess.flipVertical()`,
   * :func:`chess.flipHorizontal()`, :func:`chess.flipDiagonal()`,
   * :func:`chess.flipAntiDiagonal()`, :func:`chess.shiftDown()`,
   * :func:`chess.shiftUp()`, :func:`chess.shiftLeft()`, and
   * :func:`chess.shiftRight()`.
   *
   * Alternatively, :func:`~chess.BaseBoard.applyTransform()` can be used
   * to apply the transformation on the board.
   */
  transform(f: (board: Bitboard) => Bitboard): this {
    const board = this.copy();
    board.applyTransform(f);
    return board;
  }

  applyMirror() {
    this.applyTransform(flipVertical);
    [this.occupiedCo[colorIdx(WHITE)], this.occupiedCo[colorIdx(BLACK)]] = [
      this.occupiedCo[colorIdx(BLACK)],
      this.occupiedCo[colorIdx(WHITE)],
    ];
  }

  /**
   * Returns a mirrored copy of the board (without move stack).
   *
   * The board is mirrored vertically and piece colors are swapped, so that
   * the position is equivalent modulo color.
   *
   * Alternatively, :func:`~chess.BaseBoard.applyMirror()` can be used
   * to mirror the board.
   */
  mirror(): this {
    const board = this.copy();
    board.applyMirror();
    return board;
  }

  /**
   * Creates a copy of the board.
   */
  copy(): this {
    const board = new (this.constructor as new () => this)();

    board.pawns = this.pawns;
    board.knights = this.knights;
    board.bishops = this.bishops;
    board.rooks = this.rooks;
    board.queens = this.queens;
    board.kings = this.kings;

    board.occupiedCo[colorIdx(WHITE)] = this.occupiedCo[colorIdx(WHITE)];
    board.occupiedCo[colorIdx(BLACK)] = this.occupiedCo[colorIdx(BLACK)];
    board.occupied = this.occupied;
    board.promoted = this.promoted;

    return board;
  }

  // copy() already implemented

  // deepcopy() skipped

  /**
   * Creates a new empty board. Also see
   * :func:`~chess.BaseBoard.clearBoard()`.
   */
  static empty() {
    return new BaseBoard(null);
  }

  /**
   * Creates a new board, initialized with a Chess960 starting position.
   *
   *      >>> import chess
   *      >>> import random
   *      >>>
   *      >>> board = chess.Board.fromChess960Pos(random.randint(0, 959))
   */
  static fromChess960Pos(scharnagl: number): BaseBoard {
    const board = this.empty();
    board.setChess960Pos(scharnagl);
    return board;
  }
}

export class _BoardState<BoardT extends Board> {
  pawns: Bitboard;
  knights: Bitboard;
  bishops: Bitboard;
  rooks: Bitboard;
  queens: Bitboard;
  kings: Bitboard;
  occupiedW: Bitboard;
  occupiedB: Bitboard;
  occupied: Bitboard;
  promoted: Bitboard;
  turn: Color;
  castlingRights: Bitboard;
  epSquare: Square | null;
  halfmoveClock: number;
  fullmoveNumber: number;

  constructor(board: BoardT) {
    this.pawns = board.pawns;
    this.knights = board.knights;
    this.bishops = board.bishops;
    this.rooks = board.rooks;
    this.queens = board.queens;
    this.kings = board.kings;

    this.occupiedW = board.occupiedCo[colorIdx(WHITE)];
    this.occupiedB = board.occupiedCo[colorIdx(BLACK)];
    this.occupied = board.occupied;

    this.promoted = board.promoted;

    this.turn = board.turn;
    this.castlingRights = board.castlingRights;
    this.epSquare = board.epSquare;
    this.halfmoveClock = board.halfmoveClock;
    this.fullmoveNumber = board.fullmoveNumber;
  }

  restore(board: BoardT) {
    board.pawns = this.pawns;
    board.knights = this.knights;
    board.bishops = this.bishops;
    board.rooks = this.rooks;
    board.queens = this.queens;
    board.kings = this.kings;

    board.occupiedCo[colorIdx(WHITE)] = this.occupiedW;
    board.occupiedCo[colorIdx(BLACK)] = this.occupiedB;
    board.occupied = this.occupied;

    board.promoted = this.promoted;

    board.turn = this.turn;
    board.castlingRights = this.castlingRights;
    board.epSquare = this.epSquare;
    board.halfmoveClock = this.halfmoveClock;
    board.fullmoveNumber = this.fullmoveNumber;
  }
}

/**
 * A :class:`~chess.BaseBoard`, additional information representing
 * a chess position, and a :data:`move stack <chess.Board.moveStack>`.
 *
 * Provides :data:`move generation <chess.Board.legalMoves>`, validation,
 * :func:`parsing <chess.Board.parseSan()>`, attack generation,
 * :func:`game end detection <chess.Board.isGameOver()>`,
 * and the capability to :func:`make <chess.Board.push()>` and
 * :func:`unmake <chess.Board.pop()>` moves.
 *
 * The board is initialized to the standard chess starting position,
 * unless otherwise specified in the optional *fen* argument.
 * If *fen* is ``None``, an empty board is created.
 *
 * Optionally supports *chess960*. In Chess960, castling moves are encoded
 * by a king move to the corresponding rook square.
 * Use :func:`chess.Board.fromChess960Pfos()` to create a board with one
 * of the Chess960 starting positions.
 *
 * It's safe to set :data:`~Board.turn`, :data:`~Board.castlingRights`,
 * :data:`~Board.epSquare`, :data:`~Board.halfmoveClock` and
 * :data:`~Board.fullmoveNumber` directly.
 *
 * .. warning::
 *     It is possible to set up and work with invalid positions. In this
 *     case, :class:`~chess.Board` implements a kind of "pseudo-chess"
 *     (useful to gracefully handle errors or to implement chess variants).
 *     Use :func:`~chess.Board.isValid()` to detect invalid positions.
 */
export class Board extends BaseBoard {
  static aliases: string[] = [
    'Standard',
    'Chess',
    'Classical',
    'Normal',
    'Illegal',
    'From Position',
  ];
  static uciVariant: string | null = 'chess';
  static xboardVariant: string | null = 'normal';
  static startingFen: string = STARTING_FEN;

  static tbwSuffix: string | null = '.rtbw';
  static tbzSuffix: string | null = '.rtbz';
  static tbwMagic: Uint8Array | null = new Uint8Array([0x71, 0xe8, 0x23, 0x5d]);
  static tbzMagic: Uint8Array | null = new Uint8Array([0xd7, 0x66, 0x0c, 0xa5]);
  static pawnlessTbwSuffix: string | null = null;
  static pawnlessTbzSuffix: string | null = null;
  static pawnlessTbwMagic: Uint8Array | null = null;
  static pawnlessTbzMagic: Uint8Array | null = null;
  static connectedKings: boolean = false;
  static oneKing: boolean = true;
  static capturesCompulsory: boolean = false;

  /** The side to move (``chess.WHITE`` or ``chess.BLACK``). */
  turn: Color;

  /**
   * Bitmask of the rooks with castling rights.
   *
   * To test for specific squares:
   *
   *       >>> import chess
   *       >>>
   *       >>> board = chess.Board()
   *       >>> bool(board.castlingRights & chess.BB_H1)  // White can castle with the h1 rook
   *       True
   *
   * To add a specific square:
   *
   * >>> board.castlingRights |= chess.BB_A1
   *
   * Use :func:`~chess.Board.setCastlingFen()` to set multiple castling
   * rights. Also see :func:`~chess.Board.hasCastlingRights()`,
   * :func:`~chess.Board.hasKingsideCastlingRights()`,
   * :func:`~chess.Board.hasQueensideCastlingRights()`,
   * :func:`~chess.Board.hasChess960_castlingRights()`,
   * :func:`~chess.Board.cleanCastlingRights()`.
   */
  castlingRights: Bitboard;

  /**
   * The potential en passant square on the third or sixth rank or ``null``.
   *
   * Use :func:`~chess.Board.hasLegalEnPassant()` to test if en passant
   * capturing would actually be possible on the next move.
   */
  epSquare: Square | null;

  /**
   * Counts move pairs. Starts at `1` and is incremented after every move
   * of the black side.
   */
  fullmoveNumber: number;

  /** The number of half-moves since the last capture or pawn move. */
  halfmoveClock: number;

  /** A bitmask of pieces that have been promoted. */
  promoted: Bitboard;

  /**
   * Whether the board is in Chess960 mode. In Chess960 castling moves are
   * represented as king moves to the corresponding rook square.
   */
  chess960: boolean;

  /**
   * The move stack. Use :func:`Board.push() <chess.Board.push()>`,
   * :func:`Board.pop() <chess.Board.pop()>`,
   * :func:`Board.peek() <chess.Board.peek()>` and
   * :func:`Board.clearStack() <chess.Board.clearStack()>` for
   * manipulation.
   */
  moveStack: Move[];

  _stack: _BoardState<this>[];

  constructor(
    fen: string | null = STARTING_FEN,
    { chess960 = false }: { chess960?: boolean } = {},
  ) {
    super(null);

    this.chess960 = chess960;

    this.epSquare = null;
    this.moveStack = [];

    this._stack = [];

    // NOTE: We have to initialize these to avoid TS errors.
    //       The calls below will set them to the correct values.
    this.turn = null!;
    this.castlingRights = null!;
    this.fullmoveNumber = null!;
    this.halfmoveClock = null!;
    this.promoted = null!;

    if (fen === null) {
      this.clear();
    } else if (fen === (this.constructor as typeof Board).startingFen) {
      this.reset();
    } else {
      this.setFen(fen);
    }
  }

  /**
   * A dynamic list of legal moves.
   *
   *      >>> import chess
   *      >>>
   *      >>> board = chess.Board()
   *      >>> board.legalMoves.count()
   *      20
   *      >>> bool(board.legalMoves)
   *      True
   *      >>> move = chess.Move.fromUci("g1f3")
   *      >>> move in board.legalMoves
   *      True
   *
   * Wraps :func:`~chess.Board.generateLegalMoves()` and
   * :func:`~chess.Board.isLegal()`.
   */
  get legalMoves(): LegalMoveGenerator {
    return new LegalMoveGenerator(this);
  }

  /**
   * A dynamic list of pseudo-legal moves, much like the legal move list.
   *
   * Pseudo-legal moves might leave or put the king in check, but are
   * otherwise valid. Null moves are not pseudo-legal. Castling moves are
   * only included if they are completely legal.
   *
   * Wraps :func:`~chess.Board.generatePseudoLegalMoves()` and
   * :func:`~chess.Board.isPseudoLegal()`.
   */
  get pseudoLegalMoves(): PseudoLegalMoveGenerator {
    return new PseudoLegalMoveGenerator(this);
  }

  /**
   * Restores the starting position.
   */
  reset(): void {
    this.turn = WHITE;
    this.castlingRights = BB_CORNERS;
    this.epSquare = null;
    this.halfmoveClock = 0;
    this.fullmoveNumber = 1;

    this.resetBoard();
  }

  resetBoard(): void {
    super.resetBoard();
    this.clearStack();
  }

  /**
   * Clears the board.
   *
   * Resets move stack and move counters. The side to move is white. There
   * are no rooks or kings, so castling rights are removed.
   *
   * In order to be in a valid :func:`~chess.Board.status()`, at least kings
   * need to be put on the board.
   */
  clear(): void {
    this.turn = WHITE;
    this.castlingRights = BB_EMPTY;
    this.epSquare = null;
    this.halfmoveClock = 0;
    this.fullmoveNumber = 1;

    this.clearBoard();
  }

  clearBoard(): void {
    super.clearBoard();
    this.clearStack();
  }

  /**
   * Clears the move stack.
   */
  clearStack(): void {
    this.moveStack = [];
    this._stack = [];
  }

  /**
   * Returns a copy of the root position.
   */
  root<T extends typeof Board>(this: InstanceType<T>): InstanceType<T> {
    if (this._stack.length > 0) {
      const board = new (this.constructor as {
        new (chess960: boolean): InstanceType<T>;
      })(this.chess960);
      this._stack[0].restore(board);
      return board;
    } else {
      return this.copy({ stack: false });
    }
  }

  /**
   * Returns the number of half-moves since the start of the game, as
   * indicated by :data:`~chess.Board.fullmoveNumber` and
   * :data:`~chess.Board.turn`.
   *
   * If moves have been pushed from the beginning, this is usually equal to
   * ``len(board.moveStack)``. But note that a board can be set up with
   * arbitrary starting positions, and the stack can be cleared.
   */
  ply(): number {
    return 2 * (this.fullmoveNumber - 1) + utils.boolToNumber(this.turn === BLACK);
  }

  removePieceAt(square: Square): Piece | null {
    const piece = super.removePieceAt(square);
    this.clearStack();
    return piece;
  }

  setPieceAt(
    square: Square,
    piece: Piece | null,
    promoted: boolean = false,
  ): void {
    super.setPieceAt(square, piece, promoted);
    this.clearStack();
  }

  *generatePseudoLegalMoves(
    fromMask: Bitboard = BB_ALL,
    toMask: Bitboard = BB_ALL,
  ): IterableIterator<Move> {
    const ourPieces = this.occupiedCo[colorIdx(this.turn)];

    // Generate piece moves.
    const nonPawns = ourPieces & ~this.pawns & fromMask;
    for (const fromSquare of scanReversed(nonPawns)) {
      const moves = this.attacksMask(fromSquare) & ~ourPieces & toMask;
      for (const toSquare of scanReversed(moves)) {
        yield new Move(fromSquare, toSquare);
      }
    }

    // Generate castling moves.
    if (fromMask & this.kings) {
      yield* this.generateCastlingMoves(fromMask, toMask);
    }

    // The remaining moves are all pawn moves.
    const pawns = this.pawns & this.occupiedCo[colorIdx(this.turn)] & fromMask;
    if (!pawns) {
      return;
    }

    // Generate pawn captures.
    const capturers = pawns;
    for (const fromSquare of scanReversed(capturers)) {
      const targets =
        BB_PAWN_ATTACKS[colorIdx(this.turn)][fromSquare] &
        this.occupiedCo[colorIdx(!this.turn)] &
        toMask;

      for (const toSquare of scanReversed(targets)) {
        if ([0, 7].includes(squareRank(toSquare))) {
          yield new Move(fromSquare, toSquare, { promotion: QUEEN });
          yield new Move(fromSquare, toSquare, { promotion: ROOK });
          yield new Move(fromSquare, toSquare, { promotion: BISHOP });
          yield new Move(fromSquare, toSquare, { promotion: KNIGHT });
        } else {
          yield new Move(fromSquare, toSquare);
        }
      }
    }

    // Prepare pawn advance generation.
    let singleMoves: Bitboard
    let doubleMoves: Bitboard
    if (this.turn === WHITE) {
      singleMoves = (pawns << 8n) & ~this.occupied;
      doubleMoves =
        (singleMoves << 8n) & ~this.occupied & (BB_RANK_3 | BB_RANK_4);
    } else {
      singleMoves = (pawns >> 8n) & ~this.occupied;
      doubleMoves =
        (singleMoves >> 8n) & ~this.occupied & (BB_RANK_6 | BB_RANK_5);
    }

    singleMoves &= toMask;
    doubleMoves &= toMask;

    // Generate single pawn moves.
    for (let toSquare of scanReversed(singleMoves)) {
      let fromSquare = toSquare + (this.turn === BLACK ? 8 : -8);

      if ([0, 7].includes(squareRank(toSquare))) {
        yield new Move(fromSquare, toSquare, { promotion: QUEEN });
        yield new Move(fromSquare, toSquare, { promotion: ROOK });
        yield new Move(fromSquare, toSquare, { promotion: BISHOP });
        yield new Move(fromSquare, toSquare, { promotion: KNIGHT });
      } else {
        yield new Move(fromSquare, toSquare);
      }
    }

    // Generate double pawn moves.
    for (const toSquare of scanReversed(doubleMoves)) {
      const fromSquare = toSquare + (this.turn === BLACK ? 16 : -16);
      yield new Move(fromSquare, toSquare);
    }

    // Generate en passant captures.
    if (this.epSquare) {
      yield* this.generatePseudoLegalEp(fromMask, toMask);
    }
  }

  *generatePseudoLegalEp(
    fromMask: Bitboard = BB_ALL,
    toMask: Bitboard = BB_ALL,
  ): IterableIterator<Move> {
    if (!this.epSquare || !(BB_SQUARES[this.epSquare] & toMask)) {
      return;
    }

    if (BB_SQUARES[this.epSquare] & this.occupied) {
      return;
    }

    const capturers =
      this.pawns &
      this.occupiedCo[colorIdx(this.turn)] &
      fromMask &
      BB_PAWN_ATTACKS[colorIdx(!this.turn)][this.epSquare] &
      BB_RANKS[this.turn ? 4 : 3];

    for (const capturer of scanReversed(capturers)) {
      yield new Move(capturer, this.epSquare);
    }
  }

  *generatePseudoLegalCaptures(
    fromMask: Bitboard = BB_ALL,
    toMask: Bitboard = BB_ALL,
  ): IterableIterator<Move> {
    yield* this.generatePseudoLegalMoves(
      fromMask,
      toMask & this.occupiedCo[colorIdx(!this.turn)],
    );
    yield* this.generatePseudoLegalEp(fromMask, toMask);
  }

  checkersMask(): Bitboard {
    const king = this.king(this.turn);
    return king === null ? BB_EMPTY : this.attackersMask(!this.turn, king);
  }

  /**
   * Gets the pieces currently giving check.
   *
   * Returns a :class:`set of squares <chess.SquareSet>`.
   */
  checkers(): SquareSet {
    return new SquareSet(this.checkersMask());
  }

  isCheck(): boolean {
    return utils.bool(this.checkersMask());
  }

  givesCheck(move: Move): boolean {
    this.push(move);
    try {
      return this.isCheck();
    } finally {
      this.pop();
    }
  }

  isIntoCheck(move: Move): boolean {
    const king = this.king(this.turn);
    if (king === null) {
      return false;
    }

    // If already in check, look if it is an evasion.
    const checkers = this.attackersMask(!this.turn, king);
    if (
      checkers &&
      !utils.iterIncludes(
        this._generateEvasions(
          king,
          checkers,
          BB_SQUARES[move.fromSquare],
          BB_SQUARES[move.toSquare],
        ),
        move,
      )
    ) {
      return true;
    }

    return !this._isSafe(king, this._sliderBlockers(king), move);
  }

  wasIntoCheck(): boolean {
    const king = this.king(!this.turn);
    return (king !== null) && this.isAttackedBy(this.turn, king);
  }

  isPseudoLegal(move: Move): boolean {
    // Null moves are not pseudo-legal.
    if (!move.bool()) {
      return false;
    }

    // Drops are not pseudo-legal.
    if (move.drop !== null) {
      return false;
    }

    // Source square must not be vacant.
    const piece = this.pieceTypeAt(move.fromSquare);
    if (piece === null) {
      return false;
    }

    // Get square masks.
    const fromMask = BB_SQUARES[move.fromSquare];
    const toMask = BB_SQUARES[move.toSquare];

    // Check turn.
    if (!(this.occupiedCo[colorIdx(this.turn)] & fromMask)) {
      return false;
    }

    // Only pawns can promote and only on the backrank.
    if (move.promotion !== null) {
      if (piece !== PAWN) {
        return false;
      }

      if (this.turn === WHITE && squareRank(move.toSquare) !== 7) {
        return false;
      } else if (this.turn === BLACK && squareRank(move.toSquare) !== 0) {
        return false;
      }
    }

    // Handle castling.
    if (piece === KING) {
      move = this._fromChess960(this.chess960, move.fromSquare, move.toSquare);
      if (utils.iterIncludes(this.generateCastlingMoves(), move)) {
        return true;
      }
    }

    // Destination square can not be occupied.
    if (this.occupiedCo[colorIdx(this.turn)] & toMask) {
      return false;
    }

    // Handle pawn moves.
    if (piece === PAWN) {
      return utils.iterIncludes(
        this.generatePseudoLegalMoves(fromMask, toMask),
        move,
      );
    }

    // Handle all other pieces.
    return utils.bool(this.attacksMask(move.fromSquare) & toMask);
  }

  isLegal(move: Move): boolean {
    return (
      !this.isVariantEnd() &&
      this.isPseudoLegal(move) &&
      !this.isIntoCheck(move)
    );
  }

  /**
   * Checks if the game is over due to a special variant end condition.
   *
   * Note, for example, that stalemate is not considered a variant-specific
   * end condition (this method will return ``False``), yet it can have a
   * special **result** in suicide chess (any of
   * :func:`~chess.Board.isVariantLoss()`,
   * :func:`~chess.Board.isVariantWin()`,
   * :func:`~chess.Board.isVariantDraw()` might return ``True``).
   */
  isVariantEnd(): boolean {
    return false;
  }

  /**
   * Checks if the current side to move lost due to a variant-specific
   * condition.
   */
  isVariantLoss(): boolean {
    return false;
  }

  /**
   * Checks if the current side to move won due to a variant-specific
   * condition.
   */
  isVariantWin(): boolean {
    return false;
  }

  /**
   * Checks if a variant-specific drawing condition is fulfilled.
   */
  isVariantDraw(): boolean {
    return false;
  }

  isGameOver({ claimDraw = false }: { claimDraw?: boolean } = {}): boolean {
    return this.outcome({ claimDraw: claimDraw }) !== null;
  }

  result({ claimDraw = false }: { claimDraw?: boolean } = {}): string {
    const outcome = this.outcome({ claimDraw });
    return outcome !== null ? outcome.result() : '*';
  }

  /**
   * Checks if the game is over due to
   * :func:`checkmate <chess.Board.isCheckmate()>`,
   * :func:`stalemate <chess.Board.isStalemate()>`,
   * :func:`insufficient material <chess.Board.isInsufficientMaterial()>`,
   * the :func:`seventyfive-move rule <chess.Board.isSeventyfiveMoves()>`,
   * :func:`fivefold repetition <chess.Board.isFivefoldRepetition()>`,
   * or a :func:`variant end condition <chess.Board.isVariantEnd()>`.
   * Returns the :class:`chess.Outcome` if the game has ended, otherwise
   * ``None``.
   *
   * Alternatively, use :func:`~chess.Board.isGameOver()` if you are not
   * interested in who won the game and why.
   *
   * The game is not considered to be over by the
   * :func:`fifty-move rule <chess.Board.canClaimFiftyMoves()>` or
   * :func:`threefold repetition <chess.Board.canClaimThreefoldRepetition()>`,
   * unless *claimDraw* is given. Note that checking the latter can be
   * slow.
   */
  outcome({ claimDraw = false }: { claimDraw?: boolean } = {}): Outcome | null {
    // Variant support.
    if (this.isVariantLoss()) {
      return new Outcome(Termination.VARIANT_LOSS, !this.turn);
    }
    if (this.isVariantWin()) {
      return new Outcome(Termination.VARIANT_WIN, this.turn);
    }
    if (this.isVariantDraw()) {
      return new Outcome(Termination.VARIANT_DRAW, null);
    }

    // Normal game end.
    if (this.isCheckmate()) {
      return new Outcome(Termination.CHECKMATE, !this.turn);
    }
    if (this.isInsufficientMaterial()) {
      return new Outcome(Termination.INSUFFICIENT_MATERIAL, null);
    }
    if (!utils.iterAny(this.generateLegalMoves())) {
      return new Outcome(Termination.STALEMATE, null);
    }

    // Automatic draws.
    if (this.isSeventyfiveMoves()) {
      return new Outcome(Termination.SEVENTYFIVE_MOVES, null);
    }
    if (this.isFivefoldRepetition()) {
      return new Outcome(Termination.FIVEFOLD_REPETITION, null);
    }

    // Claimable draws.
    if (claimDraw) {
      if (this.canClaimFiftyMoves()) {
        return new Outcome(Termination.FIFTY_MOVES, null);
      }
      if (this.canClaimThreefoldRepetition()) {
        return new Outcome(Termination.THREEFOLD_REPETITION, null);
      }
    }

    return null;
  }

  /**
   * Checks if the current position is a checkmate.
   */
  isCheckmate(): boolean {
    if (!this.isCheck()) {
      return false;
    }
    return !utils.iterAny(this.generateLegalMoves());
  }

  /**
   * Checks if the current position is a stalemate.
   */
  isStalemate(): boolean {
    if (this.isCheck()) {
      return false;
    }

    if (this.isVariantEnd()) {
      return false;
    }

    return !utils.iterAny(this.generateLegalMoves());
  }

  /**
   * Checks if neither side has sufficient winning material
   * (:func:`~chess.Board.hasInsufficientMaterial()`).
   */
  isInsufficientMaterial(): boolean {
    return utils.iterAll(COLORS.map(color => this.hasInsufficientMaterial(color)));
  }

  /**
   * Checks if *color* has insufficient winning material.
   *
   * This is guaranteed to return ``False`` if *color* can still win the
   * game.
   *
   * The converse does not necessarily hold:
   * The implementation only looks at the material, including the colors
   * of bishops, but not considering piece positions. So fortress
   * positions or positions with forced lines may return ``False``, even
   * though there is no possible winning line.
   */
  hasInsufficientMaterial(color: Color): boolean {
    if (
      this.occupiedCo[colorIdx(color)] &
      (this.pawns | this.rooks | this.queens)
    ) {
      return false;
    }

    // Knights are only insufficient material if:
    // (1) We do not have any other pieces, including more than one knight.
    // (2) The opponent does not have pawns, knights, bishops or rooks.
    //     These would allow selfmate.
    if (this.occupiedCo[colorIdx(color)] & this.knights) {
      return (
        popcount(this.occupiedCo[colorIdx(color)]) <= 2 &&
        !(this.occupiedCo[colorIdx(!color)] & ~this.kings & ~this.queens)
      );
    }

    // Bishops are only insufficient material if:
    // (1) We do not have any other pieces, including bishops of the
    //     opposite color.
    // (2) The opponent does not have bishops of the opposite color,
    //     pawns or knights. These would allow selfmate.
    if (this.occupiedCo[colorIdx(color)] & this.bishops) {
      const sameColor =
        !(this.bishops & BB_DARK_SQUARES) || !(this.bishops & BB_LIGHT_SQUARES);
      return sameColor && !this.pawns && !this.knights;
    }

    return true;
  }

  _isHalfmoves(n: number): boolean {
    return this.halfmoveClock >= n && utils.iterAny(this.generateLegalMoves());
  }

  /**
   * Since the 1st of July 2014, a game is automatically drawn (without
   * a claim by one of the players) if the half-move clock since a capture
   * or pawn move is equal to or greater than 150. Other means to end a game
   * take precedence.
   */
  isSeventyfiveMoves(): boolean {
    return this._isHalfmoves(150);
  }

  /**
   * Since the 1st of July 2014 a game is automatically drawn (without
   * a claim by one of the players) if a position occurs for the fifth time.
   * Originally this had to occur on consecutive alternating moves, but
   * this has since been revised.
   */
  isFivefoldRepetition(): boolean {
    return this.isRepetition(5);
  }

  /**
   * Checks if the player to move can claim a draw by the fifty-move rule or
   * by threefold repetition.
   *
   * Note that checking the latter can be slow.
   */
  canClaimDraw(): boolean {
    return this.canClaimFiftyMoves() || this.canClaimThreefoldRepetition();
  }

  /**
   * Checks that the clock of halfmoves since the last capture or pawn move
   * is greater or equal to 100, and that no other means of ending the game
   * (like checkmate) take precedence.
   */
  isFiftyMoves(): boolean {
    return this._isHalfmoves(100);
  }

  /**
   * Checks if the player to move can claim a draw by the fifty-move rule.
   *
   * In addition to :func:`~chess.Board.isFiftyMoves()`, the fifty-move
   * rule can also be claimed if there is a legal move that achieves this
   * condition.
   */
  canClaimFiftyMoves(): boolean {
    if (this.isFiftyMoves()) {
      return true;
    }

    if (this.halfmoveClock >= 99) {
      for (const move of this.generatePseudoLegalMoves()) {
        if (!this.isZeroing(move)) {
          this.push(move);
          try {
            if (this.isFiftyMoves()) {
              return true;
            }
          } finally {
            this.pop();
          }
        }
      }
    }

    return false;
  }

  /**
   * Checks if the player to move can claim a draw by threefold repetition.
   *
   * Draw by threefold repetition can be claimed if the position on the
   * board occurred for the third time or if such a repetition is reached
   * with one of the possible legal moves.
   *
   * Note that checking this can be slow: In the worst case
   * scenario, every legal move has to be tested and the entire game has to
   * be replayed because there is no incremental transposition table.
   */
  canClaimThreefoldRepetition(): boolean {
    const transpositionKey = this._transpositionKey();
    const transpositions = new utils.Counter<bigint>();
    transpositions.update([transpositionKey]);

    // Count positions.
    const switchyard: Move[] = [];
    while (this.moveStack.length > 0) {
      const move = this.pop();
      switchyard.push(move);

      if (this.isIrreversible(move)) {
        break;
      }

      transpositions.update([this._transpositionKey()]);
    }

    while (switchyard.length > 0) {
      this.push(switchyard.pop() as Move);
    }

    // Threefold repetition occurred.
    if (transpositions.get(transpositionKey)! >= 3) {
      return true;
    }

    // The next legal move is a threefold repetition.
    for (const move of this.generateLegalMoves()) {
      this.push(move);
      try {
        if (transpositions.get(this._transpositionKey())! >= 2) {
          return true;
        }
      } finally {
        this.pop();
      }
    }

    return false;
  }

  /**
   * Checks if the current position has repeated 3 (or a given number of)
   * times.
   *
   * Unlike :func:`~chess.Board.canClaimThreefoldRepetition()`,
   * this does not consider a repetition that can be played on the next
   * move.
   *
   * Note that checking this can be slow: In the worst case, the entire
   * game has to be replayed because there is no incremental transposition
   * table.
   */
  isRepetition(count: number = 3): boolean {
    // Fast check, based on occupancy only.
    let maybeRepetitions = 1;
    for (const state of [...this._stack].reverse()) {
      if (state.occupied == this.occupied) {
        maybeRepetitions += 1;
        if (maybeRepetitions >= count) {
          break;
        }
      }
    }
    if (maybeRepetitions < count) {
      return false;
    }

    // Check full replay.
    const transpositionKey = this._transpositionKey();
    const switchyard: Move[] = [];

    try {
      while (true) {
        if (count <= 1) {
          return true;
        }

        if (this.moveStack.length < count - 1) {
          break;
        }

        const move = this.pop();
        switchyard.push(move);

        if (this.isIrreversible(move)) {
          break;
        }

        if (this._transpositionKey() === transpositionKey) {
          count -= 1;
        }
      }
    } finally {
      while (switchyard.length > 0) {
        this.push(switchyard.pop() as Move);
      }
    }

    return false;
  }

  _boardState(): _BoardState<this> {
    return new _BoardState(this);
  }

  _pushCapture(
    move: Move,
    captureSquare: Square,
    pieceType: PieceType,
    wasPromoted: boolean,
  ): void {
    // pass
  }

  /**
   * Updates the position with the given *move* and puts it onto the
   * move stack.
   *
   *      >>> import chess
   *      >>>
   *      >>> board = chess.Board()
   *      >>>
   *      >>> Nf3 = chess.Move.fromUci("g1f3")
   *      >>> board.push(Nf3)  # Make the move
   *
   *      >>> board.pop()  # Unmake the last move
   *      Move.fromUci('g1f3')
   *
   * Null moves just increment the move counters, switch turns and forfeit
   * en passant capturing.
   *
   * .. warning::
   *     Moves are not checked for legality. It is the caller's
   *     responsibility to ensure that the move is at least pseudo-legal or
   *     a null move.
   */
  push(move: Move): void {
    // Push move and remember board state.
    move = this._toChess960(move);
    const boardState = this._boardState();
    this.castlingRights = this.cleanCastlingRights(); // Before pushing stack
    this.moveStack.push(
      this._fromChess960(
        this.chess960,
        move.fromSquare,
        move.toSquare,
        move.promotion,
        move.drop,
      ),
    );
    this._stack.push(boardState);

    // Reset en passant square.
    const epSquare = this.epSquare;
    this.epSquare = null;

    // Increment move counters.
    this.halfmoveClock += 1;
    if (this.turn === BLACK) {
      this.fullmoveNumber += 1;
    }

    // On a null move, simply swap turns and reset the en passant square.
    if (!move.bool()) {
      this.turn = !this.turn;
      return;
    }

    // Drops.
    if (move.drop !== null) {
      this._setPieceAt(move.toSquare, move.drop, this.turn);
      this.turn = !this.turn;
      return;
    }

    // Zero the half-move clock.
    if (this.isZeroing(move)) {
      this.halfmoveClock = 0;
    }

    const fromBb = BB_SQUARES[move.fromSquare];
    const toBb = BB_SQUARES[move.toSquare];

    let promoted = utils.bool(this.promoted & fromBb);
    let pieceType = this._removePieceAt(move.fromSquare);
    if (pieceType === null) {
      throw new Error(`ValueError: push() expects move to be pseudo-legal, but got ${move} in ${this.boardFen()}`)
    }
    let captureSquare = move.toSquare;
    let capturedPieceType = this.pieceTypeAt(captureSquare);

    // Update castling rights.
    this.castlingRights &= ~toBb & ~fromBb;
    if ((pieceType === KING) && !promoted) {
      if (this.turn === WHITE) {
        this.castlingRights &= ~BB_RANK_1;
      } else {
        this.castlingRights &= ~BB_RANK_8;
      }
    } else if ((capturedPieceType === KING) && !(this.promoted & toBb)) {
      if ((this.turn === WHITE) && (squareRank(move.toSquare) === 7)) {
        this.castlingRights &= ~BB_RANK_8;
      } else if ((this.turn === BLACK) && (squareRank(move.toSquare) === 0)) {
        this.castlingRights &= ~BB_RANK_1;
      }
    }

    // Handle special pawn moves.
    if (pieceType === PAWN) {
      const diff = move.toSquare - move.fromSquare;

      if ((diff === 16) && (squareRank(move.fromSquare) === 1)) {
        this.epSquare = move.fromSquare + 8;
      } else if ((diff === -16) && (squareRank(move.fromSquare) === 6)) {
        this.epSquare = move.fromSquare - 8;
      } else if ((move.toSquare === epSquare) && [7, 9].includes(Math.abs(diff)) && (capturedPieceType === null)) {
        // Remove pawns captured en passant.
        const down = this.turn === WHITE ? -8 : 8;
        captureSquare = epSquare + down;
        capturedPieceType = this._removePieceAt(captureSquare);
      }
    }

    // Promotion.
    if (move.promotion !== null) {
      promoted = true;
      pieceType = move.promotion;
    }

    // Castling.
    const castling =
      (pieceType === KING) && utils.bool(this.occupiedCo[colorIdx(this.turn)] & toBb);
    if (castling) {
      const aSide = squareFile(move.toSquare) < squareFile(move.fromSquare);

      this._removePieceAt(move.fromSquare);
      this._removePieceAt(move.toSquare);

      if (aSide) {
        this._setPieceAt(this.turn === WHITE ? C1 : C8, KING, this.turn);
        this._setPieceAt(this.turn === WHITE ? D1 : D8, ROOK, this.turn);
      } else {
        this._setPieceAt(this.turn === WHITE ? G1 : G8, KING, this.turn);
        this._setPieceAt(this.turn === WHITE ? F1 : F8, ROOK, this.turn);
      }
    }

    // Put the piece on the target square.
    if (!castling) {
      let wasPromoted = utils.bool(this.promoted & toBb)
      this._setPieceAt(move.toSquare, pieceType, this.turn, promoted)

      if (capturedPieceType !== null) {
        this._pushCapture(move, captureSquare, capturedPieceType, wasPromoted);
      }
    }

    // Swap turn.
    this.turn = !this.turn;
  }

  /**
   * Restores the previous position and returns the last move from the stack.
   *
   * @throws :exc:`IndexError` if the move stack is empty.
   */
  pop(): Move {
    if (this.moveStack.length === 0 || this._stack.length === 0) {
      throw new Error('IndexError');
    }
    const move = this.moveStack.pop() as Move;
    (this._stack.pop() as _BoardState<this>).restore(this);
    return move;
  }

  /**
   * Gets the last move from the move stack.
   *
   * @throws :exc:`IndexError` if the move stack is empty.
   */
  peek(): Move {
    if (this.moveStack.length === 0) {
      throw new Error('IndexError');
    }
    return this.moveStack[this.moveStack.length - 1];
  }

  /**
   * Finds a matching legal move for an origin square, a target square, and
   * an optional promotion piece type.
   *
   * For pawn moves to the backrank, the promotion piece type defaults to
   * :data:`chess.QUEEN`, unless otherwise specified.
   *
   * Castling moves are normalized to king moves by two steps, except in
   * Chess960.
   *
   * @throws :exc:`IllegalMoveError` if no matching legal move is found.
   */
  findMove(
    fromSquare: Square,
    toSquare: Square,
    promotion: PieceType | null = null,
  ): Move {
    if (
      promotion === null &&
      this.pawns & BB_SQUARES[fromSquare] &&
      BB_SQUARES[toSquare] & BB_BACKRANKS
    ) {
      promotion = QUEEN;
    }

    const move = this._fromChess960(
      this.chess960,
      fromSquare,
      toSquare,
      promotion,
    );
    if (!this.isLegal(move)) {
      throw new IllegalMoveError(
        `no matching legal move for ${move.uci()} (${
          SQUARE_NAMES[fromSquare]
        } -> ${SQUARE_NAMES[toSquare]}) in ${this.fen()}`,
      );
    }

    return move;
  }

  castlingShredderFen(): string {
    const castlingRights = this.cleanCastlingRights();
    if (!castlingRights) {
      return '-';
    }

    const builder: string[] = [];

    for (const square of scanReversed(castlingRights & BB_RANK_1)) {
      builder.push(FILE_NAMES[squareFile(square)].toUpperCase());
    }

    for (const square of scanReversed(castlingRights & BB_RANK_8)) {
      builder.push(FILE_NAMES[squareFile(square)]);
    }

    return builder.join('');
  }

  castlingXfen(): string {
    const builder: string[] = [];

    for (const color of COLORS) {
      const king = this.king(color);
      if (king === null) {
        continue;
      }

      const kingFile = squareFile(king);
      const backrank = color === WHITE ? BB_RANK_1 : BB_RANK_8;

      for (const rookSquare of scanReversed(
        this.cleanCastlingRights() & backrank,
      )) {
        const rookFile = squareFile(rookSquare);
        const aSide = rookFile < kingFile;

        const otherRooks =
          this.occupiedCo[colorIdx(color)] &
          this.rooks &
          backrank &
          ~BB_SQUARES[rookSquare];

        let ch;
        if (
          utils.iterAny(
            utils.iterMap(
              scanReversed(otherRooks),
              other => squareFile(other) < rookFile === aSide,
            ),
          )
        ) {
          ch = FILE_NAMES[rookFile];
        } else {
          ch = aSide ? 'q' : 'k';
        }

        builder.push(color === WHITE ? ch.toUpperCase() : ch);
      }
    }

    if (builder.length !== 0) {
      return builder.join('');
    } else {
      return '-';
    }
  }

  /**
   * Checks if there is a pseudo-legal en passant capture.
   */
  hasPseudoLegalEnPassant(): boolean {
    return this.epSquare !== null && utils.iterAny(this.generatePseudoLegalEp());
  }

  /**
   * Checks if there is a legal en passant capture.
   */
  hasLegalEnPassant(): boolean {
    return this.epSquare !== null && utils.iterAny(this.generateLegalEp());
  }

  /**
   * Gets a FEN representation of the position.
   *
   * A FEN string (e.g.,
   * ``rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1``) consists
   * of the board part :func:`~chess.Board.boardFen()`, the
   * :data:`~chess.Board.turn`, the castling part
   * (:data:`~chess.Board.castlingRights`),
   * the en passant square (:data:`~chess.Board.epSquare`),
   * the :data:`~chess.Board.halfmoveClock`
   * and the :data:`~chess.Board.fullmoveNumber`.
   *
   * :param shredder: Use :func:`~chess.Board.castlingShredderFen()`
   *     and encode castling rights by the file of the rook
   *     (like ``HAha``) instead of the default
   *     :func:`~chess.Board.castlingXfen()` (like ``KQkq``).
   * :param enPassant: By default, only fully legal en passant squares
   *     are included (:func:`~chess.Board.hasLegalEnPassant()`).
   *     Pass ``fen`` to strictly follow the FEN specification
   *     (always include the en passant square after a two-step pawn move)
   *     or ``xfen`` to follow the X-FEN specification
   *     (:func:`~chess.Board.hasPseudoLegalEnPassant()`).
   * :param promoted: Mark promoted pieces like ``Q~``. By default, this is
   *     only enabled in chess variants where this is relevant.
   */
  fen({
    shredder = false,
    enPassant = 'legal',
    promoted = null,
  }: {
    shredder?: boolean;
    enPassant?: EnPassantSpec;
    promoted?: boolean | null;
  } = {}): string {
    return [
      this.epd({ shredder, enPassant, promoted }),
      this.halfmoveClock.toString(),
      this.fullmoveNumber.toString(),
    ].join(' ');
  }

  shredderFen({
    enPassant = 'legal',
    promoted = null,
  }: { enPassant?: EnPassantSpec; promoted?: boolean | null } = {}): string {
    return [
      this.epd({ shredder: true, enPassant, promoted }),
      this.halfmoveClock.toString(),
      this.fullmoveNumber.toString(),
    ].join(' ');
  }

  /**
   * Parses a FEN and sets the position from it.
   *
   * :raises: :exc:`ValueError` if syntactically invalid. Use
   *     :func:`~chess.Board.isValid()` to detect invalid positions.
   */
  setFen(fen: string): void {
    const parts = fen.split(' ');

    // Board part.
    const boardPart = parts.shift();
    if (boardPart === undefined) {
      throw new Error('ValueError: empty fen');
    }

    // Turn.
    let turn: Color;
    const turnPart = parts.shift();
    if (turnPart === undefined) {
      turn = WHITE;
    } else {
      if (turnPart == 'w') {
        turn = WHITE;
      } else if (turnPart == 'b') {
        turn = BLACK;
      } else {
        throw new Error(
          `ValueError: expected 'w' or 'b' for turn part of fen: ${fen}`,
        );
      }
    }

    // Validate castling part.
    let castlingPart = parts.shift();
    if (castlingPart === undefined) {
      castlingPart = '-';
    } else {
      if (castlingPart.match(FEN_CASTLING_REGEX) === null) {
        throw new Error(`ValueError: invalid castling part in fen: ${fen}`);
      }
    }

    // En passant square.
    let epSquare: Square | null;
    const epPart = parts.shift();
    if (epPart === undefined) {
      epSquare = null;
    } else {
      const squareIdx = epPart === '-' ? null : SQUARE_NAMES.indexOf(epPart);

      if (squareIdx === -1) {
        throw new Error(`ValueError: invalid en passant part in fen: ${fen}`);
      }
      epSquare = epPart === '-' ? null : squareIdx;
    }

    // Check that the half-move part is valid.
    let halfmoveClock: number;
    const halfmovePart = parts.shift();
    if (halfmovePart === undefined) {
      halfmoveClock = 0;
    } else {
      try {
        halfmoveClock = utils.parseIntStrict(halfmovePart);
      } catch (e) {
        throw new Error(`ValueError: invalid half-move clock in fen: ${fen}`);
      }

      if (halfmoveClock < 0) {
        throw new Error(
          `ValueError: half-move clock cannot be negative: ${fen}`,
        );
      }
    }

    // Check that the full-move number part is valid.
    // 0 is allowed for compatibility, but later replaced with 1.
    let fullmoveNumber: number;
    const fullmovePart = parts.shift();
    if (fullmovePart === undefined) {
      fullmoveNumber = 1;
    } else {
      try {
        fullmoveNumber = utils.parseIntStrict(fullmovePart);
      } catch (e) {
        throw new Error(`ValueError: invalid fullmove number in fen: ${fen}`);
      }

      if (fullmoveNumber < 0) {
        throw new Error(
          `ValueError: fullmove number cannot be negative: ${fen}`,
        );
      }

      fullmoveNumber = Math.max(fullmoveNumber, 1);
    }

    // All parts should be consumed now.
    if (parts.length !== 0) {
      throw new Error(
        `ValueError: fen string has more parts than expected: ${fen}`,
      );
    }

    // Validate the board part and set it.
    this._setBoardFen(boardPart);

    // Apply.
    this.turn = turn;
    this._setCastlingFen(castlingPart);
    this.epSquare = epSquare;
    this.halfmoveClock = halfmoveClock;
    this.fullmoveNumber = fullmoveNumber;
    this.clearStack();
  }

  _setCastlingFen(castlingFen: string): void {
    if (!castlingFen || castlingFen === '-') {
      this.castlingRights = BB_EMPTY;
      return;
    }

    if (castlingFen.match(FEN_CASTLING_REGEX) === null) {
      throw new Error(`ValueError: invalid castling fen: ${castlingFen}`);
    }

    this.castlingRights = BB_EMPTY;

    for (let flag of castlingFen) {
      const color = flag === flag.toUpperCase() ? WHITE : BLACK;
      flag = flag.toLowerCase();
      const backrank = color === WHITE ? BB_RANK_1 : BB_RANK_8;
      const rooks = this.occupiedCo[colorIdx(color)] & this.rooks & backrank;
      const king = this.king(color);

      if (flag === 'q') {
        // Select the leftmost rook.
        if (king !== null && lsb(rooks) < king) {
          this.castlingRights |= rooks & -rooks;
        } else {
          this.castlingRights |= BB_FILE_A & backrank;
        }
      } else if (flag === 'k') {
        // # Select the rightmost rook.
        const rook = msb(rooks);
        if (king !== null && king < rook) {
          this.castlingRights |= BB_SQUARES[rook];
        } else {
          this.castlingRights |= BB_FILE_H & backrank;
        }
      } else {
        this.castlingRights |= BB_FILES[FILE_NAMES.indexOf(flag)] & backrank;
      }
    }
  }

  /**
   * Sets castling rights from a string in FEN notation like ``Qqk``.
   *
   * Also clears the move stack.
   *
   * :raises: :exc:`ValueError` if the castling FEN is syntactically
   *     invalid.
   */
  setCastlingFen(castlingFen: string): void {
    this._setCastlingFen(castlingFen);
    this.clearStack();
  }

  setBoardFen(fen: string): void {
    super.setBoardFen(fen);
    this.clearStack();
  }

  setPieceMap(pieces: Map<Square, Piece>): void {
    super.setPieceMap(pieces);
    this.clearStack();
  }

  setChess960Pos(scharnagl: number): void {
    super.setChess960Pos(scharnagl);
    this.chess960 = true;
    this.turn = WHITE;
    this.castlingRights = this.rooks;
    this.epSquare = null;
    this.halfmoveClock = 0;
    this.fullmoveNumber = 1;

    this.clearStack();
  }

  /**
   * Gets the Chess960 starting position index between 0 and 956,
   * or ``None`` if the current position is not a Chess960 starting
   * position.
   *
   * By default, white to move (**ignoreTurn**) and full castling rights
   * (**ignoreCastling**) are required, but move counters
   * (**ignoreCounters**) are ignored.
   */
  chess960Pos({
    ignoreTurn = false,
    ignoreCastling = false,
    ignoreCounters = true,
  }: {
    ignoreTurn?: boolean;
    ignoreCastling?: boolean;
    ignoreCounters?: boolean;
  } = {}): number | null {
    if (this.epSquare !== null) {
      return null;
    }

    if (!ignoreTurn) {
      if (this.turn !== WHITE) {
        return null;
      }
    }

    if (!ignoreCastling) {
      if (this.cleanCastlingRights() != this.rooks) {
        return null;
      }
    }

    if (!ignoreCounters) {
      if (this.fullmoveNumber !== 1 || this.halfmoveClock != 0) {
        return null;
      }
    }

    return super.chess960Pos();
  }

  _epdOperations(
    operations: Map<string, string | number | null | Move | Iterable<Move>>,
  ): string {
    let epd: string[] = [];
    let firstOp = true;

    operations.forEach((operand, opcode) => {
      if (opcode === '-') {
        throw new Error('dash (-) is not a valid epd opcode');
      }
      [' ', '\n', '\t', '\r'].forEach(blacklisted => {
        if (opcode.includes(blacklisted)) {
          throw new Error(
            `invalid character ${blacklisted} in epd opcode: ${opcode}`,
          );
        }
      });

      if (!firstOp) {
        epd.push(' ');
      }
      firstOp = false;
      epd.push(opcode);

      if (operand === null) {
        epd.push(';');
      } else if (operand instanceof Move) {
        epd.push(' ');
        epd.push(this.san(operand));
        epd.push(';');
      } else if (typeof operand === 'number') {
        if (!isFinite(operand)) {
          throw new Error(
            `expected numeric epd operand to be finite, got: ${operand}`,
          );
        }
        epd.push(` ${operand};`);
      } else if (
        opcode === 'pv' &&
        typeof operand !== 'string' &&
        Symbol.iterator in Object(operand)
      ) {
        let position = this.copy({ stack: false });
        for (let move of operand) {
          epd.push(' ');
          epd.push(position.sanAndPush(move));
        }
        epd.push(';');
      } else if (
        (opcode === 'am' || opcode === 'bm') &&
        typeof operand !== 'string' &&
        Symbol.iterator in Object(operand)
      ) {
        let sans = Array.from(operand)
          .map(move => this.san(move))
          .sort();
        sans.forEach(san => {
          epd.push(' ');
          epd.push(san);
        });
        epd.push(';');
      } else {
        // Append as escaped string.
        epd.push(
          ` "${String(operand)
            .replace(/\\/g, '\\\\')
            .replace(/\t/g, '\\t')
            .replace(/\r/g, '\\r')
            .replace(/\n/g, '\\n')
            .replace(/\"/g, '\\"')}"`,
        );
      }
    });

    return epd.join('');
  }

  /**
   * Gets an EPD representation of the current position.
   *
   * See :func:`~chess.Board.fen()` for FEN formatting options (*shredder*,
   * *epSquare* and *promoted*).
   *
   * EPD operations can be given as keyword arguments. Supported operands
   * are strings, integers, finite floats, legal moves and ``None``.
   * Additionally, the operation ``pv`` accepts a legal variation as
   * a list of moves. The operations ``am`` and ``bm`` accept a list of
   * legal moves in the current position.
   *
   * The name of the field cannot be a lone dash and cannot contain spaces,
   * newlines, carriage returns or tabs.
   *
   * *hmvc* and *fmvn* are not included by default. You can use:
   *
   *      >>> import chess
   *      >>>
   *      >>> board = chess.Board()
   *      >>> board.epd(hmvc=board.halfmoveClock, fmvn=board.fullmoveNumber)
   *      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - hmvc 0; fmvn 1;'
   */
  epd(
    {
      shredder = false,
      enPassant = 'legal',
      promoted = null,
    }: {
      shredder?: boolean;
      enPassant?: EnPassantSpec;
      promoted?: boolean | null;
    } = {},
    operations: Map<
      string,
      null | string | number | Move | IterableIterator<Move>
    > = new Map(),
  ): string {
    let epSquare: Square | null;
    if (enPassant === 'fen') {
      epSquare = this.epSquare;
    } else if (enPassant === 'xfen') {
      epSquare = this.hasPseudoLegalEnPassant() ? this.epSquare : null;
    } else {
      epSquare = this.hasLegalEnPassant() ? this.epSquare : null;
    }

    let epd = [
      this.boardFen({ promoted }),
      this.turn === WHITE ? 'w' : 'b',
      shredder ? this.castlingShredderFen() : this.castlingXfen(),
      epSquare !== null ? SQUARE_NAMES[epSquare] : '-',
    ];

    if (operations.size !== 0) {
      epd.push(
        this._epdOperations(
          operations as Map<
            string,
            null | string | number | Move | IterableIterator<Move>
          >,
        ),
      );
    }

    return epd.join(' ');
  }

  _parseEpdOps<T extends Board>(
    operationPart: string,
    makeBoard: () => T,
  ): Map<string, string | number | null | Move | Move[]> {
    let operations: Map<string, string | number | null | Move | Move[]> =
      new Map();
    let state = 'opcode';
    let opcode = '';
    let operand = '';
    let position: T | null = null;

    for (let ch of [...operationPart, null]) {
      switch (state) {
        case 'opcode':
          if (ch !== null && [' ', '\t', '\r', '\n'].includes(ch)) {
            if (opcode === '-') {
              opcode = '';
            } else if (opcode) {
              state = 'after_opcode';
            }
          } else if (ch === null || ch === ';') {
            if (opcode === '-') {
              opcode = '';
            } else if (opcode) {
              operations.set(
                opcode,
                ['pv', 'am', 'bm'].includes(opcode) ? [] : null,
              );
              opcode = '';
            }
          } else {
            opcode += ch;
          }
          break;
        case 'after_opcode':
          if (ch !== null && [' ', '\t', '\r', '\n'].includes(ch)) {
            // pass
          } else if (ch === '"') {
            state = 'string';
          } else if (ch === null || ch === ';') {
            if (opcode) {
              operations.set(
                opcode,
                ['pv', 'am', 'bm'].includes(opcode) ? [] : null,
              );
              opcode = '';
            }
            state = 'opcode';
          } else if ('+-0123456789.'.includes(ch)) {
            operand = ch;
            state = 'numeric';
          } else {
            operand = ch;
            state = 'san';
          }
          break;
        case 'numeric':
          if (ch === null || ch === ';') {
            let parsed: number;
            if (
              operand.includes('.') ||
              operand.includes('e') ||
              operand.includes('E')
            ) {
              parsed = parseFloat(operand);
              if (!isFinite(parsed)) {
                throw new Error(
                  `Invalid numeric operand for epd operation ${opcode}: ${operand}`,
                );
              }
            } else {
              parsed = parseInt(operand);
            }
            operations.set(opcode, parsed);
            opcode = '';
            operand = '';
            state = 'opcode';
          } else {
            operand += ch;
          }
          break;
        case 'string':
          if (ch === null || ch === '"') {
            operations.set(opcode, operand);
            opcode = '';
            operand = '';
            state = 'opcode';
          } else if (ch === '\\') {
            state = 'string_escape';
          } else {
            operand += ch;
          }
          break;
        case 'string_escape':
          if (ch === null) {
            operations.set(opcode, operand);
            opcode = '';
            operand = '';
            state = 'opcode';
          } else if (ch === 'r') {
            operand += '\r';
            state = 'string';
          } else if (ch === 'n') {
            operand += '\n';
            state = 'string';
          } else if (ch === 't') {
            operand += '\t';
            state = 'string';
          } else {
            operand += ch;
            state = 'string';
          }
          break;
        case 'san':
          if (ch === null || ch === ';') {
            if (position === null) {
              position = makeBoard();
            }

            if (opcode === 'pv') {
              let variation: Move[] = [];
              for (let token of operand.split(' ')) {
                let move = position.parseXboard(token);
                variation.push(move);
                position.push(move);
              }

              while (position.moveStack.length) {
                position.pop();
              }

              operations.set(opcode, variation);
            } else if (['bm', 'am'].includes(opcode)) {
              operations.set(
                opcode,
                operand.split(' ').map(token => (position as T).parseXboard(token)),
              );
            } else {
              operations.set(opcode, position.parseXboard(operand));
            }

            opcode = '';
            operand = '';
            state = 'opcode';
          } else {
            operand += ch;
          }
          break;
      }
    }

    if (state !== 'opcode') {
      throw new Error('Unexpected state at the end of parsing');
    }
    return operations;
  }

  /**
   * Parses the given EPD string and uses it to set the position.
   *
   * If present, ``hmvc`` and ``fmvn`` are used to set the half-move
   * clock and the full-move number. Otherwise, ``0`` and ``1`` are used.
   *
   * Returns a dictionary of parsed operations. Values can be strings,
   * integers, floats, move objects, or lists of moves.
   *
   * :raises: :exc:`ValueError` if the EPD string is invalid.
   */
  setEpd(epd: string): Map<string, string | number | null | Move | Move[]> {
    let parts = epd.trim().split(/\s+/).slice(0, 4);

    // Parse ops.
    if (parts.length > 4) {
      let operations = this._parseEpdOps(parts.pop() as string, () => new (this.constructor as new (...args: any[]) => typeof this)(parts.join(" ") + " 0 1"));
      parts.push(operations.has("hmvc") ? String(operations.get("hmvc")) : "0");
      parts.push(operations.has("fmvn") ? String(operations.get("fmvn")) : "1");
      this.setFen(parts.join(" "));
      return operations;
    } else {
      this.setFen(epd);
      return new Map();
    }
  }

  /**
   * Gets the standard algebraic notation of the given move in the context
   * of the current position.
   */
  san(move: Move): string {
    return this._algebraic(move);
  }

  /**
   * Gets the long algebraic notation of the given move in the context of
   * the current position.
   */
  lan(move: Move): string {
    return this._algebraic(move, { long: true });
  }

  sanAndPush(move: Move): string {
    return this._algebraicAndPush(move);
  }

  _algebraic(move: Move, { long = false }: { long?: boolean } = {}): string {
    const san = this._algebraicAndPush(move, { long });
    this.pop();
    return san;
  }

  _algebraicAndPush(
    move: Move,
    { long = false }: { long?: boolean } = {},
  ): string {
    const san = this._algebraicWithoutSuffix(move, { long });

    // Look ahead for check or checkmate.
    this.push(move);
    const isCheck = this.isCheck();
    const isCheckmate =
      (isCheck && this.isCheckmate()) ||
      this.isVariantLoss() ||
      this.isVariantWin();

    // Add check or checkmate suffix.
    if (isCheckmate && move.bool()) {
      return san + '#';
    } else if (isCheck && move.bool()) {
      return san + '+';
    } else {
      return san;
    }
  }

  _algebraicWithoutSuffix(
    move: Move,
    { long = false }: { long?: boolean } = {},
  ): string {
    // Null move.
    if (!move) {
      return '--';
    }

    // Drops.
    if (move.drop) {
      let san = '';
      if (move.drop !== PAWN) {
        san = pieceSymbol(move.drop).toUpperCase();
      }
      san += '@' + SQUARE_NAMES[move.toSquare];
      return san;
    }

    // Castling.
    if (this.isCastling(move)) {
      if (squareFile(move.toSquare) < squareFile(move.fromSquare)) {
        return 'O-O-O';
      } else {
        return 'O-O';
      }
    }

    const pieceType = this.pieceTypeAt(move.fromSquare);
    if (pieceType === null) {
      throw new Error(
        `san() and lan() expect move to be legal or null, but got ${move} in ${this.fen()}`,
      );
    }
    const capture = this.isCapture(move);

    let san: string;
    if (pieceType === PAWN) {
      san = '';
    } else {
      san = pieceSymbol(pieceType).toUpperCase();
    }

    if (long) {
      san += SQUARE_NAMES[move.fromSquare];
    } else if (pieceType !== PAWN) {
      // Get ambiguous move candidates.
      // Relevant candidates: not exactly the current move,
      // but to the same square.
      let others: Bitboard = 0n;
      let fromMask: Bitboard = this.piecesMask(pieceType, this.turn);
      fromMask &= ~BB_SQUARES[move.fromSquare];
      const toMask = BB_SQUARES[move.toSquare];
      for (const candidate of this.generateLegalMoves(fromMask, toMask)) {
        others |= BB_SQUARES[candidate.fromSquare];
      }

      // Disambiguate.
      if (others) {
        let row = false;
        let column = false;

        if (others & BB_RANKS[squareRank(move.fromSquare)]) {
          column = true;
        }

        if (others & BB_FILES[squareFile(move.fromSquare)]) {
          row = true;
        } else {
          column = true;
        }

        if (column) {
          san += FILE_NAMES[squareFile(move.fromSquare)];
        }
        if (row) {
          san += RANK_NAMES[squareRank(move.fromSquare)];
        }
      }
    } else if (capture) {
      san += FILE_NAMES[squareFile(move.fromSquare)];
    }

    // Captures.
    if (capture) {
      san += 'x';
    } else if (long) {
      san += '-';
    }

    // Destination square.
    san += SQUARE_NAMES[move.toSquare];

    // Promotion.
    if (move.promotion) {
      san += '=' + pieceSymbol(move.promotion).toUpperCase();
    }

    return san;
  }

  /**
   * Given a sequence of moves, returns a string representing the sequence
   * in standard algebraic notation (e.g., ``1. e4 e5 2. Nf3 Nc6`` or
   * ``37...Bg6 38. fxg6``).
   *
   * The board will not be modified as a result of calling this.
   *
   * :raises: :exc:`IllegalMoveError` if any moves in the sequence are illegal.
   */
  variationSan(variation: Iterable<Move>): string {
    const board: this = this.copy({ stack: false }); // TODO remove ": this", should be inferred when copy() implemented
    const san: string[] = [];

    for (const move of variation) {
      if (!board.isLegal(move)) {
        throw new IllegalMoveError(
          `illegal move ${move} in position ${board.fen()}`,
        );
      }

      if (board.turn == WHITE) {
        san.push(`${board.fullmoveNumber}. ${board.sanAndPush(move)}`);
      } else if (san.length === 0) {
        san.push(`${board.fullmoveNumber}...${board.sanAndPush(move)}`);
      } else {
        san.push(board.sanAndPush(move));
      }
    }

    return san.join(' ');
  }

  /**
   * Uses the current position as the context to parse a move in standard
   * algebraic notation and returns the corresponding move object.
   *
   * Ambiguous moves are rejected. Overspecified moves (including long
   * algebraic notation) are accepted. Some common syntactical deviations
   * are also accepted.
   *
   * The returned move is guaranteed to be either legal or a null move.
   *
   * @throws :exc:Error if the SAN is invalid, illegal or ambiguous.
   *            - `InvalidMoveError` if the SAN is syntactically invalid.
   *            - `IllegalMoveError` if the SAN is illegal.
   *            - `AmbiguousMoveError` if the SAN is ambiguous.
   */
  parseSan(san: string): Move {
    // Castling.
    try {
      if (['O-O', 'O-O+', 'O-O#', '0-0', '0-0+', '0-0#'].includes(san)) {
        return utils.iterNext(
          utils.iterFilter(this.generateCastlingMoves(), move =>
            this.isKingsideCastling(move),
          ),
        );
      } else if (
        ['O-O-O', 'O-O-O+', 'O-O-O#', '0-0-0', '0-0-0+', '0-0-0#'].includes(san)
      ) {
        return utils.iterNext(
          utils.iterFilter(this.generateCastlingMoves(), move =>
            this.isQueensideCastling(move),
          ),
        );
      }
    } catch (error) {
      if (error instanceof utils.StopIteration) {
        throw new IllegalMoveError(`illegal san: ${san} in ${this.fen()}`);
      }
    }

    // Match normal moves.
    const match = san.match(SAN_REGEX);
    if (!match) {
      // Null moves.
      if (['--', 'Z0', '0000', '@@@@'].includes(san)) {
        return Move.null();
      } else if (san.includes(',')) {
        throw new InvalidMoveError(`unsupported multi-leg move: ${san}`);
      } else {
        throw new InvalidMoveError(`invalid san: ${san}`);
      }
    }

    // Get target square. Mask our own pieces to exclude castling moves.
    const toSquare = SQUARE_NAMES.indexOf(match[4]);
    const toMask = BB_SQUARES[toSquare] & ~this.occupiedCo[colorIdx(this.turn)];

    // Get the promotion piece type.
    const p = match[5];
    const promotion = p
      ? PIECE_SYMBOLS.indexOf(p[p.length - 1].toLowerCase())
      : null;

    // Filter by original square.
    let fromMask = BB_ALL;
    let fromFile: RankOrFileIndex | null = null;
    let fromRank: RankOrFileIndex | null = null;
    if (match[2]) {
      fromFile = FILE_NAMES.indexOf(match[2]) as RankOrFileIndex;
      fromMask &= BB_FILES[fromFile];
    }
    if (match[3]) {
      fromRank = (parseInt(match[3]) - 1) as RankOrFileIndex;
      fromMask &= BB_RANKS[fromRank];
    }

    // Filter by piece type.
    if (match[1]) {
      const pieceType = PIECE_SYMBOLS.indexOf(match[1].toLowerCase());
      fromMask &= this.piecesMask(pieceType, this.turn);
    } else if (match[2] && match[3]) {
      // Allow fully specified moves, even if they are not pawn moves,
      // including castling moves.
      const move = this.findMove(
        square(fromFile as RankOrFileIndex, fromRank as RankOrFileIndex),
        toSquare,
        promotion,
      );
      if (move.promotion === promotion) {
        return move;
      } else {
        throw new IllegalMoveError(
          `missing promotion piece type: ${san} in ${this.fen()}`,
        );
      }
    } else {
      fromMask &= this.pawns;

      // Do not allow pawn captures if file is not specified.
      if (!match[2]) {
        fromMask &= BB_FILES[squareFile(toSquare)];
      }
    }

    // Match legal moves.
    let matchedMove: Move | null = null;
    for (const move of this.generateLegalMoves(fromMask, toMask)) {
      if (move.promotion !== promotion) {
        continue;
      }

      if (matchedMove) {
        throw new AmbiguousMoveError(`ambiguous san: ${san} in ${this.fen()}`);
      }

      matchedMove = move;
    }

    if (!matchedMove) {
      throw new IllegalMoveError(`illegal san: ${san} in ${this.fen()}`);
    }

    return matchedMove;
  }

  /**
   * Parses a move in standard algebraic notation, makes the move and puts
   * it onto the move stack.
   *
   * Returns the move.
   *
   * :raises:
   *     :exc:`ValueError` (specifically an exception specified below) if neither legal nor a null move.
   *
   *     - :exc:`InvalidMoveError` if the SAN is syntactically invalid.
   *     - :exc:`IllegalMoveError` if the SAN is illegal.
   *     - :exc:`AmbiguousMoveError` if the SAN is ambiguous.
   */
  pushSan(san: string): Move {
    const move = this.parseSan(san);
    this.push(move);
    return move;
  }

  /**
   * Gets the UCI notation of the move.
   *
   * *chess960* defaults to the mode of the board. Pass ``True`` to force
   * Chess960 mode.
   */
  uci(
    move: Move,
    { chess960 = null }: { chess960?: boolean | null } = {},
  ): string {
    if (chess960 === null) {
      chess960 = this.chess960;
    }

    move = this._toChess960(move);
    move = this._fromChess960(
      chess960,
      move.fromSquare,
      move.toSquare,
      move.promotion,
      move.drop,
    );
    return move.uci();
  }

  /**
   * Parses the given move in UCI notation.
   *
   * Supports both Chess960 and standard UCI notation.
   *
   * The returned move is guaranteed to be either legal or a null move.
   *
   * :raises:
   *     :exc:`ValueError` (specifically an exception specified below) if the move is invalid or illegal in the
   *     current position (but not a null move).
   *
   *     - :exc:`InvalidMoveError` if the UCI is syntactically invalid.
   *     - :exc:`IllegalMoveError` if the UCI is illegal.
   */
  parseUci(uci: string): Move {
    let move = Move.fromUci(uci);

    move = this._toChess960(move);
    move = this._fromChess960(
      this.chess960,
      move.fromSquare,
      move.toSquare,
      move.promotion,
      move.drop,
    );

    if (!this.isLegal(move)) {
      throw new IllegalMoveError(`illegal uci: ${uci} in ${this.fen()}`);
    }

    return move;
  }

  /**
   * Parses a move in UCI notation and puts it on the move stack.
   *
   * Returns the move.
   *
   * :raises:
   *     :exc:`ValueError` (specifically an exception specified below) if the move is invalid or illegal in the
   *     current position (but not a null move).
   *
   *     - :exc:`InvalidMoveError` if the UCI is syntactically invalid.
   *     - :exc:`IllegalMoveError` if the UCI is illegal.
   */
  pushUci(uci: string): Move {
    const move = this.parseUci(uci);
    this.push(move);
    return move;
  }

  xboard(move: Move, chess960: boolean | null = null): string {
    if (chess960 === null) {
      chess960 = this.chess960;
    }

    if (!chess960 || !this.isCastling(move)) {
      return move.xboard();
    } else if (this.isKingsideCastling(move)) {
      return 'O-O';
    } else {
      return 'O-O-O';
    }
  }

  parseXboard(xboard: string): Move {
    return this.parseSan(xboard);
  }

  pushXboard = this.pushSan;

  /**
   * Checks if the given pseudo-legal move is an en passant capture.
   */
  isEnPassant(move: Move): boolean {
    return (
      this.epSquare === move.toSquare &&
      utils.bool(this.pawns & BB_SQUARES[move.fromSquare]) &&
      [7, 9].includes(Math.abs(move.toSquare - move.fromSquare)) &&
      !(this.occupied & BB_SQUARES[move.toSquare])
    );
  }

  /**
   * Checks if the given pseudo-legal move is a capture.
   */
  isCapture(move: Move): boolean {
    const touched = BB_SQUARES[move.fromSquare] ^ BB_SQUARES[move.toSquare];
    return (
      utils.bool(touched & this.occupiedCo[colorIdx(!this.turn)]) ||
      this.isEnPassant(move)
    );
  }

  /**
   * Checks if the given pseudo-legal move is a capture or pawn move.
   */
  isZeroing(move: Move): boolean {
    const touched = BB_SQUARES[move.fromSquare] ^ BB_SQUARES[move.toSquare];
    return utils.bool(
      touched & this.pawns ||
        touched & this.occupiedCo[colorIdx(!this.turn)] ||
        move.drop === PAWN,
    );
  }

  _reducesCastlingRights(move: Move): boolean {
    const cr = this.cleanCastlingRights();
    const touched = BB_SQUARES[move.fromSquare] ^ BB_SQUARES[move.toSquare];
    return utils.bool(
      touched & cr ||
        (cr & BB_RANK_1 &&
          touched &
            this.kings &
            this.occupiedCo[colorIdx(WHITE)] &
            ~this.promoted) ||
        (cr & BB_RANK_8 &&
          touched &
            this.kings &
            this.occupiedCo[colorIdx(BLACK)] &
            ~this.promoted),
    );
  }

  /**
   * Checks if the given pseudo-legal move is irreversible.
   *
   * In standard chess, pawn moves, captures, moves that destroy castling
   * rights and moves that cede en passant are irreversible.
   *
   * This method has false-negatives with forced lines. For example, a check
   * that will force the king to lose castling rights is not considered
   * irreversible. Only the actual king move is.
   */
  isIrreversible(move: Move): boolean {
    return (
      this.isZeroing(move) ||
      this._reducesCastlingRights(move) ||
      this.hasLegalEnPassant()
    );
  }

  /**
   * Checks if the given pseudo-legal move is a castling move.
   */
  isCastling(move: Move): boolean {
    if (this.kings & BB_SQUARES[move.fromSquare]) {
      const diff = squareFile(move.fromSquare) - squareFile(move.toSquare);
      return (
        Math.abs(diff) > 1 ||
        utils.bool(
          this.rooks &
            this.occupiedCo[colorIdx(this.turn)] &
            BB_SQUARES[move.toSquare],
        )
      );
    }
    return false;
  }

  /**
   * Checks if the given pseudo-legal move is a kingside castling move.
   */
  isKingsideCastling(move: Move): boolean {
    return (
      this.isCastling(move) &&
      squareFile(move.toSquare) > squareFile(move.fromSquare)
    );
  }

  /**
   * Checks if the given pseudo-legal move is a queenside castling move.
   */
  isQueensideCastling(move: Move): boolean {
    return (
      this.isCastling(move) &&
      squareFile(move.toSquare) < squareFile(move.fromSquare)
    );
  }

  /**
   * Returns valid castling rights filtered from
   * :data:`~chess.Board.castlingRights`.
   */
  cleanCastlingRights(): Bitboard {
    if (this._stack) {
      // No new castling rights are assigned in a game, so we can assume
      // they were filtered already.
      return this.castlingRights;
    }

    const castling = this.castlingRights & this.rooks;
    let whiteCastling = castling & BB_RANK_1 & this.occupiedCo[colorIdx(WHITE)];
    let blackCastling = castling & BB_RANK_8 & this.occupiedCo[colorIdx(BLACK)];

    if (!this.chess960) {
      // The rooks must be on a1, h1, a8 or h8.
      whiteCastling &= BB_A1 | BB_H1;
      blackCastling &= BB_A8 | BB_H8;

      // The kings must be on e1 or e8.
      if (
        !(
          this.occupiedCo[colorIdx(WHITE)] &
          this.kings &
          ~this.promoted &
          BB_E1
        )
      ) {
        whiteCastling = 0n;
      }
      if (
        !(
          this.occupiedCo[colorIdx(BLACK)] &
          this.kings &
          ~this.promoted &
          BB_E8
        )
      ) {
        blackCastling = 0n;
      }

      return whiteCastling | blackCastling;
    } else {
      // The kings must be on the back rank.
      const whiteKingMask =
        this.occupiedCo[colorIdx(WHITE)] &
        this.kings &
        BB_RANK_1 &
        ~this.promoted;
      const blackKingMask =
        this.occupiedCo[colorIdx(BLACK)] &
        this.kings &
        BB_RANK_8 &
        ~this.promoted;
      if (!whiteKingMask) {
        whiteCastling = 0n;
      }
      if (!blackKingMask) {
        blackCastling = 0n;
      }

      // There are only two ways of castling, a-side and h-side, and the
      // king must be between the rooks.
      let whiteASide = whiteCastling & -whiteCastling;
      let whiteHSide = whiteCastling ? BB_SQUARES[msb(whiteCastling)] : 0n;

      if (whiteASide && msb(whiteASide) > msb(whiteKingMask)) {
        whiteASide = 0n;
      }
      if (whiteHSide && msb(whiteHSide) < msb(whiteKingMask)) {
        whiteHSide = 0n;
      }

      let blackASide = blackCastling & -blackCastling;
      let blackHSide = blackCastling
        ? BB_SQUARES[msb(blackCastling)]
        : BB_EMPTY;

      if (blackASide && msb(blackASide) > msb(blackKingMask)) {
        blackASide = 0n;
      }
      if (blackHSide && msb(blackHSide) < msb(blackKingMask)) {
        blackHSide = 0n;
      }

      // Done.
      return blackASide | blackHSide | whiteASide | whiteHSide;
    }
  }

  /**
   * Checks if the given side has castling rights.
   */
  hasCastlingRights(color: Color): boolean {
    const backrank = color === WHITE ? BB_RANK_1 : BB_RANK_8;
    return utils.bool(this.cleanCastlingRights() & backrank);
  }

  /**
   * Checks if the given side has kingside (that is h-side in Chess960)
   * castling rights.
   */
  hasKingsideCastlingRights(color: Color): boolean {
    const backrank = color === WHITE ? BB_RANK_1 : BB_RANK_8;
    const kingMask =
      this.kings & this.occupiedCo[colorIdx(color)] & backrank & ~this.promoted;
    if (!kingMask) {
      return false;
    }

    let castlingRights = this.cleanCastlingRights() & backrank;
    while (castlingRights) {
      const rook = castlingRights & -castlingRights;

      if (rook > kingMask) {
        return true;
      }

      castlingRights &= castlingRights - 1n;
    }

    return false;
  }

  /**
   * Checks if the given side has queenside (that is a-side in Chess960)
   * castling rights.
   */
  hasQueensideCastlingRights(color: Color): boolean {
    const backrank = color === WHITE ? BB_RANK_1 : BB_RANK_8;
    const kingMask =
      this.kings & this.occupiedCo[colorIdx(color)] & backrank & ~this.promoted;
    if (!kingMask) {
      return false;
    }

    let castlingRights = this.cleanCastlingRights() & backrank;
    while (castlingRights) {
      const rook = castlingRights & -castlingRights;

      if (rook < kingMask) {
        return true;
      }

      castlingRights &= castlingRights - 1n;
    }

    return false;
  }

  /**
   * Checks if there are castling rights that are only possible in Chess960.
   */
  hasChess960CastlingRights(): boolean {
    // Get valid Chess960 castling rights.
    const chess960 = this.chess960;
    this.chess960 = true;
    const castlingRights = this.cleanCastlingRights();
    this.chess960 = chess960;

    // Standard chess castling rights can only be on the standard
    // starting rook squares.
    if (castlingRights & ~BB_CORNERS) {
      return true;
    }

    // If there are any castling rights in standard chess, the king must be
    // on e1 or e8.
    if (
      castlingRights & BB_RANK_1 &&
      !(this.occupiedCo[colorIdx(WHITE)] & this.kings & BB_E1)
    ) {
      return true;
    }
    if (
      castlingRights & BB_RANK_8 &&
      !(this.occupiedCo[colorIdx(BLACK)] & this.kings & BB_E8)
    ) {
      return true;
    }

    return false;
  }

  /**
   * Gets a bitmask of possible problems with the position.
   *
   * :data:`~chess.STATUS_VALID` if all basic validity requirements are met.
   * This does not imply that the position is actually reachable with a
   * series of legal moves from the starting position.
   *
   * Otherwise, bitwise combinations of:
   * :data:`~chess.STATUS_NO_WHITE_KING`,
   * :data:`~chess.STATUS_NO_BLACK_KING`,
   * :data:`~chess.STATUS_TOO_MANY_KINGS`,
   * :data:`~chess.STATUS_TOO_MANY_WHITE_PAWNS`,
   * :data:`~chess.STATUS_TOO_MANY_BLACK_PAWNS`,
   * :data:`~chess.STATUS_PAWNS_ON_BACKRANK`,
   * :data:`~chess.STATUS_TOO_MANY_WHITE_PIECES`,
   * :data:`~chess.STATUS_TOO_MANY_BLACK_PIECES`,
   * :data:`~chess.STATUS_BAD_CASTLING_RIGHTS`,
   * :data:`~chess.STATUS_INVALID_EP_SQUARE`,
   * :data:`~chess.STATUS_OPPOSITE_CHECK`,
   * :data:`~chess.STATUS_EMPTY`,
   * :data:`~chess.STATUS_RACE_CHECK`,
   * :data:`~chess.STATUS_RACE_OVER`,
   * :data:`~chess.STATUS_RACE_MATERIAL`,
   * :data:`~chess.STATUS_TOO_MANY_CHECKERS`,
   * :data:`~chess.STATUS_IMPOSSIBLE_CHECK`.
   */
  status(): Status {
    let errors = STATUS_VALID;

    // There must be at least one piece.
    if (!this.occupied) {
      errors |= STATUS_EMPTY;
    }

    // There must be exactly one king of each color.
    if (!(this.occupiedCo[colorIdx(WHITE)] & this.kings)) {
      errors |= STATUS_NO_WHITE_KING;
    }
    if (!(this.occupiedCo[colorIdx(BLACK)] & this.kings)) {
      errors |= STATUS_NO_BLACK_KING;
    }
    if (popcount(this.occupied & this.kings) > 2) {
      errors |= STATUS_TOO_MANY_KINGS;
    }

    // There can not be more than 16 pieces of any color.
    if (popcount(this.occupiedCo[colorIdx(WHITE)]) > 16) {
      errors |= STATUS_TOO_MANY_WHITE_PIECES;
    }
    if (popcount(this.occupiedCo[colorIdx(BLACK)]) > 16) {
      errors |= STATUS_TOO_MANY_BLACK_PIECES;
    }

    // There can not be more than 8 pawns of any color.
    if (popcount(this.occupiedCo[colorIdx(WHITE)] & this.pawns) > 8) {
      errors |= STATUS_TOO_MANY_WHITE_PAWNS;
    }
    if (popcount(this.occupiedCo[colorIdx(BLACK)] & this.pawns) > 8) {
      errors |= STATUS_TOO_MANY_BLACK_PAWNS;
    }

    // Pawns can not be on the back rank.
    if (this.pawns & BB_BACKRANKS) {
      errors |= STATUS_PAWNS_ON_BACKRANK;
    }

    // Castling rights.
    if (this.castlingRights != this.cleanCastlingRights()) {
      errors |= STATUS_BAD_CASTLING_RIGHTS;
    }

    // En passant.
    const validEpSquare = this._validEpSquare();
    if (this.epSquare != validEpSquare) {
      errors |= STATUS_INVALID_EP_SQUARE;
    }

    // Side to move giving check.
    if (this.wasIntoCheck()) {
      errors |= STATUS_OPPOSITE_CHECK;
    }

    // More than the maximum number of possible checkers in the variant.
    const checkers = this.checkersMask();
    const ourKings =
      this.kings & this.occupiedCo[colorIdx(this.turn)] & ~this.promoted;
    if (checkers) {
      if (popcount(checkers) > 2) {
        errors |= STATUS_TOO_MANY_CHECKERS;
      }

      if (validEpSquare !== null) {
        const pushedTo = validEpSquare ^ A2;
        const pushedFrom = validEpSquare ^ A4;
        const occupiedBefore =
          (this.occupied & ~BB_SQUARES[pushedTo]) | BB_SQUARES[pushedFrom];
        if (
          popcount(checkers) > 1 ||
          (msb(checkers) !== pushedTo &&
            this._attackedForKing(ourKings, occupiedBefore))
        ) {
          errors |= STATUS_IMPOSSIBLE_CHECK;
        }
      } else {
        if (
          popcount(checkers) > 2 ||
          (popcount(checkers) == 2 &&
            ray(lsb(checkers), msb(checkers)) & ourKings)
        ) {
          errors |= STATUS_IMPOSSIBLE_CHECK;
        }
      }
    }

    return errors;
  }

  _validEpSquare(): Square | null {
    if (!this.epSquare) {
      return null;
    }

    let epRank: RankOrFileIndex;
    let pawnMask: Bitboard;
    let seventhRankMask: Bitboard;
    if (this.turn == WHITE) {
      epRank = 5;
      pawnMask = shiftDown(BB_SQUARES[this.epSquare]);
      seventhRankMask = shiftUp(BB_SQUARES[this.epSquare]);
    } else {
      epRank = 2;
      pawnMask = shiftUp(BB_SQUARES[this.epSquare]);
      seventhRankMask = shiftDown(BB_SQUARES[this.epSquare]);
    }

    // The en passant square must be on the third or sixth rank.
    if (squareRank(this.epSquare) != epRank) {
      return null;
    }

    // The last move must have been a double pawn push, so there must
    // be a pawn of the correct color on the fourth or fifth rank.
    if (!(this.pawns & this.occupiedCo[colorIdx(!this.turn)] & pawnMask)) {
      return null;
    }

    // And the en passant square must be empty.
    if (this.occupied & BB_SQUARES[this.epSquare]) {
      return null;
    }

    // And the second rank must be empty.
    if (this.occupied & seventhRankMask) {
      return null;
    }

    return this.epSquare;
  }

  /**
   * Checks some basic validity requirements.
   *
   * See :func:`~chess.Board.status()` for details.
   */
  isValid(): boolean {
    return this.status() === STATUS_VALID;
  }

  _epSkewered(king: Square, capturer: Square): boolean {
    // Handle the special case where the king would be in check if the
    // pawn and its capturer disappear from the rank.

    // Vertical skewers of the captured pawn are not possible. (Pins on
    // the capturer are not handled here.)
    if (this.epSquare === null) {
      throw new Error('AssertionError');
    }

    const lastDouble: Square = this.epSquare + (this.turn == WHITE ? -8 : 8);

    const occupancy =
      (this.occupied & ~BB_SQUARES[lastDouble] & ~BB_SQUARES[capturer]) |
      BB_SQUARES[this.epSquare];

    // Horizontal attack on the fifth or fourth rank.
    const horizontalAttackers =
      this.occupiedCo[colorIdx(!this.turn)] & (this.rooks | this.queens);
    if (
      (BB_RANK_ATTACKS[king].get(BB_RANK_MASKS[king] & occupancy) as Bitboard) &
      horizontalAttackers
    ) {
      return true;
    }

    // Diagonal skewers. These are not actually possible in a real game,
    // because if the latest double pawn move covers a diagonal attack,
    // then the other side would have been in check already.
    const diagonalAttackers =
      this.occupiedCo[colorIdx(!this.turn)] & (this.bishops | this.queens);
    if (
      (BB_DIAG_ATTACKS[king].get(BB_DIAG_MASKS[king] & occupancy) as Bitboard) &
      diagonalAttackers
    ) {
      return true;
    }

    return false;
  }

  _sliderBlockers(king: Square): Bitboard {
    const rooksAndQueens = this.rooks | this.queens;
    const bishopsAndQueens = this.bishops | this.queens;

    const snipers =
      ((BB_RANK_ATTACKS[king].get(0n) as Bitboard) & rooksAndQueens) |
      ((BB_FILE_ATTACKS[king].get(0n) as Bitboard) & rooksAndQueens) |
      ((BB_DIAG_ATTACKS[king].get(0n) as Bitboard) & bishopsAndQueens);

    let blockers = 0n;

    for (const sniper of scanReversed(
      snipers & this.occupiedCo[colorIdx(!this.turn)],
    )) {
      const b = between(king, sniper) & this.occupied;

      // Add to blockers if exactly one piece in-between.
      if (b && BB_SQUARES[msb(b)] === b) {
        blockers |= b;
      }
    }

    return blockers & this.occupiedCo[colorIdx(this.turn)];
  }

  _isSafe(king: Square, blockers: Bitboard, move: Move): boolean {
    if (move.fromSquare === king) {
      if (this.isCastling(move)) {
        return true;
      } else {
        return !this.isAttackedBy(!this.turn, move.toSquare);
      }
    } else if (this.isEnPassant(move)) {
      return utils.bool(
        this.pinMask(this.turn, move.fromSquare) & BB_SQUARES[move.toSquare] &&
          !this._epSkewered(king, move.fromSquare),
      );
    } else {
      return utils.bool(
        !(blockers & BB_SQUARES[move.fromSquare]) ||
          ray(move.fromSquare, move.toSquare) & BB_SQUARES[king],
      );
    }
  }

  *_generateEvasions(
    king: Square,
    checkers: Bitboard,
    fromMask: Bitboard = BB_ALL,
    toMask: Bitboard = BB_ALL,
  ): IterableIterator<Move> {
    const sliders = checkers & (this.bishops | this.rooks | this.queens);

    let attacked = 0n;
    for (const checker of scanReversed(sliders)) {
      attacked |= ray(king, checker) & ~BB_SQUARES[checker];
    }

    if (BB_SQUARES[king] & fromMask) {
      for (const toSquare of scanReversed(
        BB_KING_ATTACKS[king] &
          ~this.occupiedCo[colorIdx(this.turn)] &
          ~attacked &
          toMask,
      )) {
        yield new Move(king, toSquare);
      }
    }

    const checker = msb(checkers);
    if (BB_SQUARES[checker] == checkers) {
      // Capture or block a single checker.
      const target = between(king, checker) | checkers;

      yield* this.generatePseudoLegalMoves(
        ~this.kings & fromMask,
        target & toMask,
      );

      // Capture the checking pawn en passant (but avoid yielding
      // duplicate moves).
      if (this.epSquare && !(BB_SQUARES[this.epSquare] & target)) {
        const lastDouble = this.epSquare + (this.turn == WHITE ? -8 : 8);
        if (lastDouble == checker) {
          yield* this.generatePseudoLegalEp(fromMask, toMask);
        }
      }
    }
  }

  *generateLegalMoves(
    fromMask: Bitboard = BB_ALL,
    toMask: Bitboard = BB_ALL,
  ): IterableIterator<Move> {
    if (this.isVariantEnd()) {
      return;
    }

    const kingMask = this.kings & this.occupiedCo[colorIdx(this.turn)];
    if (kingMask) {
      const king = msb(kingMask);
      const blockers = this._sliderBlockers(king);
      const checkers = this.attackersMask(!this.turn, king);
      if (checkers) {
        for (const move of this._generateEvasions(
          king,
          checkers,
          fromMask,
          toMask,
        )) {
          if (this._isSafe(king, blockers, move)) {
            yield move;
          }
        }
      } else {
        for (const move of this.generatePseudoLegalMoves(fromMask, toMask)) {
          if (this._isSafe(king, blockers, move)) {
            yield move;
          }
        }
      }
    } else {
      yield* this.generatePseudoLegalMoves(fromMask, toMask);
    }
  }

  *generateLegalEp(
    fromMask: Bitboard = BB_ALL,
    toMask: Bitboard = BB_ALL,
  ): IterableIterator<Move> {
    if (this.isVariantEnd()) {
      return;
    }

    for (const move of this.generatePseudoLegalEp(fromMask, toMask)) {
      if (!this.isIntoCheck(move)) {
        yield move;
      }
    }
  }

  *generateLegalCaptures(
    fromMask: Bitboard = BB_ALL,
    toMask: Bitboard = BB_ALL,
  ): IterableIterator<Move> {
    yield* this.generateLegalMoves(
      fromMask,
      toMask & this.occupiedCo[colorIdx(!this.turn)],
    );
    yield* this.generateLegalEp(fromMask, toMask);
  }

  _attackedForKing(path: Bitboard, occupied: Bitboard): boolean {
    return utils.iterAny(
      utils.iterMap(scanReversed(path), sq =>
        this._attackersMask(!this.turn, sq, occupied),
      ),
    );
  }

  *generateCastlingMoves(
    fromMask: Bitboard = BB_ALL,
    toMask: Bitboard = BB_ALL,
  ): IterableIterator<Move> {
    if (this.isVariantEnd()) {
      return;
    }

    const backrank = this.turn == WHITE ? BB_RANK_1 : BB_RANK_8;
    let king =
      this.occupiedCo[colorIdx(this.turn)] &
      this.kings &
      ~this.promoted &
      backrank &
      fromMask;
    king &= -king;
    if (!king) {
      return;
    }

    const bbC = BB_FILE_C & backrank;
    const bbD = BB_FILE_D & backrank;
    const bbF = BB_FILE_F & backrank;
    const bbG = BB_FILE_G & backrank;

    for (const candidate of scanReversed(
      this.cleanCastlingRights() & backrank & toMask,
    )) {
      const rook = BB_SQUARES[candidate];

      const aSide = rook < king;
      const kingTo = aSide ? bbC : bbG;
      const rookTo = aSide ? bbD : bbF;

      const kingPath = between(msb(king), msb(kingTo));
      const rookPath = between(candidate, msb(rookTo));

      if (
        !(
          (this.occupied ^ king ^ rook) &
            (kingPath | rookPath | kingTo | rookTo) ||
          this._attackedForKing(kingPath | king, this.occupied ^ king) ||
          this._attackedForKing(kingTo, this.occupied ^ king ^ rook ^ rookTo)
        )
      ) {
        yield this._fromChess960(this.chess960, msb(king), candidate);
      }
    }
  }

  _fromChess960(
    chess960: boolean,
    fromSquare: Square,
    toSquare: Square,
    promotion: PieceType | null = null,
    drop: PieceType | null = null,
  ): Move {
    if (!chess960 && promotion === null && drop === null) {
      if (fromSquare === E1 && this.kings & BB_E1) {
        if (toSquare === H1) {
          return new Move(E1, G1);
        } else if (toSquare === A1) {
          return new Move(E1, C1);
        }
      } else if (fromSquare == E8 && this.kings & BB_E8) {
        if (toSquare === H8) {
          return new Move(E8, G8);
        } else if (toSquare === A8) {
          return new Move(E8, C8);
        }
      }
    }

    return new Move(fromSquare, toSquare, { promotion, drop });
  }

  _toChess960(move: Move): Move {
    if (move.fromSquare == E1 && this.kings & BB_E1) {
      if (move.toSquare == G1 && !(this.rooks & BB_G1)) {
        return new Move(E1, H1);
      } else if (move.toSquare == C1 && !(this.rooks & BB_C1)) {
        return new Move(E1, A1);
      }
    } else if (move.fromSquare == E8 && this.kings & BB_E8) {
      if (move.toSquare == G8 && !(this.rooks & BB_G8)) {
        return new Move(E8, H8);
      } else if (move.toSquare == C8 && !(this.rooks & BB_C8)) {
        return new Move(E8, A8);
      }
    }

    return move;
  }

  _transpositionKey(): bigint {
    // NOTE: This function works a bit differently from the Python version.
    //       Here we concatenate all items in the Python version's tuple into
    //       a single bigint.
    const KEY: (Bitboard | boolean | Square)[] = [
      this.pawns,
      this.knights,
      this.bishops,
      this.rooks,
      this.queens,
      this.kings,
      this.occupiedCo[colorIdx(WHITE)],
      this.occupiedCo[colorIdx(BLACK)],
      this.turn,
      this.cleanCastlingRights(),
      this.hasLegalEnPassant() ? (this.epSquare as Square) : 0,
    ];

    // Concatenate all items into a single bigint.
    let result = 0n;

    for (const item of KEY) {
      if (typeof item === 'bigint') {
        result = (result << 64n) | item;
      } else if (typeof item === 'boolean') {
        result = (result << 1n) | BigInt(item);
      } else {
        result = (result << 6n) | BigInt(item);
      }
    }

    return result;
  }

  toRepr(): string {
    if (!this.chess960) {
      return `${this.constructor.name}({self.fen()!r})`;
    } else {
      return `${this.constructor.name}({self.fen()!r}, chess960=True)`;
    }
  }

  _reprSvg(): string {
    // TODO
    throw new Error('Not implemented');
  }

  equals(board: any): boolean {
    if (board instanceof Board) {
      return (
        this.halfmoveClock === board.halfmoveClock &&
        this.fullmoveNumber === board.fullmoveNumber &&
        (this.constructor as typeof Board).uciVariant === (board.constructor as typeof Board).uciVariant &&
        this._transpositionKey() === board._transpositionKey()
      );
    } else {
      return false;
    }
  }

  applyTransform(f: (board: Bitboard) => Bitboard): void {
    super.applyTransform(f);
    this.clearStack();
    this.epSquare =
      this.epSquare === null ? null : msb(f(BB_SQUARES[this.epSquare]));
    this.castlingRights = f(this.castlingRights);
  }

  transform(f: (board: Bitboard) => Bitboard): this {
    const board = this.copy({ stack: false });
    board.applyTransform(f);
    return board;
  }

  applyMirror(): void {
    super.applyMirror();
    this.turn = !this.turn;
  }

  /**
   * Returns a mirrored copy of the board.
   *
   * The board is mirrored vertically and piece colors are swapped, so that
   * the position is equivalent modulo color. Also swap the "en passant"
   * square, castling rights and turn.
   *
   * Alternatively, :func:`~chess.Board.applyMirror()` can be used
   * to mirror the board.
   */
  mirror(): this {
    const board = this.copy();
    board.applyMirror();
    return board;
  }

  /**
   * Creates a copy of the board.
   *
   * Defaults to copying the entire move stack. Alternatively, *stack* can
   * be ``False``, or an integer to copy a limited number of moves.
   */
  copy({ stack = true }: { stack?: boolean | number } = {}): this {
    const board = super.copy();

    board.chess960 = this.chess960;

    board.epSquare = this.epSquare;
    board.castlingRights = this.castlingRights;
    board.turn = this.turn;
    board.fullmoveNumber = this.fullmoveNumber;
    board.halfmoveClock = this.halfmoveClock;

    if (stack) {
      stack = stack === true ? this.moveStack.length : stack;
      board.moveStack = this.moveStack.slice(-stack).map(move => move.copy());
      board._stack = this._stack.slice(-stack);
    }

    return board;
  }

  /**
   * Creates a new empty board. Also see :func:`~chess.Board.clear()`.
   */
  static empty<T extends typeof Board>(
    this: T,
    { chess960 = false }: { chess960?: boolean } = {},
  ): InstanceType<T> {
    return new this(null, { chess960 }) as InstanceType<T>;
  }

  /**
   * Creates a new board from an EPD string. See
   * :func:`~chess.Board.setEpd()`.
   *
   * Returns the board and the dictionary of parsed operations as a tuple.
   */
  static fromEpd<T extends typeof Board>(
    this: T,
    epd: string,
    { chess960 = false }: { chess960?: boolean } = {},
  ): [
    InstanceType<T>,
    Map<string, null | string | number | Move | Array<Move>>,
  ] {
    const board = this.empty({ chess960 });
    return [board, board.setEpd(epd)];
  }

  static fromChess960Pos<T extends typeof Board>(
    this: T,
    scharnagl: number,
  ): InstanceType<T> {
    const board = this.empty({ chess960: true });
    board.setChess960Pos(scharnagl);
    return board;
  }
}

export class PseudoLegalMoveGenerator {
  board: Board;

  constructor(board: Board) {
    this.board = board;
  }

  bool(): boolean {
    return utils.iterAny(this.board.generatePseudoLegalMoves());
  }

  count(): number {
    // List conversion is faster than iterating.
    return Array.from(this).length;
  }

  *[Symbol.iterator](): IterableIterator<Move> {
    return this.board.generatePseudoLegalMoves();
  }

  contains(move: Move): boolean {
    return this.board.isPseudoLegal(move);
  }

  toString(): string {
    const builder: string[] = [];

    for (const move of this) {
      if (this.board.isLegal(move)) {
        builder.push(this.board.san(move));
      } else {
        builder.push(this.board.uci(move));
      }
    }

    const sans = builder.join(', ');
    return `<PseudoLegalMoveGenerator (${sans})>`;
  }
}

export class LegalMoveGenerator {
  board: Board;

  constructor(board: Board) {
    this.board = board;
  }

  bool(): boolean {
    return utils.iterAny(this.board.generateLegalMoves());
  }

  count(): number {
    // List conversion is faster than iterating.
    return Array.from(this).length;
  }

  *[Symbol.iterator](): IterableIterator<Move> {
    return this.board.generateLegalMoves();
  }

  contains(move: Move): boolean {
    return this.board.isLegal(move);
  }

  toString(): string {
    const builder: string[] = [];

    for (const move of this) {
      builder.push(this.board.san(move));
    }

    const sans = builder.join(', ');
    return `<LegalMoveGenerator (${sans})>`;
  }
}

export type IntoSquareSet = Bitboard | Iterable<Square>;

/**
 * A set of squares.
 *
 * >>> import chess
 * >>>
 * >>> squares = chess.SquareSet([chess.A8, chess.A1])
 * >>> squares
 * SquareSet(0x0100_0000_0000_0001)
 *
 * >>> squares = chess.SquareSet(chess.BB_A8 | chess.BB_RANK_1)
 * >>> squares
 * SquareSet(0x0100_0000_0000_00ff)
 *
 * >>> print(squares)
 * 1 . . . . . . .
 * . . . . . . . .
 * . . . . . . . .
 * . . . . . . . .
 * . . . . . . . .
 * . . . . . . . .
 * . . . . . . . .
 * 1 1 1 1 1 1 1 1
 *
 * >>> len(squares)
 * 9
 *
 * >>> bool(squares)
 * True
 *
 * >>> chess.B1 in squares
 * True
 *
 * >>> for square in squares:
 * ...     # 0 -- chess.A1
 * ...     # 1 -- chess.B1
 * ...     # 2 -- chess.C1
 * ...     # 3 -- chess.D1
 * ...     # 4 -- chess.E1
 * ...     # 5 -- chess.F1
 * ...     # 6 -- chess.G1
 * ...     # 7 -- chess.H1
 * ...     # 56 -- chess.A8
 * ...     print(square)
 * ...
 * 0
 * 1
 * 2
 * 3
 * 4
 * 5
 * 6
 * 7
 * 56
 *
 * >>> list(squares)
 * [0, 1, 2, 3, 4, 5, 6, 7, 56]
 *
 * Square sets are internally represented by 64-bit integer masks of the
 * included squares. Bitwise operations can be used to compute unions,
 * intersections and shifts.
 *
 * >>> int(squares)
 * 72057594037928191
 *
 * Also supports common set operations like
 * :func:`~chess.SquareSet.issubset()`, :func:`~chess.SquareSet.issuperset()`,
 * :func:`~chess.SquareSet.union()`, :func:`~chess.SquareSet.intersection()`,
 * :func:`~chess.SquareSet.difference()`,
 * :func:`~chess.SquareSet.symmetricDifference()` and
 * :func:`~chess.SquareSet.copy()` as well as
 * :func:`~chess.SquareSet.update()`,
 * :func:`~chess.SquareSet.intersectionUpdate()`,
 * :func:`~chess.SquareSet.differenceUpdate()`,
 * :func:`~chess.SquareSet.symmetricDifferenceUpdate()` and
 * :func:`~chess.SquareSet.clear()`.
 */
export class SquareSet {
  mask: Bitboard;

  constructor(squares: IntoSquareSet = BB_EMPTY) {
    if (typeof squares === 'bigint') {
      this.mask = squares & BB_ALL;
      return;
    } else {
      this.mask = 0n;
    }

    // Try squares as an iterable. Not under except clause for nicer backtraces
    for (const square of squares) {
      this.add(square);
    }
  }

  // Set

  contains(square: Square) {
    return utils.bool(BB_SQUARES[square] & this.mask);
  }

  iter() {
    return scanForward(this.mask);
  }

  reversed() {
    return scanReversed(this.mask);
  }

  length() {
    return popcount(this.mask);
  }

  // MutableSet

  add(square: Square) {
    this.mask |= BB_SQUARES[square];
  }

  discard(square: Square) {
    this.mask &= ~BB_SQUARES[square];
  }

  // frozenset

  /**
   * Tests if the square sets are disjoint.
   */
  isdisjoint(other: IntoSquareSet) {
    return !utils.bool(this.mask & new SquareSet(other).mask);
  }

  /**
   * Tests if this square set is a subset of another.
   */
  issubset(other: IntoSquareSet) {
    return !utils.bool(this.mask & ~new SquareSet(other).mask);
  }

  /**
   * Tests if this square set is a superset of another.
   */
  issuperset(other: IntoSquareSet) {
    return !utils.bool(~this.mask & new SquareSet(other).mask);
  }

  union(other: IntoSquareSet) {
    return this.or(other);
  }

  or(other: IntoSquareSet) {
    const r = new SquareSet(other);
    r.mask |= this.mask;
    return r;
  }

  intersection(other: IntoSquareSet) {
    return this.and(other);
  }

  and(other: IntoSquareSet) {
    const r = new SquareSet(other);
    r.mask &= this.mask;
    return r;
  }

  difference(other: IntoSquareSet) {
    return this.sub(other);
  }

  sub(other: IntoSquareSet) {
    const r = new SquareSet(other);
    r.mask = this.mask & ~r.mask;
    return r;
  }

  symmetricDifference(other: IntoSquareSet) {
    return this.mask ^ new SquareSet(other).mask;
  }

  xor(other: IntoSquareSet) {
    const r = new SquareSet(other);
    r.mask ^= this.mask;
    return r;
  }

  copy() {
    return new SquareSet(this.mask);
  }

  // set

  update(...others: IntoSquareSet[]) {
    for (const other of others) {
      this.ior(other);
    }
  }

  ior(other: IntoSquareSet) {
    this.mask |= new SquareSet(other).mask;
    return this;
  }

  intersectionUpdate(...others: IntoSquareSet[]) {
    for (const other of others) {
      this.iand(other);
    }
  }

  iand(other: IntoSquareSet) {
    this.mask &= new SquareSet(other).mask;
    return this;
  }

  differenceUpdate(other: IntoSquareSet) {
    this.isub(other);
  }

  isub(other: IntoSquareSet) {
    this.mask &= ~new SquareSet(other).mask;
    return this;
  }

  symmetricDifferenceUpdate(other: IntoSquareSet) {
    this.ixor(other);
  }

  ixor(other: IntoSquareSet) {
    this.mask ^= new SquareSet(other).mask;
    return this;
  }

  /**
   * Removes a square from the set.
   *
   * @thrwos :exc:`Error` if the given *square* was not in the set.
   */
  remove(square: Square) {
    const mask = BB_SQUARES[square];
    if (this.mask & mask) {
      this.mask ^= mask;
    } else {
      throw new Error(`KeyError: ${square}`);
    }
  }

  /**
   * Removes and returns a square from the set.
   *
   * @throws :exc:`KeyError` if the set is empty.
   */
  pop() {
    if (!this.mask) {
      throw new Error('pop from empty SquareSet');
    }

    const square = lsb(this.mask);
    this.mask &= this.mask - 1n;
    return square;
  }

  /**
   * Removes all elements from this set.
   */
  clear() {
    this.mask = BB_EMPTY;
  }

  // SquareSet

  /**
   * Iterator over the subsets of this set.
   */
  carryRippler() {
    return _carryRippler(this.mask);
  }

  /**
   * Returns a vertically mirrored copy of this square set.
   */
  mirror() {
    return new SquareSet(flipVertical(this.mask));
  }

  /**
   * Converts the set to a list of 64 bools.
   */
  tolist() {
    const result = new Array(64).fill(false);
    for (const square of this.iter()) {
      result[square] = true;
    }
    return result;
  }

  bool() {
    return utils.bool(this.mask);
  }

  equals(other: any) {
    try {
      return this.mask == new SquareSet(other as any).mask;
    } catch (e) {
      return false;
    }
  }

  lshift(shift: bigint) {
    return new SquareSet((this.mask << shift) & BB_ALL);
  }

  rshift(shift: bigint) {
    return new SquareSet(this.mask >> shift);
  }

  ilshift(shift: bigint) {
    this.mask = (this.mask << shift) & BB_ALL;
    return this;
  }

  irshift(shift: bigint) {
    this.mask >>= shift;
    return this;
  }

  invert() {
    return new SquareSet(~this.mask & BB_ALL);
  }

  int() {
    return this.mask;
  }

  index() {
    return this.mask;
  }

  toRepr() {
    return `SquareSet(${this.mask
      .toString(16)
      .padStart(16, '0')
      .match(/.{1,4}/g)!
      .join('_')})`;
  }

  toString() {
    const builder: string[] = [];

    for (const square of SQUARES_180) {
      const mask = BB_SQUARES[square];
      builder.push(this.mask & mask ? '1' : '.');

      if (!(mask & BB_FILE_H)) {
        builder.push(' ');
      } else if (square != H1) {
        builder.push('\n');
      }
    }

    return builder.join('');
  }

  _reprSvg_() {
    // TODO
    throw new Error('Not implemented');
  }

  /**
   * All squares on the rank, file or diagonal with the two squares, if they
   * are aligned.
   *
   * >>> import chess
   * >>>
   * >>> print(chess.SquareSet.ray(chess.E2, chess.B5))
   * . . . . . . . .
   * . . . . . . . .
   * 1 . . . . . . .
   * . 1 . . . . . .
   * . . 1 . . . . .
   * . . . 1 . . . .
   * . . . . 1 . . .
   * . . . . . 1 . .
   */
  ray(a: Square, b: Square) {
    return new SquareSet(ray(a, b));
  }

  /**
   * All squares on the rank, file or diagonal between the two squares
   * (bounds not included), if they are aligned.
   *
   * >>> import chess
   * >>>
   * >>> print(chess.SquareSet.between(chess.E2, chess.B5))
   * . . . . . . . .
   * . . . . . . . .
   * . . . . . . . .
   * . . . . . . . .
   * . . 1 . . . . .
   * . . . 1 . . . .
   * . . . . . . . .
   * . . . . . . . .
   */
  between(a: Square, b: Square) {
    return new SquareSet(between(a, b));
  }

  /**
   * Creates a :class:`~chess.SquareSet` from a single square.
   *
   * >>> import chess
   * >>>
   * >>> chess.SquareSet.fromSquare(chess.A1) == chess.BB_A1
   * True
   */
  static fromSquare(square: Square) {
    return new SquareSet(BB_SQUARES[square]);
  }
}


export default {
  COLORS,
  WHITE,
  BLACK,
  COLOR_NAMES,
  PIECE_TYPES,
  PAWN,
  KNIGHT,
  BISHOP,
  ROOK,
  QUEEN,
  KING,
  PIECE_SYMBOLS,
  PIECE_NAMES,
  pieceSymbol,
  pieceName,
  UNICODE_PIECE_SYMBOLS,
  FILE_NAMES,
  RANK_NAMES,
  STARTING_FEN,
  STARTING_BOARD_FEN,
  STATUS_VALID,
  STATUS_NO_WHITE_KING,
  STATUS_NO_BLACK_KING,
  STATUS_TOO_MANY_KINGS,
  STATUS_TOO_MANY_WHITE_PAWNS,
  STATUS_TOO_MANY_BLACK_PAWNS,
  STATUS_PAWNS_ON_BACKRANK,
  STATUS_TOO_MANY_WHITE_PIECES,
  STATUS_TOO_MANY_BLACK_PIECES,
  STATUS_BAD_CASTLING_RIGHTS,
  STATUS_INVALID_EP_SQUARE,
  STATUS_OPPOSITE_CHECK,
  STATUS_EMPTY,
  STATUS_RACE_CHECK,
  STATUS_RACE_OVER,
  STATUS_RACE_MATERIAL,
  STATUS_TOO_MANY_CHECKERS,
  STATUS_IMPOSSIBLE_CHECK,
  Termination,
  Outcome,
  InvalidMoveError,
  IllegalMoveError,
  AmbiguousMoveError,
  SQUARES,
  A1,
  B1,
  C1,
  D1,
  E1,
  F1,
  G1,
  H1,
  A2,
  B2,
  C2,
  D2,
  E2,
  F2,
  G2,
  H2,
  A3,
  B3,
  C3,
  D3,
  E3,
  F3,
  G3,
  H3,
  A4,
  B4,
  C4,
  D4,
  E4,
  F4,
  G4,
  H4,
  A5,
  B5,
  C5,
  D5,
  E5,
  F5,
  G5,
  H5,
  A6,
  B6,
  C6,
  D6,
  E6,
  F6,
  G6,
  H6,
  A7,
  B7,
  C7,
  D7,
  E7,
  F7,
  G7,
  H7,
  A8,
  B8,
  C8,
  D8,
  E8,
  F8,
  G8,
  H8,
  SQUARE_NAMES,
  parseSquare,
  squareName,
  square,
  squareFile,
  squareRank,
  squareDistance,
  squareManhattanDistance,
  squareKnightDistance,
  squareMirror,
  SQUARES_180,
  BB_EMPTY,
  BB_ALL,
  BB_SQUARES,
  BB_A1,
  BB_B1,
  BB_C1,
  BB_D1,
  BB_E1,
  BB_F1,
  BB_G1,
  BB_H1,
  BB_A2,
  BB_B2,
  BB_C2,
  BB_D2,
  BB_E2,
  BB_F2,
  BB_G2,
  BB_H2,
  BB_A3,
  BB_B3,
  BB_C3,
  BB_D3,
  BB_E3,
  BB_F3,
  BB_G3,
  BB_H3,
  BB_A4,
  BB_B4,
  BB_C4,
  BB_D4,
  BB_E4,
  BB_F4,
  BB_G4,
  BB_H4,
  BB_A5,
  BB_B5,
  BB_C5,
  BB_D5,
  BB_E5,
  BB_F5,
  BB_G5,
  BB_H5,
  BB_A6,
  BB_B6,
  BB_C6,
  BB_D6,
  BB_E6,
  BB_F6,
  BB_G6,
  BB_H6,
  BB_A7,
  BB_B7,
  BB_C7,
  BB_D7,
  BB_E7,
  BB_F7,
  BB_G7,
  BB_H7,
  BB_A8,
  BB_B8,
  BB_C8,
  BB_D8,
  BB_E8,
  BB_F8,
  BB_G8,
  BB_H8,
  BB_CORNERS,
  BB_CENTER,
  BB_LIGHT_SQUARES,
  BB_DARK_SQUARES,
  BB_FILES,
  BB_FILE_A,
  BB_FILE_B,
  BB_FILE_C,
  BB_FILE_D,
  BB_FILE_E,
  BB_FILE_F,
  BB_FILE_G,
  BB_FILE_H,
  BB_RANKS,
  BB_RANK_1,
  BB_RANK_2,
  BB_RANK_3,
  BB_RANK_4,
  BB_RANK_5,
  BB_RANK_6,
  BB_RANK_7,
  BB_RANK_8,
  BB_BACKRANKS,
  lsb,
  scanForward,
  msb,
  scanReversed,
  popcount,
  flipVertical,
  flipHorizontal,
  flipDiagonal,
  flipAntiDiagonal,
  shiftDown,
  shift2Down,
  shiftUp,
  shift2Up,
  shiftRight,
  shift2Right,
  shiftLeft,
  shift2Left,
  shiftUpLeft,
  shiftUpRight,
  shiftDownLeft,
  shiftDownRight,
  _slidingAttacks,
  _stepAttacks,
  BB_KNIGHT_ATTACKS,
  BB_KING_ATTACKS,
  BB_PAWN_ATTACKS,
  _edges,
  _carryRippler,
  _attackTable,
  BB_DIAG_MASKS,
  BB_DIAG_ATTACKS,
  BB_FILE_MASKS,
  BB_FILE_ATTACKS,
  BB_RANK_MASKS,
  BB_RANK_ATTACKS,
  _rays,
  BB_RAYS,
  ray,
  between,
  SAN_REGEX,
  FEN_CASTLING_REGEX,
  Piece,
  Move,
  BaseBoard,
  _BoardState,
  Board,
  PseudoLegalMoveGenerator,
  LegalMoveGenerator,
  SquareSet,
};
