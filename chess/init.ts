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
type RankOrFileIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * Get the number of bits necessary to represent `n` in binary.
 */
const bitLength = (n: number | bigint): number => {
  let length = 0;
  if (typeof n === 'number') {
    while (n) {
      n >>= 1;
      length++;
    }
  } else {
    while (n) {
      n >>= 1n;
      length++;
    }
  }
  return length;
};

/**
 * Number of ones in the binary representation of the absolute value of `n`.
 * Also known as the population count.
 */
const bitCount = (n: number | bigint): number => {
  let count = 0;
  if (typeof n === 'number') {
    while (n) {
      n &= n - 1;
      count++;
    }
  } else {
    while (n) {
      n &= n - 1n;
      count++;
    }
  }
  return count;
};

const bool = (x: any) => {
  return !!x;
};

/** Allow the truthy/falsy indexing trick, like `this.occupiedCo[colorIdx(WHITE)]` */
const colorIdx = (color: Color): 1 | 0 => (color ? 1 : 0);


/** ========== Direct transpilation ========== */

const __author__ = 'Niklas Fiekas';
const __email__ = 'niklas.fiekas@backscattering.de';
const __version__ = '1.10.0';

const __transpiler_author__ = 'Jackson Hall';
const __transpiler_email__ = 'jacksonthall22@gmail.com';
const __transpiled_version__ = '0.0.1';

type EnPassantSpec = 'legal' | 'fen' | 'xfen';

type Color = boolean;
const [WHITE, BLACK] = [true, false];
const COLORS: Color[] = [WHITE, BLACK];
type ColorName = 'white' | 'black';
const COLOR_NAMES: ColorName[] = ['white', 'black'];

const enum PieceType {
  PAWN = 1,
  KNIGHT,  // = 2, etc.
  BISHOP,
  ROOK,
  QUEEN,
  KING,
}
const PIECE_TYPES: PieceType[] = Array.from({ length: 6 }, (_, i) => i + 1);
const [PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING] = PIECE_TYPES;
const PIECE_SYMBOLS: (string | null)[] = [null, 'p', 'n', 'b', 'r', 'q', 'k'];
const PIECE_NAMES: (string | null)[] = [
  null,
  'pawn',
  'knight',
  'bishop',
  'rook',
  'queen',
  'king',
];

const pieceSymbol = (pieceType: PieceType) => {
  return PIECE_SYMBOLS[pieceType] as string;
};

const pieceName = (pieceType: PieceType) => {
  return PIECE_NAMES[pieceType] as string;
};

const UNICODE_PIECE_SYMBOLS: { [key: string]: string } = {
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

const FILE_NAMES: string[] = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

const RANK_NAMES: string[] = ['1', '2', '3', '4', '5', '6', '7', '8'];

/** The FEN for the standard chess starting position. */
const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** The board part of the FEN for the standard chess starting position. */
const STARTING_BOARD_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';

const enum Status {
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

const STATUS_VALID = Status.VALID;
const STATUS_NO_WHITE_KING = Status.NO_WHITE_KING;
const STATUS_NO_BLACK_KING = Status.NO_BLACK_KING;
const STATUS_TOO_MANY_KINGS = Status.TOO_MANY_KINGS;
const STATUS_TOO_MANY_WHITE_PAWNS = Status.TOO_MANY_WHITE_PAWNS;
const STATUS_TOO_MANY_BLACK_PAWNS = Status.TOO_MANY_BLACK_PAWNS;
const STATUS_PAWNS_ON_BACKRANK = Status.PAWNS_ON_BACKRANK;
const STATUS_TOO_MANY_WHITE_PIECES = Status.TOO_MANY_WHITE_PIECES;
const STATUS_TOO_MANY_BLACK_PIECES = Status.TOO_MANY_BLACK_PIECES;
const STATUS_BAD_CASTLING_RIGHTS = Status.BAD_CASTLING_RIGHTS;
const STATUS_INVALID_EP_SQUARE = Status.INVALID_EP_SQUARE;
const STATUS_OPPOSITE_CHECK = Status.OPPOSITE_CHECK;
const STATUS_EMPTY = Status.EMPTY;
const STATUS_RACE_CHECK = Status.RACE_CHECK;
const STATUS_RACE_OVER = Status.RACE_OVER;
const STATUS_RACE_MATERIAL = Status.RACE_MATERIAL;
const STATUS_TOO_MANY_CHECKERS = Status.TOO_MANY_CHECKERS;
const STATUS_IMPOSSIBLE_CHECK = Status.IMPOSSIBLE_CHECK;

/**
 * Enum with reasons for a game to be over.
 */
enum Termination {
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
class Outcome {
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
class InvalidMoveError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'InvalidMoveError';
    Object.setPrototypeOf(this, InvalidMoveError.prototype);
  }
}

/**
 * Raised when the attempted move is illegal in the current position
 */
class IllegalMoveError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'IllegalMoveError';
    Object.setPrototypeOf(this, IllegalMoveError.prototype);
  }
}

