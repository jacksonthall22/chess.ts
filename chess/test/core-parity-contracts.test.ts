import { describe, expect, test } from 'vitest'

import * as chess from '../index'
import * as engine from '../engine'
import * as pgn from '../pgn'
import * as utils from '../utils'

describe('TypeScript-native parity contracts', () => {
  test('inline Python whitespace translations preserve the exact source character set', () => {
    expect(
      '\u001cvalue\u001c'
        .replace(utils.PYTHON_LEADING_WHITESPACE, '')
        .replace(utils.PYTHON_TRAILING_WHITESPACE, ''),
    ).toBe('value')
    expect(
      '\ufeffvalue\ufeff'
        .replace(utils.PYTHON_LEADING_WHITESPACE, '')
        .replace(utils.PYTHON_TRAILING_WHITESPACE, ''),
    ).toBe('\ufeffvalue\ufeff')
    expect('value\u001c'.replace(utils.PYTHON_TRAILING_WHITESPACE, '')).toBe(
      'value',
    )
    expect('value\ufeff'.replace(utils.PYTHON_TRAILING_WHITESPACE, '')).toBe(
      'value\ufeff',
    )
    expect(
      'first\u001csecond'
        .split(utils.PYTHON_WHITESPACE_RUN)
        .filter(Boolean),
    ).toEqual(['first', 'second'])
    expect(utils.splitWhitespaceWithMax('first second third', 1)).toEqual(
      ['first', 'second third'],
    )
  })

  test('Piece representation uses the translated TypeScript API name', () => {
    expect(chess.Piece.fromSymbol('N').toRepr()).toBe(
      "Piece.fromSymbol('N')",
    )
  })

  test('dataclass equality requires the same concrete class', () => {
    class DerivedPiece extends chess.Piece {}
    class DerivedWdl extends engine.Wdl {}

    const piece = new chess.Piece(chess.BISHOP, chess.WHITE)
    const derivedPiece = new DerivedPiece(chess.BISHOP, chess.WHITE)
    const wdl = new engine.Wdl(1, 2, 3)
    const derivedWdl = new DerivedWdl(1, 2, 3)

    expect(piece.equals(new chess.Piece(chess.BISHOP, chess.WHITE))).toBe(true)
    expect(piece.equals(derivedPiece)).toBe(false)
    expect(derivedPiece.equals(piece)).toBe(false)
    expect(wdl.equals(new engine.Wdl(1, 2, 3))).toBe(true)
    expect(wdl.equals(derivedWdl)).toBe(false)
    expect(derivedWdl.equals(wdl)).toBe(false)

    const nanWdl = new engine.Wdl(Number.NaN, 2, 3)
    expect(nanWdl.equals(nanWdl)).toBe(true)
    expect(nanWdl.equals(new engine.Wdl(Number.NaN, 2, 3))).toBe(false)
  })

  test('Stockfish 16.1 clamps NaN with Python operand ordering', () => {
    expect(
      new engine.Cp(51).wdl({ model: 'sf16.1', ply: Number.NaN }),
    ).toEqual(new engine.Wdl(164, 830, 6))
    expect(new engine.Cp(Number.NaN).wdl({ model: 'sf16.1' })).toEqual(
      new engine.Wdl(1000, -1000, 1000),
    )
  })

  test('PGN annotations use Python Unicode decimal digits', () => {
    const node = new pgn.Game()

    node.comments = ['[%clk ١:٠٢:٠٣]']
    expect(node.clock()).toBe(3723)

    node.comments = ['[%emt ١:٠٢:٠٣.٥]']
    expect(node.emt()).toBe(3723.5)

    node.comments = ['[%eval #١٢,٣]']
    expect(node.eval()?.white().mate()).toBe(12)
    expect(node.evalDepth()).toBe(3)
  })

  test('StringIO reads and writes from its Python-compatible cursor', () => {
    const stream = new pgn.StringIO('prefix')

    expect(stream.write('abc')).toBe(3)
    expect(stream.getValue()).toBe('abcfix')
    expect(stream.read()).toBe('fix')
    expect(stream.read()).toBe('')
  })

  test('PGN clock annotations format large hours without exponent notation', () => {
    const node = new pgn.Game()
    const expectedHours = '277777777777777796739760128'

    node.setClock(1e30)
    expect(node.comments).toEqual([`[%clk ${expectedHours}:24:16]`])

    node.comments = []
    node.setEmt(1e30)
    expect(node.comments).toEqual([`[%emt ${expectedHours}:24:16]`])

    node.comments = []
    node.setClock(2.9816236034477412e19)
    expect(node.comments).toEqual(['[%clk 8282287787354836:45:52]'])
  })

  test('PGN clock annotations delay integer conversion until float addition', () => {
    const node = new pgn.Game()
    const annotation = '9778509567454608800:01:55.073'

    node.comments = [`[%clk ${annotation}]`]
    expect(node.clock()).toBe(3.520263444283659e22)

    node.comments = [`[%emt ${annotation}]`]
    expect(node.emt()).toBe(3.520263444283659e22)
  })

  test('Score ordering preserves Python unordered NaN comparisons', () => {
    const pairs: [engine.Score, engine.Score][] = [
      [new engine.Cp(Number.NaN), new engine.Cp(0)],
      [new engine.Cp(0), new engine.Cp(Number.NaN)],
      [new engine.Mate(Number.NaN), new engine.Mate(0)],
      [new engine.Mate(0), new engine.Mate(Number.NaN)],
    ]

    for (const [left, right] of pairs) {
      expect(left.equals(right)).toBe(false)
      expect(left.lt(right)).toBe(false)
      expect(left.le(right)).toBe(false)
      expect(left.gt(right)).toBe(false)
      expect(left.ge(right)).toBe(false)
    }

    const cp = new engine.Cp(Number.NaN)
    expect(cp.equals(cp)).toBe(true)
    expect(cp.lt(cp)).toBe(false)
    expect(cp.le(cp)).toBe(true)
    expect(cp.gt(cp)).toBe(false)
    expect(cp.ge(cp)).toBe(true)

    const mate = new engine.Mate(Number.NaN)
    expect(mate.equals(mate)).toBe(false)
    expect(mate.le(mate)).toBe(false)
    expect(mate.ge(mate)).toBe(false)
  })

  test('point-of-view equality delegates to translated value equality', () => {
    expect(
      new engine.PovScore(new engine.Cp(25), chess.WHITE).equals(
        new engine.PovScore(new engine.Cp(25), chess.WHITE),
      ),
    ).toBe(true)
    expect(
      new engine.PovWdl(new engine.Wdl(1, 2, 3), chess.BLACK).equals(
        new engine.PovWdl(new engine.Wdl(1, 2, 3), chess.BLACK),
      ),
    ).toBe(true)
  })

  test('BaseBoard factories and copies preserve subclasses', () => {
    class DerivedBoard extends chess.BaseBoard {
      initializedWith: string | null

      constructor(boardFen: string | null = chess.STARTING_BOARD_FEN) {
        super(boardFen)
        this.initializedWith = boardFen
      }
    }

    const original = new DerivedBoard()
    const copy = original.copy()
    const empty = DerivedBoard.empty()
    const chess960 = DerivedBoard.fromChess960Pos(518)

    expect(copy).toBeInstanceOf(DerivedBoard)
    expect(copy.initializedWith).toBeNull()
    expect(copy.boardFen()).toBe(original.boardFen())
    expect(empty).toBeInstanceOf(DerivedBoard)
    expect(empty.initializedWith).toBeNull()
    expect(empty.boardFen()).toBe('8/8/8/8/8/8/8/8')
    expect(chess960).toBeInstanceOf(DerivedBoard)
    expect(chess960.initializedWith).toBeNull()
    expect(chess960.boardFen()).toBe(chess.STARTING_BOARD_FEN)
  })

  test('attack queries preserve explicit empty and iterable occupancy overrides', () => {
    const board = new chess.Board('4r3/8/8/8/8/8/4K3/8 w - - 0 1')

    expect(Array.from(board.attackers(chess.BLACK, chess.E1))).toEqual([])
    expect(
      board.attackersMask(
        chess.BLACK,
        chess.E1,
        board.occupied ^ chess.BB_E2,
      ),
    ).toBe(chess.BB_E8)
    expect(board.isAttackedBy(chess.BLACK, chess.E1, 0n)).toBe(true)
    expect(
      Array.from(board.attackers(chess.BLACK, chess.E1, [chess.E8])),
    ).toEqual([chess.E8])
  })

  test('setEpd preserves and parses the complete operation field', () => {
    const board = new chess.Board()
    const operations = board.setEpd(
      '8/8/8/8/8/8/8/8 w - - ce 55; id "complete field";',
    )

    expect(operations.get('ce')).toBe(55)
    expect(operations.get('id')).toBe('complete field')
    expect(board.fen()).toBe('8/8/8/8/8/8/8/8 w - - 0 1')
  })

  test('setEpd accepts Python numeric whitespace before later operations', () => {
    const operations = new chess.Board().setEpd(
      '8/8/8/8/8/8/8/8 w - - ce 55 ; acd 1.5\t; id "x";',
    )

    expect(operations.get('ce')).toBe(55)
    expect(operations.get('acd')).toBe(1.5)
    expect(operations.get('id')).toBe('x')
  })

  test('setEpd uses Python exact whitespace characters', () => {
    const separator = '\u001c'
    const operations = new chess.Board().setEpd(
      ['8/8/8/8/8/8/8/8', 'w', '-', '-', 'ce 55\u0085;'].join(separator),
    )

    expect(operations.get('ce')).toBe(55)
    expect(() =>
      new chess.Board().setEpd(
        '\ufeff8/8/8/8/8/8/8/8 w - -',
      ),
    ).toThrow(chess.ValueError)
  })

  test.each(['hmvc 1.0;', 'fmvn 1e3;', 'hmvc -0.0;'])(
    'setEpd rejects the Python float counter operation %s',
    operation => {
      const board = new chess.Board()
      const originalFen = board.fen()

      expect(() =>
        board.setEpd(`8/8/8/8/8/8/8/8 w - - ${operation}`),
      ).toThrow(chess.ValueError)
      expect(board.fen()).toBe(originalFen)
    },
  )

  test('setEpd counter type follows the final repeated operation', () => {
    const operations = new chess.Board().setEpd(
      '8/8/8/8/8/8/8/8 w - - hmvc 1.0; hmvc 2;',
    )

    expect(operations.get('hmvc')).toBe(2)
  })

  test('setEpd uses Python whitespace splitting for move operands', () => {
    const board = new chess.Board()
    const operations = board.setEpd(
      `${chess.STARTING_FEN.split(' ').slice(0, 4).join(' ')} ` +
        'bm e4\t d4; am Nf3\nNc3; pv e4  e5;',
    )

    expect(
      (operations.get('bm') as chess.Move[]).map(move => move.uci()),
    ).toEqual(['e2e4', 'd2d4'])
    expect(
      (operations.get('am') as chess.Move[]).map(move => move.uci()),
    ).toEqual(['g1f3', 'b1c3'])
    expect(
      (operations.get('pv') as chess.Move[]).map(move => move.uci()),
    ).toEqual(['e2e4', 'e7e5'])
  })

  test.each([
    ['1_000', 1000],
    ['.5', 0.5],
    ['5.', 5],
    ['1e3', 1000],
    ['-0', 0],
    ['-0.0', -0],
  ])('setEpd parses the complete Python numeric token %s', (token, value) => {
    const operations = new chess.Board().setEpd(
      `8/8/8/8/8/8/8/8 w - - ce ${token};`,
    )

    expect(operations.get('ce')).toBe(value)
  })

  test('setEpd preserves arbitrary-size Python integers as bigint', () => {
    const value = 9007199254740992n
    const board = new chess.Board()
    const operations = board.setEpd(
      `8/8/8/8/8/8/8/8 w - - ce ${value};`,
    )

    expect(operations.get('ce')).toBe(value)
    expect(board.epd({}, new Map([['ce', value]]))).toContain(
      `ce ${value};`,
    )
  })

  test('setEpd rejects floats that overflow to a non-finite value', () => {
    expect(() =>
      new chess.Board().setEpd(
        '8/8/8/8/8/8/8/8 w - - ce 1e309;',
      ),
    ).toThrow(chess.ValueError)
  })

  test('setEpd preserves Python float kind when operations are re-emitted', () => {
    const board = new chess.Board()
    const operations = board.setEpd(
      '8/8/8/8/8/8/8/8 w - - ce 1.00; acd -0.0; acs 1e-7;',
    )

    expect(board.epd({}, operations)).toBe(
      '8/8/8/8/8/8/8/8 w - - ce 1.0; acd -0.0; acs 1e-07;',
    )
  })

  test('setEpd recognizes the exact Python whitespace set inside operations', () => {
    const operations = new chess.Board().setEpd(
      '8/8/8/8/8/8/8/8 w - - ce\u001c55;',
    )

    expect(operations.get('ce')).toBe(55)
  })

  test.each([
    ['1١', 11],
    ['1.١', 1.1],
    ['1e١', 10],
    ['1_१', 11],
  ])(
    'setEpd parses Python Unicode decimal digits in %s',
    (token, value) => {
      const operations = new chess.Board().setEpd(
        `8/8/8/8/8/8/8/8 w - - ce ${token};`,
      )

      expect(operations.get('ce')).toBe(value)
    },
  )

  test.each(['1abc', '+', '.', '1e', '1_', '0x10'])(
    'setEpd rejects the complete malformed numeric token %s',
    token => {
      const board = new chess.Board()
      const originalFen = board.fen()

      expect(() =>
        board.setEpd(`8/8/8/8/8/8/8/8 w - - ce ${token};`),
      ).toThrow(chess.ValueError)
      expect(board.fen()).toBe(originalFen)
    },
  )

  test('SquareSet operations accept both masks and SquareSet values', () => {
    const masks = [
      chess.BB_EMPTY,
      chess.BB_A1,
      chess.BB_RANK_1,
      chess.BB_FILE_E,
    ]

    for (const leftMask of masks) {
      for (const rightMask of masks) {
        const left = new chess.SquareSet(leftMask)
        const right = new chess.SquareSet(rightMask)

        expect(left.union(right).int()).toBe(leftMask | rightMask)
        expect(left.intersection(rightMask).int()).toBe(leftMask & rightMask)
        expect(left.difference(right).int()).toBe(leftMask & ~rightMask)
        expect(left.symmetricDifference(rightMask).int()).toBe(
          leftMask ^ rightMask,
        )
      }
    }
  })
})