/**
 * Raised when the attempted move is ambiguous in the current position
 */
class AmbiguousMoveError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'AmbiguousMoveError';
    Object.setPrototypeOf(this, AmbiguousMoveError.prototype);
  }
}

// prettier-ignore
const enum Square { // Instead of `Square = number`
  A1, B1, C1, D1, E1, F1, G1, H1,
  A2, B2, C2, D2, E2, F2, G2, H2,
  A3, B3, C3, D3, E3, F3, G3, H3,
  A4, B4, C4, D4, E4, F4, G4, H4,
  A5, B5, C5, D5, E5, F5, G5, H5,
  A6, B6, C6, D6, E6, F6, G6, H6,
  A7, B7, C7, D7, E7, F7, G7, H7,
  A8, B8, C8, D8, E8, F8, G8, H8,
}
const SQUARES = Array.from({ length: 64 }, (_, i) => i) as Square[];
// prettier-ignore
const [
  A1, B1, C1, D1, E1, F1, G1, H1,
  A2, B2, C2, D2, E2, F2, G2, H2,
  A3, B3, C3, D3, E3, F3, G3, H3,
  A4, B4, C4, D4, E4, F4, G4, H4,
  A5, B5, C5, D5, E5, F5, G5, H5,
  A6, B6, C6, D6, E6, F6, G6, H6,
  A7, B7, C7, D7, E7, F7, G7, H7,
  A8, B8, C8, D8, E8, F8, G8, H8,
] = SQUARES;

const SQUARE_NAMES = RANK_NAMES.flatMap((r) =>
  FILE_NAMES.map((f) => f + r),
);

/**
 * Gets the square index for the given square *name*
 * (e.g., ``a1`` returns ``0``).
 *
 * @throws :exc:`Error` if the square name is invalid.
 */
const parseSquare = (name: string): Square => {
  const idx = SQUARE_NAMES.indexOf(name);
  if (idx === -1) {
    throw new Error(`Invalid square name ${name}`);
  }
  return idx as Square;
};

/**
 * Gets the name of the square, like ``a3``.
 */
const squareName = (square: Square): string => {
  return SQUARE_NAMES[square];
};

/**
 * Gets a square number by file and rank index.
 */
const square = (
  fileIndex: RankOrFileIndex,
  rankIndex: RankOrFileIndex,
): Square => {
  return (rankIndex * 8 + fileIndex) as Square;
};

/**
 * Gets the file index of the square where ``0`` is the a-file.
 */
const squareFile = (square: Square): RankOrFileIndex => {
  return (square & 7) as RankOrFileIndex;
};

/**
 * Gets the rank index of the square where ``0`` is the first rank.
 */
const squareRank = (square: Square): RankOrFileIndex => {
  return (square >> 3) as RankOrFileIndex;
};

/**
 * Gets the Chebyshev distance (i.e., the number of king steps) from square *a* to *b*.
 */
const squareDistance = (a: Square, b: Square): number => {
  return Math.max(
    Math.abs(squareFile(a) - squareFile(b)),
    Math.abs(squareRank(a) - squareRank(b)),
  );
};

/**
 * Gets the Manhattan/Taxicab distance (i.e., the number of orthogonal king steps) from square *a* to *b*.
 */
const squareManhattanDistance = (a: Square, b: Square): number => {
  return (
    Math.abs(squareFile(a) - squareFile(b)) +
    Math.abs(squareRank(a) - squareRank(b))
  );
};

/**
 * Gets the Knight distance (i.e., the number of knight moves) from square *a* to *b*.
 */
const squareKnightDistance = (a: Square, b: Square): number => {
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
const squareMirror = (square: Square): Square => {
  return square ^ (0x38 as Square);
};

const SQUARES_180 = SQUARES.map(squareMirror);

type Bitboard = bigint;
const BB_EMPTY = 0n;
const BB_ALL = 0xffff_ffff_ffff_ffffn;

const BB_SQUARES = SQUARES.map((s) => 1n << BigInt(s));
// prettier-ignore
const [
  BB_A1, BB_B1, BB_C1, BB_D1, BB_E1, BB_F1, BB_G1, BB_H1,
  BB_A2, BB_B2, BB_C2, BB_D2, BB_E2, BB_F2, BB_G2, BB_H2,
  BB_A3, BB_B3, BB_C3, BB_D3, BB_E3, BB_F3, BB_G3, BB_H3,
  BB_A4, BB_B4, BB_C4, BB_D4, BB_E4, BB_F4, BB_G4, BB_H4,
  BB_A5, BB_B5, BB_C5, BB_D5, BB_E5, BB_F5, BB_G5, BB_H5,
  BB_A6, BB_B6, BB_C6, BB_D6, BB_E6, BB_F6, BB_G6, BB_H6,
  BB_A7, BB_B7, BB_C7, BB_D7, BB_E7, BB_F7, BB_G7, BB_H7,
  BB_A8, BB_B8, BB_C8, BB_D8, BB_E8, BB_F8, BB_G8, BB_H8,
] = BB_SQUARES;

const BB_CORNERS = BB_A1 | BB_H1 | BB_A8 | BB_H8;
const BB_CENTER = BB_D4 | BB_E4 | BB_D5 | BB_E5;

const BB_LIGHT_SQUARES = 0x55aa_55aa_55aa_55aan;
const BB_DARK_SQUARES = 0xaa55_aa55_aa55_aa55n;

const BB_FILES = Array.from({ length: 8 }, (_, i) => i).map(
  (i) => 0x0101_0101_0101_0101n << BigInt(i),
);
const [
  BB_FILE_A,
  BB_FILE_B,
  BB_FILE_C,
  BB_FILE_D,
  BB_FILE_E,
  BB_FILE_F,
  BB_FILE_G,
  BB_FILE_H,
] = BB_FILES;

const BB_RANKS = Array.from({ length: 8 }, (_, i) => i).map(
  (i) => 0xffn << BigInt(8 * i),
);
const [
  BB_RANK_1,
  BB_RANK_2,
  BB_RANK_3,
  BB_RANK_4,
  BB_RANK_5,
  BB_RANK_6,
  BB_RANK_7,
  BB_RANK_8,
] = BB_RANKS;

const BB_BACKRANKS = BB_RANK_1 | BB_RANK_8;

const lsb = (bb: Bitboard): Square => {
  return bitLength(bb & -bb) - 1;
};

function* scanForward(bb: Bitboard): IterableIterator<Square> {
  while (bb) {
    let r = bb & -bb;
    yield (bitLength(r) - 1) as Square;
    bb ^= r;
  }
}

const msb = (bb: Bitboard): Square => {
  return (bitLength(bb) - 1) as Square;
};

function* scanReverse(bb: Bitboard): IterableIterator<Square> {
  while (bb) {
    let r = bitLength(bb) - 1;
    yield r as Square;
    bb ^= BB_SQUARES[r];
  }
}

const popcount = (bb: Bitboard): number => bitCount(bb);

const flipVertical = (bb: Bitboard): Bitboard => {
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

const flipHorizontal = (bb: Bitboard): Bitboard => {
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

const flipDiagonal = (bb: Bitboard): Bitboard => {
  // https://www.chessprogramming.org/Flipping_Mirroring_and_Rotating#FlipabouttheDiagonal
  let t = (bb ^ (bb << 28n)) & 0x0f0f_0f0f_0000_0000n;
  bb = bb ^ t ^ (t >> 28n);
  t = (bb ^ (bb << 14n)) & 0x3333_0000_3333_0000n;
  bb = bb ^ t ^ (t >> 14n);
  t = (bb ^ (bb << 7n)) & 0x5500_5500_5500_5500n;
  bb = bb ^ t ^ (t >> 7n);
  return bb;
};

const flipAntiDiagonal = (bb: Bitboard): Bitboard => {
  // https://www.chessprogramming.org/Flipping_Mirroring_and_Rotating#FlipabouttheAntidiagonal
  let t = bb ^ (bb << 36n);
  bb = bb ^ ((t ^ (bb >> 36n)) & 0xf0f0_f0f0_0f0f_0f0fn);
  t = (bb ^ (bb << 18n)) & 0xcccc_0000_cccc_0000n;
  bb = bb ^ t ^ (t >> 18n);
  t = (bb ^ (bb << 9n)) & 0xaa00_aa00_aa00_aa00n;
  bb = bb ^ t ^ (t >> 9n);
  return bb;
};

const shiftDown = (b: Bitboard): Bitboard => {
  return b >> 8n;
};

const shift2Down = (b: Bitboard): Bitboard => {
  return b >> 16n;
};

const shiftUp = (b: Bitboard): Bitboard => {
  return (b << 8n) & BB_ALL;
};

const shift2Up = (b: Bitboard): Bitboard => {
  return (b << 16n) & BB_ALL;
};

const shiftRight = (b: Bitboard): Bitboard => {
  return (b << 1n) & ~BB_FILE_A & BB_ALL;
};

const shift2Right = (b: Bitboard): Bitboard => {
  return (b << 2n) & ~BB_FILE_A & ~BB_FILE_B & BB_ALL;
};

const shiftLeft = (b: Bitboard): Bitboard => {
  return (b >> 1n) & ~BB_FILE_H;
};

const shift2Left = (b: Bitboard): Bitboard => {
  return (b >> 2n) & ~BB_FILE_G & ~BB_FILE_H;
};

const shiftUpLeft = (b: Bitboard): Bitboard => {
  return (b << 7n) & ~BB_FILE_H & BB_ALL;
};

const shiftUpRight = (b: Bitboard): Bitboard => {
  return (b << 9n) & ~BB_FILE_A & BB_ALL;
};

const shiftDownLeft = (b: Bitboard): Bitboard => {
  return (b >> 9n) & ~BB_FILE_H;
};

const shiftDownRight = (b: Bitboard): Bitboard => {
  return (b >> 7n) & ~BB_FILE_A;
};

const _slidingAttacks = (
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

const _stepAttacks = (square: Square, deltas: number[]): Bitboard => {
  return _slidingAttacks(square, BB_ALL, deltas);
};

const BB_KNIGHT_ATTACKS = SQUARES.map((sq) =>
  _stepAttacks(sq, [17, 15, 10, 6, -17, -15, -10, -6]),
);
const BB_KING_ATTACKS = SQUARES.map((sq) =>
  _stepAttacks(sq, [9, 8, 7, 1, -9, -8, -7, -1]),
);
const BB_PAWN_ATTACKS = [
  [-7, -9],
  [7, 9],
].map((deltas) => SQUARES.map((sq) => _stepAttacks(sq, deltas)));

const _edges = (square: Square): Bitboard => {
  return (
    ((BB_RANK_1 | BB_RANK_8) & ~BB_RANKS[squareRank(square)]) |
    ((BB_FILE_A | BB_FILE_H) & ~BB_FILES[squareFile(square)])
  );
};

function* _carryRippler(mask: Bitboard): IterableIterator<Bitboard> {
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

function _attackTable(
  deltas: number[],
): [Bitboard[], Map<Bitboard, Bitboard>[]] {
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

const [BB_DIAG_MASKS, BB_DIAG_ATTACKS] = _attackTable([-9, -7, 7, 9]);
const [BB_FILE_MASKS, BB_FILE_ATTACKS] = _attackTable([-8, 8]);
const [BB_RANK_MASKS, BB_RANK_ATTACKS] = _attackTable([-1, 1]);

const _rays = (): Bitboard[][] => {
  let rays: Bitboard[][] = [];
  BB_SQUARES.forEach((bb_a, a) => {
    let rays_row: Bitboard[] = [];
    BB_SQUARES.forEach((bb_b, b) => {
      if (BB_DIAG_ATTACKS[a][0] & bb_b) {
        rays_row.push(
          ((BB_DIAG_ATTACKS[a].get(0n) as Bitboard) &
            (BB_DIAG_ATTACKS[b].get(0n) as Bitboard)) |
            bb_a |
            bb_b, // TODO Check if prettier adding a comma here matters (CGPT says no)
        );
      } else if (BB_RANK_ATTACKS[a][0] & bb_b) {
        rays_row.push(BB_RANK_ATTACKS[a][0] | bb_a);
      } else if (BB_FILE_ATTACKS[a][0] & bb_b) {
        rays_row.push(BB_FILE_ATTACKS[a][0] | bb_a);
      } else {
        rays_row.push(BB_EMPTY);
      }
    });
    rays.push(rays_row);
  });

  return rays;
};

const BB_RAYS = _rays();

const ray = (a: Square, b: Square): Bitboard => {
  return BB_RAYS[a][b];
};

const between = (a: Square, b: Square): Bitboard => {
  const bb = BB_RAYS[a][b] & ((BB_ALL << BigInt(a)) ^ (BB_ALL << BigInt(b)));
  return bb & (bb - 1n);
};

const SAN_REGEX =
  /^([NBKRQ])?([a-h])?([1-8])?[\\-x]?([a-h][1-8])(=?[nbrqkNBRQK])?[\\+#]?$/;

const FEN_CASTLING_REGEX = /^(?:-|[KQABCDEFGH]{0,2}[kqabcdefgh]{0,2})$/;

/**
 * A piece with type and color.
 */
class Piece {
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
  unicodeSymbol({ invertColor }: { invertColor: boolean } = { invertColor: false }): string {
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

  _repr_svg_(): string {
    // todo
    return '';
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
class Move {
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
    return bool(
      this.fromSquare ||
      this.toSquare ||
      this.promotion !== null ||
      this.drop !== null
    );
  }

  toRepr(): string {
    return `Move.fromUci(${this.uci()})`;
  }

  toString(): string {
    return this.uci();
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
      const drop = PIECE_SYMBOLS.indexOf(uci[0].toLowerCase());
      const square = SQUARE_NAMES.indexOf(uci.slice(2));
      if (drop === -1 || square === -1) {
        throw new InvalidMoveError(`invalid uci: ${uci}`);
      }
      return new Move(square, square, { drop: drop });
    } else if (4 <= uci.length && uci.length <= 5) {
      const from_square = SQUARE_NAMES.indexOf(uci.slice(0, 2));
      const to_square = SQUARE_NAMES.indexOf(uci.slice(2, 4));
      const promotion = uci.length == 5 ? PIECE_SYMBOLS.indexOf(uci[4]) : null;
      if (from_square === -1 || to_square === -1 || promotion === -1) {
        throw new InvalidMoveError(`invalid uci: {$uci}`);
      }
      if (from_square == to_square) {
        throw new InvalidMoveError(
          `invalid uci (use 0000 for null moves): ${uci}`,
        );
      }
      return new Move(from_square, to_square, { promotion: promotion });
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
   * > import chess from 'chess.ts'
   * >
   * > bool(chess.Move.null())
   * False
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
 * otherwise specified in the optional *board_fen* argument. If *board_fen*
 * is ``null``, an empty board is created.
 */
class BaseBoard {
  occupied: Bitboard;
  occupiedCo: [Bitboard, Bitboard];
  pawns: Bitboard;
  knights: Bitboard;
  bishops: Bitboard;
  rooks: Bitboard;
  queens: Bitboard;
  kings: Bitboard;
  promoted: Bitboard;

  constructor(boardFen?: string) {
    this.occupiedCo = [BB_EMPTY, BB_EMPTY];

    if (boardFen !== undefined) {
      this._clearBoard();
    } else if (boardFen === STARTING_BOARD_FEN) {
      this._resetBoard();
    } else {
      this._setBoardFen(boardFen);
    }
  }

  _resetBoard() {
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
  resetBoard() {
    this._resetBoard();
  }

  _clearBoard() {
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
  clearBoard() {
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
      const color = bool(this.occupiedCo[colorIdx(WHITE)] & mask);
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

  attacks_mask(square: Square): Bitboard {
    const bb_square = BB_SQUARES[square];

    if (bb_square & this.pawns) {
      const color = bool(bb_square & this.occupiedCo[colorIdx(WHITE)]);
      return BB_PAWN_ATTACKS[colorIdx(color)][square];
    } else if (bb_square & this.knights) {
      return BB_KNIGHT_ATTACKS[square];
    } else if (bb_square & this.kings) {
      return BB_KING_ATTACKS[square];
    } else {
      let attacks = 0n;
      if (bb_square & this.bishops || bb_square & this.queens) {
        attacks = BB_DIAG_ATTACKS[square].get(
          BB_DIAG_MASKS[square] & this.occupied,
        ) as Bitboard;
      }
      if (bb_square & this.rooks || bb_square & this.queens) {
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

  // ...
}

class _BoardState<BoardT> {}

class Board extends BaseBoard {}

class PseudoLegalMoveGenerator {}

class LegalMoveGenerator {}

// const IntoSquareSet =

class SquareSet {}
