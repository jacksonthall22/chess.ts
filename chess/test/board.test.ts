import * as chess from '../index'
import { describe, expect, test } from 'vitest'
import { registerTestCase, TestCase } from './unittest'

/** Mechanical translation of python-chess `BoardTestCase` at cd7f5958. */
class BoardTestCase extends TestCase {
  testDefaultPosition(): void {
    const board = new chess.Board()
    this.assertEqual(board.pieceAt(chess.B1), chess.Piece.fromSymbol('N'))
    this.assertEqual(board.fen(), chess.STARTING_FEN)
    this.assertEqual(board.turn, chess.WHITE)
  }

  testEmpty(): void {
    const board = chess.Board.empty()
    this.assertEqual(board.fen(), '8/8/8/8/8/8/8/8 w - - 0 1')
    this.assertEqual(board, new chess.Board(null))
  }

  testPly(): void {
    const board = new chess.Board()
    this.assertEqual(board.ply(), 0)
    board.pushSan('d4')
    this.assertEqual(board.ply(), 1)
    board.pushSan('d5')
    this.assertEqual(board.ply(), 2)
    board.clearStack()
    this.assertEqual(board.ply(), 2)
    board.pushSan('Nf3')
    this.assertEqual(board.ply(), 3)
  }

  testFromEpd(): void {
    const baseEpd = 'rnbqkb1r/ppp1pppp/5n2/3P4/8/8/PPPP1PPP/RNBQKBNR w KQkq -'
    const [board, operations] = chess.Board.fromEpd(`${baseEpd} ce 55;`)
    this.assertEqual(operations.get('ce'), 55)
    this.assertEqual(board.fen(), `${baseEpd} 0 1`)
  }

  testSetFenAsEpd(): void {
    const board = new chess.Board()
    this.assertRaises(Error, () => board.setEpd(board.fen()))
  }

  testMoveMaking(): void {
    const board = new chess.Board()
    const move = new chess.Move(chess.E2, chess.E4)
    board.push(move)
    this.assertEqual(board.peek(), move)
  }

  testFen(): void {
    const board = new chess.Board()
    this.assertEqual(board.fen(), chess.STARTING_FEN)

    const fen = '6k1/pb3pp1/1p2p2p/1Bn1P3/8/5N2/PP1q1PPP/6K1 w - - 0 24'
    board.setFen(fen)
    this.assertEqual(board.fen(), fen)

    board.push(chess.Move.fromUci('f3d2'))
    this.assertEqual(
      board.fen(),
      '6k1/pb3pp1/1p2p2p/1Bn1P3/8/8/PP1N1PPP/6K1 b - - 0 24',
    )
  }

  testXfen(): void {
    // https://de.wikipedia.org/wiki/Forsyth-Edwards-Notation#Beispiel
    let xfen = 'rn2k1r1/ppp1pp1p/3p2p1/5bn1/P7/2N2B2/1PPPPP2/2BNK1RR w Gkq - 4 11'
    let board = new chess.Board(xfen, { chess960: true })
    this.assertEqual(
      board.castlingRights,
      chess.BB_G1 | chess.BB_A8 | chess.BB_G8,
    )
    this.assertEqual(
      board.cleanCastlingRights(),
      chess.BB_G1 | chess.BB_A8 | chess.BB_G8,
    )
    this.assertEqual(
      board.shredderFen(),
      'rn2k1r1/ppp1pp1p/3p2p1/5bn1/P7/2N2B2/1PPPPP2/2BNK1RR w Gga - 4 11',
    )
    this.assertEqual(board.fen(), xfen)
    this.assertTrue(board.hasCastlingRights(chess.WHITE))
    this.assertTrue(board.hasCastlingRights(chess.BLACK))
    this.assertTrue(board.hasKingsideCastlingRights(chess.BLACK))
    this.assertTrue(board.hasKingsideCastlingRights(chess.WHITE))
    this.assertTrue(board.hasQueensideCastlingRights(chess.BLACK))
    this.assertFalse(board.hasQueensideCastlingRights(chess.WHITE))

    // Chess960 position #284.
    board = new chess.Board(
      'rkbqrbnn/pppppppp/8/8/8/8/PPPPPPPP/RKBQRBNN w - - 0 1',
      { chess960: true },
    )
    board.castlingRights = board.rooks
    this.assertTrue(board.cleanCastlingRights() & chess.BB_A1)
    this.assertEqual(
      board.fen(),
      'rkbqrbnn/pppppppp/8/8/8/8/PPPPPPPP/RKBQRBNN w KQkq - 0 1',
    )
    this.assertEqual(
      board.shredderFen(),
      'rkbqrbnn/pppppppp/8/8/8/8/PPPPPPPP/RKBQRBNN w EAea - 0 1',
    )

    // Valid en passant square on illegal board.
    xfen = '8/8/8/pP6/8/8/8/8 w - a6 0 1'
    board = new chess.Board(xfen)
    this.assertEqual(board.fen(), xfen)

    // Illegal en passant square on illegal board.
    xfen = '1r6/8/8/pP6/8/8/8/1K6 w - a6 0 1'
    board = new chess.Board(xfen)
    this.assertEqual(board.fen(), '1r6/8/8/pP6/8/8/8/1K6 w - - 0 1')
  }

  testFenEnPassant(): void {
    const board = new chess.Board()
    board.pushSan('e4')
    this.assertEqual(
      board.fen({ enPassant: 'fen' }),
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
    )
    this.assertEqual(
      board.fen({ enPassant: 'xfen' }),
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    )
  }

  testGetSet(): void {
    const board = new chess.Board()
    this.assertEqual(board.pieceAt(chess.B1), chess.Piece.fromSymbol('N'))

    board.removePieceAt(chess.E2)
    this.assertEqual(board.pieceAt(chess.E2), null)

    board.setPieceAt(chess.E4, chess.Piece.fromSymbol('r'))
    this.assertEqual(board.pieceTypeAt(chess.E4), chess.ROOK)

    board.setPieceAt(chess.F1, null)
    this.assertEqual(board.pieceAt(chess.F1), null)

    board.setPieceAt(chess.H7, chess.Piece.fromSymbol('Q'), true)
    this.assertEqual(board.promoted, chess.BB_H7)

    board.setPieceAt(chess.H7, null)
    this.assertEqual(board.promoted, chess.BB_EMPTY)
    this.assertEqual(board.pieceAt(chess.H7), null)
  }

  testColorAt(): void {
    const board = new chess.Board()
    this.assertEqual(board.colorAt(chess.A1), chess.WHITE)
    this.assertEqual(board.colorAt(chess.G7), chess.BLACK)
    this.assertEqual(board.colorAt(chess.E4), null)
  }

  testPawnCaptures(): void {
    const board = new chess.Board()

    // King's Gambit.
    board.push(chess.Move.fromUci('e2e4'))
    board.push(chess.Move.fromUci('e7e5'))
    board.push(chess.Move.fromUci('f2f4'))

    // Accepted.
    const exf4 = chess.Move.fromUci('e5f4')
    this.assertIn(exf4, board.pseudoLegalMoves)
    this.assertIn(exf4, board.legalMoves)
    board.push(exf4)
    board.pop()
  }

  testPawnMoveGeneration(): void {
    const board = new chess.Board('8/2R1P3/8/2pp4/2k1r3/P7/8/1K6 w - - 1 55')
    this.assertEqual(Array.from(board.generatePseudoLegalMoves()).length, 16)
  }

  testSingleStepPawnMove(): void {
    const board = new chess.Board()
    const a3 = chess.Move.fromUci('a2a3')
    this.assertIn(a3, board.pseudoLegalMoves)
    this.assertIn(a3, board.legalMoves)
    board.push(a3)
    board.pop()
    this.assertEqual(board.fen(), chess.STARTING_FEN)
  }

  testCastling(): void {
    const board = new chess.Board('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 1 1')

    // Let white castle short.
    let move = board.parseXboard('O-O')
    this.assertEqual(move, chess.Move.fromUci('e1g1'))
    this.assertEqual(board.san(move), 'O-O')
    this.assertEqual(board.xboard(move), 'e1g1')
    this.assertIn(move, board.legalMoves)
    board.push(move)

    // Let black castle long.
    move = board.parseXboard('O-O-O')
    this.assertEqual(board.san(move), 'O-O-O')
    this.assertEqual(board.xboard(move), 'e8c8')
    this.assertIn(move, board.legalMoves)
    board.push(move)
    this.assertEqual(board.fen(), '2kr3r/8/8/8/8/8/8/R4RK1 w - - 3 2')

    // Undo both castling moves.
    board.pop()
    board.pop()
    this.assertEqual(board.fen(), 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 1 1')

    // Let white castle long.
    move = board.parseSan('O-O-O')
    this.assertEqual(board.san(move), 'O-O-O')
    this.assertIn(move, board.legalMoves)
    board.push(move)

    // Let black castle short.
    move = board.parseSan('O-O')
    this.assertEqual(board.san(move), 'O-O')
    this.assertIn(move, board.legalMoves)
    board.push(move)
    this.assertEqual(board.fen(), 'r4rk1/8/8/8/8/8/8/2KR3R w - - 3 2')

    // Undo both castling moves.
    board.pop()
    board.pop()
    this.assertEqual(board.fen(), 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 1 1')
  }

  testCastlingSan(): void {
    const board = new chess.Board('4k3/8/8/8/8/8/8/4K2R w K - 0 1')
    this.assertEqual(board.parseSan('O-O'), chess.Move.fromUci('e1g1'))
    this.assertRaises(chess.IllegalMoveError, () => board.parseSan('Kg1'))
    this.assertRaises(chess.IllegalMoveError, () => board.parseSan('Kh1'))
  }

  testNinesixtyCastling(): void {
    let fen = '3r1k1r/4pp2/8/8/8/8/8/4RKR1 w Gd - 1 1'
    let board = new chess.Board(fen, { chess960: true })

    // Let white do the kingside swap.
    let move = board.parseSan('O-O')
    this.assertEqual(board.san(move), 'O-O')
    this.assertEqual(board.xboard(move), 'O-O')
    this.assertEqual(move.fromSquare, chess.F1)
    this.assertEqual(move.toSquare, chess.G1)
    this.assertIn(move, board.legalMoves)
    board.push(move)
    this.assertEqual(
      board.shredderFen(),
      '3r1k1r/4pp2/8/8/8/8/8/4RRK1 b d - 2 1',
    )

    // Black can not castle kingside.
    this.assertNotIn(chess.Move.fromUci('e8h8'), board.legalMoves)

    // Let black castle queenside.
    move = board.parseSan('O-O-O')
    this.assertEqual(board.san(move), 'O-O-O')
    this.assertEqual(board.xboard(move), 'O-O-O')
    this.assertEqual(move.fromSquare, chess.F8)
    this.assertEqual(move.toSquare, chess.D8)
    this.assertIn(move, board.legalMoves)
    board.push(move)
    this.assertEqual(
      board.shredderFen(),
      '2kr3r/4pp2/8/8/8/8/8/4RRK1 w - - 3 2',
    )

    // Restore initial position.
    board.pop()
    board.pop()
    this.assertEqual(board.shredderFen(), fen)

    fen = 'Qr4k1/4pppp/8/8/8/8/8/R5KR w Hb - 0 1'
    board = new chess.Board(fen, { chess960: true })

    // White can just hop the rook over.
    move = board.parseSan('O-O')
    this.assertEqual(board.san(move), 'O-O')
    this.assertEqual(move.fromSquare, chess.G1)
    this.assertEqual(move.toSquare, chess.H1)
    this.assertIn(move, board.legalMoves)
    board.push(move)
    this.assertEqual(
      board.shredderFen(),
      'Qr4k1/4pppp/8/8/8/8/8/R4RK1 b b - 1 1',
    )

    // Black can not castle queenside nor kingside.
    this.assertFalse(Array.from(board.generateCastlingMoves()).length > 0)

    // Restore initial position.
    board.pop()
    this.assertEqual(board.shredderFen(), fen)
  }

  testHsideRookBlocksAsideCastling(): void {
    const board = new chess.Board(
      '4rrk1/pbbp2p1/1ppnp3/3n1pqp/3N1PQP/1PPNP3/PBBP2P1/4RRK1 w Ff - 10 18',
      { chess960: true },
    )
    this.assertNotIn(chess.Move.fromUci('g1f1'), board.legalMoves)
    this.assertNotIn(chess.Move.fromUci('g1e1'), board.legalMoves)
    this.assertNotIn(chess.Move.fromUci('g1c1'), board.legalMoves)
    this.assertNotIn(chess.Move.fromUci('g1a1'), board.legalMoves)
    this.assertIn(chess.Move.fromUci('g1h1'), board.legalMoves) // Kh1
  }

  testSelectiveCastling(): void {
    const board = new chess.Board(
      'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1',
    )

    // King not selected.
    this.assertFalse(
      Array.from(board.generateCastlingMoves(chess.BB_ALL & ~board.kings)).length >
        0,
    )

    // Rook on h1 not selected.
    const moves = board.generateCastlingMoves(
      chess.BB_ALL,
      chess.BB_ALL & ~chess.BB_H1,
    )
    this.assertEqual(Array.from(moves).length, 1)
  }

  testCastlingRightNotDestroyedBug(): void {
    // A rook move from h8 to h1 was only taking white's possible castling
    // rights away.
    const board = new chess.Board(
      '2r1k2r/2qbbpp1/p2pp3/1p3PP1/Pn2P3/1PN1B3/1P3QB1/1K1R3R b k - 0 22',
    )
    board.pushSan('Rxh1')
    this.assertEqual(
      board.epd(),
      '2r1k3/2qbbpp1/p2pp3/1p3PP1/Pn2P3/1PN1B3/1P3QB1/1K1R3r w - -',
    )
  }

  testInvalidCastlingRights(): void {
    // KQkq is not valid in this standard chess position.
    let board = new chess.Board('1r2k3/8/8/8/8/8/8/R3KR2 w KQkq - 0 1')
    this.assertEqual(board.status(), chess.STATUS_BAD_CASTLING_RIGHTS)
    this.assertEqual(board.fen(), '1r2k3/8/8/8/8/8/8/R3KR2 w Q - 0 1')
    this.assertTrue(board.hasQueensideCastlingRights(chess.WHITE))
    this.assertFalse(board.hasKingsideCastlingRights(chess.WHITE))
    this.assertFalse(board.hasQueensideCastlingRights(chess.BLACK))
    this.assertFalse(board.hasKingsideCastlingRights(chess.BLACK))

    board = new chess.Board('4k2r/8/8/8/8/8/8/R1K5 w KQkq - 0 1', {
      chess960: true,
    })
    this.assertEqual(board.status(), chess.STATUS_BAD_CASTLING_RIGHTS)
    this.assertEqual(board.fen(), '4k2r/8/8/8/8/8/8/R1K5 w Qk - 0 1')

    board = new chess.Board(
      '1r2k3/8/1p6/8/8/5P2/8/1R2KR2 w KQkq - 0 1',
      { chess960: true },
    )
    this.assertEqual(board.status(), chess.STATUS_BAD_CASTLING_RIGHTS)
    this.assertEqual(
      board.fen(),
      '1r2k3/8/1p6/8/8/5P2/8/1R2KR2 w KQq - 0 1',
    )
  }

  testNinesixtyDifferentKingAndRookFile(): void {
    // Theoretically, this position (with castling rights) can not be reached
    // with a series of legal moves from one of the 960 starting positions.
    // Decision: We don't care, neither do Stockfish or lichess.org.
    const fen = '1r1k1r2/5p2/8/8/8/8/3N4/R5KR b KQkq - 0 1'
    const board = new chess.Board(fen, { chess960: true })
    this.assertEqual(board.fen(), fen)
  }

  testNinesixtyPreventedCastle(): void {
    const board = new chess.Board('4k3/8/8/1b6/8/8/8/5RKR w KQ - 0 1', {
      chess960: true,
    })
    this.assertFalse(board.isLegal(chess.Move.fromUci('g1f1')))
  }

  testFindMove(): void {
    const board = new chess.Board('4k3/1P6/8/8/8/8/3P4/4K2R w K - 0 1')

    // Pawn moves.
    this.assertEqual(board.findMove(chess.D2, chess.D4), chess.Move.fromUci('d2d4'))
    this.assertEqual(board.findMove(chess.B7, chess.B8), chess.Move.fromUci('b7b8q'))
    this.assertEqual(
      board.findMove(chess.B7, chess.B8, chess.KNIGHT),
      chess.Move.fromUci('b7b8n'),
    )

    // Illegal moves.
    this.assertRaises(chess.IllegalMoveError, () => board.findMove(chess.D2, chess.D8))
    this.assertRaises(chess.IllegalMoveError, () => board.findMove(chess.E1, chess.A1))

    // Castling.
    this.assertEqual(board.findMove(chess.E1, chess.G1), chess.Move.fromUci('e1g1'))
    this.assertEqual(board.findMove(chess.E1, chess.H1), chess.Move.fromUci('e1g1'))
    board.chess960 = true
    this.assertEqual(board.findMove(chess.E1, chess.H1), chess.Move.fromUci('e1h1'))
  }

  testCleanCastlingRights(): void {
    const board = new chess.Board()
    board.setBoardFen('k6K/8/8/pppppppp/8/8/8/QqQq4')
    this.assertEqual(board.cleanCastlingRights(), chess.BB_EMPTY)
    this.assertEqual(board.fen(), 'k6K/8/8/pppppppp/8/8/8/QqQq4 w - - 0 1')
    board.pushSan('Qxc5')
    this.assertEqual(board.cleanCastlingRights(), chess.BB_EMPTY)
    this.assertEqual(board.fen(), 'k6K/8/8/ppQppppp/8/8/8/Qq1q4 b - - 0 1')
  }

  testPromotionWithCheck(): void {
    let board = new chess.Board(
      '8/6P1/2p5/1Pqk4/6P1/2P1RKP1/4P1P1/8 w - - 0 1',
    )
    board.push(chess.Move.fromUci('g7g8q'))
    this.assertTrue(board.isCheck())
    this.assertEqual(
      board.fen(),
      '6Q1/8/2p5/1Pqk4/6P1/2P1RKP1/4P1P1/8 b - - 0 1',
    )

    board = new chess.Board('8/8/8/3R1P2/8/2k2K2/3p4/r7 b - - 0 82')
    board.pushSan('d1=Q+')
    this.assertEqual(board.fen(), '8/8/8/3R1P2/8/2k2K2/8/r2q4 w - - 0 83')
  }

  testAmbiguousMove(): void {
    const board = new chess.Board(
      '8/8/1n6/3R1P2/1n6/2k2K2/3p4/r6r b - - 0 82',
    )
    this.assertRaises(chess.AmbiguousMoveError, () => board.parseSan('Rf1'))
    this.assertRaises(chess.AmbiguousMoveError, () => board.parseSan('Nd5'))
  }

  testScholarsMate(): void {
    const board = new chess.Board()

    const e4 = chess.Move.fromUci('e2e4')
    this.assertIn(e4, board.legalMoves)
    board.push(e4)

    const e5 = chess.Move.fromUci('e7e5')
    this.assertIn(e5, board.legalMoves)
    board.push(e5)

    const Qf3 = chess.Move.fromUci('d1f3')
    this.assertIn(Qf3, board.legalMoves)
    board.push(Qf3)

    const Nc6 = chess.Move.fromUci('b8c6')
    this.assertIn(Nc6, board.legalMoves)
    board.push(Nc6)

    const Bc4 = chess.Move.fromUci('f1c4')
    this.assertIn(Bc4, board.legalMoves)
    board.push(Bc4)

    const Rb8 = chess.Move.fromUci('a8b8')
    this.assertIn(Rb8, board.legalMoves)
    board.push(Rb8)

    this.assertFalse(board.isCheck())
    this.assertFalse(board.isCheckmate())
    this.assertFalse(board.isGameOver())
    this.assertFalse(board.isStalemate())

    const Qf7Mate = chess.Move.fromUci('f3f7')
    this.assertIn(Qf7Mate, board.legalMoves)
    board.push(Qf7Mate)

    this.assertTrue(board.isCheck())
    this.assertTrue(board.isCheckmate())
    this.assertTrue(board.isGameOver())
    this.assertTrue(board.isGameOver({ claimDraw: true }))
    this.assertFalse(board.isStalemate())

    this.assertEqual(
      board.fen(),
      '1rbqkbnr/pppp1Qpp/2n5/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQk - 0 4',
    )
  }

  testResult(): void {
    // Undetermined.
    let board = new chess.Board()
    this.assertEqual(board.result({ claimDraw: true }), '*')

    // White checkmated.
    board = new chess.Board(
      'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3',
    )
    this.assertEqual(board.result({ claimDraw: true }), '0-1')

    // Stalemate.
    board = new chess.Board('7K/7P/7k/8/6q1/8/8/8 w - - 0 1')
    this.assertEqual(board.result(), '1/2-1/2')

    // Insufficient material.
    board = new chess.Board('4k3/8/8/8/8/5B2/8/4K3 w - - 0 1')
    this.assertEqual(board.result(), '1/2-1/2')

    // Seventy-five-move rule.
    board = new chess.Board('4k3/8/6r1/8/8/8/2R5/4K3 w - - 369 1')
    this.assertEqual(board.result(), '1/2-1/2')

    // Fifty-move rule.
    board = new chess.Board('4k3/8/6r1/8/8/8/2R5/4K3 w - - 120 1')
    this.assertEqual(board.result(), '*')
    this.assertEqual(board.result({ claimDraw: true }), '1/2-1/2')
  }

  testSan(): void {
    // Castling with check.
    let fen = 'rnbk1b1r/ppp2pp1/5n1p/4p1B1/2P5/2N5/PP2PPPP/R3KBNR w KQ - 0 7'
    let board = new chess.Board(fen)
    const longCastleCheck = chess.Move.fromUci('e1a1')
    this.assertEqual(board.san(longCastleCheck), 'O-O-O+')
    this.assertEqual(board.fen(), fen)

    // En passant mate.
    fen = '6bk/7b/8/3pP3/8/8/8/Q3K3 w - d6 0 2'
    board = new chess.Board(fen)
    const fxe6MateEp = chess.Move.fromUci('e5d6')
    this.assertEqual(board.san(fxe6MateEp), 'exd6#')
    this.assertEqual(board.fen(), fen)

    // Test disambiguation.
    fen = 'N3k2N/8/8/3N4/N4N1N/2R5/1R6/4K3 w - - 0 1'
    board = new chess.Board(fen)
    this.assertEqual(board.san(chess.Move.fromUci('e1f1')), 'Kf1')
    this.assertEqual(board.san(chess.Move.fromUci('c3c2')), 'Rcc2')
    this.assertEqual(board.san(chess.Move.fromUci('b2c2')), 'Rbc2')
    this.assertEqual(board.san(chess.Move.fromUci('a4b6')), 'N4b6')
    this.assertEqual(board.san(chess.Move.fromUci('h8g6')), 'N8g6')
    this.assertEqual(board.san(chess.Move.fromUci('h4g6')), 'Nh4g6')
    this.assertEqual(board.fen(), fen)

    // Test a bug where shakmaty used overly specific disambiguation.
    fen = '8/2KN1p2/5p2/3N1B1k/5PNp/7P/7P/8 w - -'
    board = new chess.Board(fen)
    this.assertEqual(board.san(chess.Move.fromUci('d5f6')), 'N5xf6#')

    // Do not disambiguate illegal alternatives.
    fen = '8/8/8/R2nkn2/8/8/2K5/8 b - - 0 1'
    board = new chess.Board(fen)
    this.assertEqual(board.san(chess.Move.fromUci('f5e3')), 'Ne3+')
    this.assertEqual(board.fen(), fen)

    // Promotion.
    fen = '7k/1p2Npbp/8/2P5/1P1r4/3b2QP/3q1pPK/2RB4 b - - 1 29'
    board = new chess.Board(fen)
    this.assertEqual(board.san(chess.Move.fromUci('f2f1q')), 'f1=Q')
    this.assertEqual(board.san(chess.Move.fromUci('f2f1n')), 'f1=N+')
    this.assertEqual(board.fen(), fen)
  }

  testLan(): void {
    // Normal moves always with origin square.
    let fen = 'N3k2N/8/8/3N4/N4N1N/2R5/1R6/4K3 w - - 0 1'
    let board = new chess.Board(fen)
    this.assertEqual(board.lan(chess.Move.fromUci('e1f1')), 'Ke1-f1')
    this.assertEqual(board.lan(chess.Move.fromUci('c3c2')), 'Rc3-c2')
    this.assertEqual(board.lan(chess.Move.fromUci('a4c5')), 'Na4-c5')
    this.assertEqual(board.fen(), fen)

    // Normal capture.
    fen = 'rnbq1rk1/ppp1bpp1/4pn1p/3p2B1/2PP4/2N1PN2/PP3PPP/R2QKB1R w KQ - 0 7'
    board = new chess.Board(fen)
    this.assertEqual(board.lan(chess.Move.fromUci('g5f6')), 'Bg5xf6')
    this.assertEqual(board.fen(), fen)

    // Pawn captures and moves.
    fen = '6bk/7b/8/3pP3/8/8/8/Q3K3 w - d6 0 2'
    board = new chess.Board(fen)
    this.assertEqual(board.lan(chess.Move.fromUci('e5d6')), 'e5xd6#')
    this.assertEqual(board.lan(chess.Move.fromUci('e5e6')), 'e5-e6+')
    this.assertEqual(board.fen(), fen)
  }

  testSanNewline(): void {
    const board = new chess.Board(
      'rnbqk2r/ppppppbp/5np1/8/8/5NP1/PPPPPPBP/RNBQK2R w KQkq - 2 4',
    )
    this.assertRaises(chess.InvalidMoveError, () => board.parseSan('O-O\n'))
    this.assertRaises(chess.InvalidMoveError, () => board.parseSan('Nc3\n'))
  }

  testPawnCaptureSanWithoutFile(): void {
    let board = new chess.Board(
      '2rq1rk1/pb2bppp/1p2p3/n1ppPn2/2PP4/PP3N2/1B1NQPPP/RB3RK1 b - - 4 13',
    )
    this.assertRaises(chess.IllegalMoveError, () => board.parseSan('c4'))
    board = new chess.Board('4k3/8/8/4Pp2/8/8/8/4K3 w - f6 0 2')
    this.assertRaises(chess.IllegalMoveError, () => board.parseSan('f6'))
  }

  testVariationSan(): void {
    let board = new chess.Board()
    this.assertEqual(
      board.variationSan(['e2e4', 'e7e5', 'g1f3'].map(chess.Move.fromUci)),
      '1. e4 e5 2. Nf3',
    )
    this.assertEqual(
      board.variationSan(
        ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6'].map(
          chess.Move.fromUci,
        ),
      ),
      '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6',
    )

    const fen = 'rn1qr1k1/1p2bppp/p3p3/3pP3/P2P1B2/2RB1Q1P/1P3PP1/R5K1 w - - 0 19'
    board = new chess.Board(fen)
    const variation = [
      'd3h7', 'g8h7', 'f3h5', 'h7g8', 'c3g3', 'e7f8', 'f4g5', 'e8e7',
      'g5f6', 'b8d7', 'h5h6', 'd7f6', 'e5f6', 'g7g6', 'f6e7', 'f8e7',
    ]
    const varW = board.variationSan(variation.map(chess.Move.fromUci))
    this.assertEqual(
      varW,
      '19. Bxh7+ Kxh7 20. Qh5+ Kg8 21. Rg3 Bf8 22. Bg5 Re7 23. Bf6 Nd7 24. Qh6 Nxf6 25. exf6 g6 26. fxe7 Bxe7',
    )
    this.assertEqual(board.fen(), fen, 'Board unchanged by variationSan')
    board.push(chess.Move.fromUci(variation.shift() as string))
    const varB = board.variationSan(variation.map(chess.Move.fromUci))
    this.assertEqual(
      varB,
      '19... Kxh7 20. Qh5+ Kg8 21. Rg3 Bf8 22. Bg5 Re7 23. Bf6 Nd7 24. Qh6 Nxf6 25. exf6 g6 26. fxe7 Bxe7',
    )

    const illegalVariation = ['d3h7', 'g8h7', 'f3h6', 'h7g8']
    board = new chess.Board(fen)
    let error: unknown
    try {
      board.variationSan(illegalVariation.map(chess.Move.fromUci))
    } catch (caught) {
      error = caught
    }
    this.assertTrue(error instanceof chess.IllegalMoveError)
    const message = (error as Error).message
    this.assertIn('illegal move', message.toLowerCase())
    this.assertIn('f3h6', message)
  }

  testMoveStackUsage(): void {
    const board = new chess.Board()
    board.pushUci('d2d4')
    board.pushUci('d7d5')
    board.pushUci('g1f3')
    board.pushUci('c8f5')
    board.pushUci('e2e3')
    board.pushUci('e7e6')
    board.pushUci('f1d3')
    board.pushUci('f8d6')
    board.pushUci('e1h1')
    const san = new chess.Board().variationSan(board.moveStack)
    this.assertEqual(san, '1. d4 d5 2. Nf3 Bf5 3. e3 e6 4. Bd3 Bd6 5. O-O')
  }

  testIsLegalMove(): void {
    const fen = '3k4/6P1/7P/8/K7/8/8/4R3 w - - 0 1'
    const board = new chess.Board(fen)

    // Legal moves: Rg1, g8=R+.
    this.assertIn(chess.Move.fromUci('e1g1'), board.legalMoves)
    this.assertIn(chess.Move.fromUci('g7g8r'), board.legalMoves)

    // Impossible promotion: Kb5, h7.
    this.assertNotIn(chess.Move.fromUci('a5b5q'), board.legalMoves)
    this.assertNotIn(chess.Move.fromUci('h6h7n'), board.legalMoves)

    // Missing promotion.
    this.assertNotIn(chess.Move.fromUci('g7g8'), board.legalMoves)

    // Promote to pawn or king.
    this.assertFalse(board.isLegal(chess.Move.fromUci('g7g8p')))
    this.assertFalse(board.isPseudoLegal(chess.Move.fromUci('g7g8p')))
    this.assertFalse(board.isLegal(chess.Move.fromUci('g7g8k')))
    this.assertFalse(board.isPseudoLegal(chess.Move.fromUci('g7g8k')))

    this.assertEqual(board.fen(), fen)
  }

  testMoveCount(): void {
    const board = new chess.Board(
      '1N2k3/P7/8/8/3n4/8/2PP4/R3K2R w KQ - 0 1',
    )
    this.assertEqual(board.pseudoLegalMoves.count(), 8 + 4 + 3 + 2 + 1 + 6 + 9)
  }

  testEquality(): void {
    this.assertEqual(new chess.Board(), new chess.Board())
    this.assertFalse(!new chess.Board().equals(new chess.Board()))

    const a = new chess.Board()
    a.pushSan('d4')
    const b = new chess.Board()
    b.pushSan('d3')
    this.assertNotEqual(a, b)
    this.assertFalse(a.equals(b))
  }

  testNullMoves(): void {
    this.assertEqual(chess.Move.null().toString(), '0000')
    this.assertEqual(chess.Move.null().uci(), '0000')
    this.assertFalse(chess.Move.null().bool())

    const fen =
      'rnbqkbnr/ppp1pppp/8/2Pp4/8/8/PP1PPPPP/RNBQKBNR w KQkq d6 0 2'
    const board = new chess.Board(fen)

    this.assertEqual(chess.Move.fromUci('0000'), board.pushSan('--'))
    this.assertEqual(
      board.fen(),
      'rnbqkbnr/ppp1pppp/8/2Pp4/8/8/PP1PPPPP/RNBQKBNR b KQkq - 1 2',
    )

    this.assertEqual(chess.Move.null(), board.pop())
    this.assertEqual(board.fen(), fen)
  }

  testThreefoldRepetition(): void {
    const board = new chess.Board()

    // Go back and forth with the knights to reach the starting position
    // for a second time.
    this.assertFalse(board.canClaimThreefoldRepetition())
    this.assertFalse(board.isRepetition())
    board.pushSan('Nf3')
    this.assertFalse(board.canClaimThreefoldRepetition())
    this.assertFalse(board.isRepetition())
    board.pushSan('Nf6')
    this.assertFalse(board.canClaimThreefoldRepetition())
    this.assertFalse(board.isRepetition())
    board.pushSan('Ng1')
    this.assertFalse(board.canClaimThreefoldRepetition())
    this.assertFalse(board.isRepetition())
    board.pushSan('Ng8')

    // Once more.
    this.assertFalse(board.canClaimThreefoldRepetition())
    this.assertFalse(board.isRepetition())
    board.pushSan('Nf3')
    this.assertFalse(board.canClaimThreefoldRepetition())
    this.assertFalse(board.isRepetition())
    board.pushSan('Nf6')
    this.assertFalse(board.canClaimThreefoldRepetition())
    this.assertFalse(board.isRepetition())
    board.pushSan('Ng1')

    // Now black can go back to the starting position (thus reaching it a
    // third time).
    this.assertTrue(board.canClaimThreefoldRepetition())
    this.assertFalse(board.isRepetition())
    board.pushSan('Ng8')

    // They indeed do it. Also, white can now claim.
    this.assertTrue(board.canClaimThreefoldRepetition())
    this.assertTrue(board.isRepetition())

    // But not after a different move.
    board.pushSan('e4')
    this.assertFalse(board.canClaimThreefoldRepetition())
    this.assertFalse(board.isRepetition())

    // Undo moves and check if everything works backwards.
    board.pop() // e4
    this.assertTrue(board.canClaimThreefoldRepetition())
    board.pop() // Ng8
    this.assertTrue(board.canClaimThreefoldRepetition())
    while (board.moveStack.length !== 0) {
      board.pop()
      this.assertFalse(board.canClaimThreefoldRepetition())
    }
  }

  testFiftyMoves(): void {
    // Test positions from Jan Timman vs. Christopher Lutz (1995).
    let board = new chess.Board()
    this.assertFalse(board.isFiftyMoves())
    this.assertFalse(board.canClaimFiftyMoves())
    board = new chess.Board('8/5R2/8/r2KB3/6k1/8/8/8 w - - 19 79')
    this.assertFalse(board.isFiftyMoves())
    this.assertFalse(board.canClaimFiftyMoves())
    board = new chess.Board('8/8/6r1/4B3/8/4K2k/5R2/8 b - - 68 103')
    this.assertFalse(board.isFiftyMoves())
    this.assertFalse(board.canClaimFiftyMoves())
    board = new chess.Board('6R1/7k/8/8/1r3B2/5K2/8/8 w - - 99 119')
    this.assertFalse(board.isFiftyMoves())
    this.assertTrue(board.canClaimFiftyMoves())
    board = new chess.Board('8/7k/8/6R1/1r3B2/5K2/8/8 b - - 100 119')
    this.assertTrue(board.isFiftyMoves())
    this.assertTrue(board.canClaimFiftyMoves())
    board = new chess.Board('8/7k/8/1r3KR1/5B2/8/8/8 w - - 105 122')
    this.assertTrue(board.isFiftyMoves())
    this.assertTrue(board.canClaimFiftyMoves())

    // Once checkmated, it is too late to claim.
    board = new chess.Board('k7/8/NKB5/8/8/8/8/8 b - - 105 176')
    this.assertFalse(board.isFiftyMoves())
    this.assertFalse(board.canClaimFiftyMoves())

    // A stalemate is a draw, but you can not and do not need to claim it by
    // the fifty-move rule.
    board = new chess.Board('k7/3N4/1K6/1B6/8/8/8/8 b - - 99 1')
    this.assertTrue(board.isStalemate())
    this.assertTrue(board.isGameOver())
    this.assertFalse(board.isFiftyMoves())
    this.assertFalse(board.canClaimFiftyMoves())
    this.assertFalse(board.canClaimDraw())
  }

  testIsIrreversible(): void {
    const board = new chess.Board('r3k2r/8/8/8/8/8/8/R3K2R w Qkq - 0 1')
    this.assertTrue(board.isIrreversible(board.parseSan('Ra2')))
    this.assertTrue(board.isIrreversible(board.parseSan('O-O-O')))
    this.assertTrue(board.isIrreversible(board.parseSan('Kd1')))
    this.assertTrue(board.isIrreversible(board.parseSan('Rxa8')))
    this.assertTrue(board.isIrreversible(board.parseSan('Rxh8')))
    this.assertFalse(board.isIrreversible(board.parseSan('Rf1')))
    this.assertFalse(board.isIrreversible(chess.Move.null()))

    board.setCastlingFen('kq')
    this.assertFalse(board.isIrreversible(board.parseSan('Ra2')))
    this.assertFalse(board.isIrreversible(board.parseSan('Kd1')))
    this.assertTrue(board.isIrreversible(board.parseSan('Rxa8')))
    this.assertTrue(board.isIrreversible(board.parseSan('Rxh8')))
    this.assertFalse(board.isIrreversible(board.parseSan('Rf1')))
    this.assertFalse(board.isIrreversible(chess.Move.null()))
  }

  testStatus(): void {
    let board = new chess.Board()
    this.assertEqual(board.status(), chess.STATUS_VALID)
    this.assertTrue(board.isValid())

    board.removePieceAt(chess.H1)
    this.assertTrue(board.status() & chess.STATUS_BAD_CASTLING_RIGHTS)

    board.removePieceAt(chess.E8)
    this.assertTrue(board.status() & chess.STATUS_NO_BLACK_KING)

    // The en passant square should be set even if no capture is actually
    // possible.
    board = new chess.Board()
    board.pushSan('e4')
    this.assertEqual(board.epSquare, chess.E3)
    this.assertEqual(board.status(), chess.STATUS_VALID)

    // But there must indeed be a pawn there.
    board.removePieceAt(chess.E4)
    this.assertEqual(board.status(), chess.STATUS_INVALID_EP_SQUARE)

    // King must be between the two rooks.
    board = new chess.Board('2rrk3/8/8/8/8/8/3PPPPP/2RK4 w cd - 0 1')
    this.assertEqual(board.status(), chess.STATUS_BAD_CASTLING_RIGHTS)

    // Generally valid position, but not valid standard chess position due
    // to non-standard castling rights. Chess960 start position #0.
    board = new chess.Board(
      'bbqnnrkr/pppppppp/8/8/8/8/PPPPPPPP/BBQNNRKR w KQkq - 0 1',
      { chess960: true },
    )
    this.assertEqual(board.status(), chess.STATUS_VALID)
    board = new chess.Board(
      'bbqnnrkr/pppppppp/8/8/8/8/PPPPPPPP/BBQNNRKR w KQkq - 0 1',
      { chess960: false },
    )
    this.assertEqual(board.status(), chess.STATUS_BAD_CASTLING_RIGHTS)

    // Opposite check.
    board = new chess.Board('4k3/8/8/8/8/8/4Q3/4K3 w - - 0 1')
    this.assertEqual(board.status(), chess.STATUS_OPPOSITE_CHECK)

    // Empty board.
    board = new chess.Board(null)
    this.assertEqual(
      board.status(),
      chess.STATUS_EMPTY |
        chess.STATUS_NO_WHITE_KING |
        chess.STATUS_NO_BLACK_KING,
    )

    // Too many kings.
    board = new chess.Board(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBKKBNR w KQkq - 0 1',
    )
    this.assertEqual(board.status(), chess.STATUS_TOO_MANY_KINGS)

    // Triple check.
    board = new chess.Board('4k3/5P2/3N4/8/8/8/4R3/4K3 b - - 0 1')
    this.assertEqual(
      board.status(),
      chess.STATUS_TOO_MANY_CHECKERS | chess.STATUS_IMPOSSIBLE_CHECK,
    )

    // Impossible checker alignment.
    board = new chess.Board('3R4/8/q4k2/2B5/1NK5/3b4/8/8 w - - 0 1')
    this.assertEqual(board.status(), chess.STATUS_IMPOSSIBLE_CHECK)
    board = new chess.Board('2Nq4/2K5/1b6/8/7R/3k4/7P/8 w - - 0 1')
    this.assertEqual(board.status(), chess.STATUS_IMPOSSIBLE_CHECK)
    board = new chess.Board('5R2/2P5/8/4k3/8/3rK2r/8/8 w - - 0 1')
    this.assertEqual(board.status(), chess.STATUS_IMPOSSIBLE_CHECK)
    board = new chess.Board('8/8/8/1k6/3Pp3/8/8/4KQ2 b - d3 0 1')
    this.assertEqual(board.status(), chess.STATUS_IMPOSSIBLE_CHECK)

    // Checkers aligned with opponent king are fine.
    board = new chess.Board(
      '8/8/5k2/p1q5/PP1rp1P1/3P1N2/2RK1r2/5nN1 w - - 0 3',
    )
    this.assertEqual(board.status(), chess.STATUS_VALID)

    // Multiple stepping checkers.
    board = new chess.Board('8/8/N7/2k5/N7/8/8/3K4 b - - 0 1')
    this.assertEqual(board.status(), chess.STATUS_IMPOSSIBLE_CHECK)
  }

  testClear(): void {
    const board = new chess.Board()
    board.clear()

    this.assertEqual(board.turn, chess.WHITE)
    this.assertEqual(board.fullmoveNumber, 1)
    this.assertEqual(board.halfmoveClock, 0)
    this.assertEqual(board.castlingRights, chess.BB_EMPTY)
    this.assertFalse(board.epSquare)

    this.assertFalse(board.pieceAt(chess.E1))
    this.assertEqual(board.pieceCount(), 0)
  }

  testPromotedComparison(): void {
    const board = new chess.Board()
    board.setFen('5R2/3P4/8/8/7r/7r/7k/K7 w - - 0 1')
    board.pushSan('d8=R')

    const sameBoard = new chess.Board(board.fen())
    this.assertEqual(board, sameBoard)
  }

  testMultipleKings(): void {
    const board = new chess.Board('KKKK1kkk/8/8/8/8/8/8/8 w - - 0 1')
    this.assertEqual(board.king(chess.WHITE), null)
  }
}

registerTestCase('BoardTestCase', BoardTestCase, {
  lines: {
    testDefaultPosition: 212,
    testEmpty: 218,
    testPly: 223,
    testFromEpd: 235,
    testSetFenAsEpd: 1155,
    testMoveMaking: 241,
    testFen: 247,
    testXfen: 258,
    testFenEnPassant: 290,
    testGetSet: 296,
    testColorAt: 316,
    testPawnCaptures: 322,
    testPawnMoveGeneration: 337,
    testSingleStepPawnMove: 341,
    testCastling: 350,
    testCastlingSan: 392,
    testNinesixtyCastling: 400,
    testHsideRookBlocksAsideCastling: 451,
    testSelectiveCastling: 459,
    testCastlingRightNotDestroyedBug: 469,
    testInvalidCastlingRights: 476,
    testNinesixtyDifferentKingAndRookFile: 494,
    testNinesixtyPreventedCastle: 502,
    testFindMove: 506,
    testCleanCastlingRights: 526,
    testPromotionWithCheck: 593,
    testAmbiguousMove: 603,
    testScholarsMate: 610,
    testResult: 654,
    testSan: 680,
    testLan: 724,
    testSanNewline: 746,
    testPawnCaptureSanWithoutFile: 753,
    testVariationSan: 761,
    testMoveStackUsage: 796,
    testIsLegalMove: 810,
    testMoveCount: 833,
    testEquality: 971,
    testNullMoves: 1160,
    testThreefoldRepetition: 1229,
    testFiftyMoves: 1344,
    testIsIrreversible: 1693,
    testStatus: 982,
    testClear: 1216,
    testPromotedComparison: 1379,
    testMultipleKings: 1727,
  },
})

describe('Board lc0-style null-move handling', () => {
  test('parseUci accepts both canonical and a1a1 null-move spellings', () => {
    const board = new chess.Board()

    expect(board.parseUci('0000').equals(chess.Move.null())).toBe(true)
    expect(board.parseUci('a1a1').equals(chess.Move.null())).toBe(true)
  })

  test('an a1a1 null move can be pushed and popped without state drift', () => {
    const board = new chess.Board()
    board.pushSan('e4')
    const before = board.fen({ enPassant: 'fen' })

    const move = board.pushUci('a1a1')
    expect(move.equals(chess.Move.null())).toBe(true)
    expect(board.turn).toBe(chess.WHITE)
    expect(board.epSquare).toBeNull()
    expect(board.moveStack).toHaveLength(2)

    expect(board.pop().equals(chess.Move.null())).toBe(true)
    expect(board.fen({ enPassant: 'fen' })).toBe(before)
    expect(board.moveStack).toHaveLength(1)
  })

  test('a1a1q is raw UCI syntax but not a legal board move', () => {
    const raw = chess.Move.fromUci('a1a1q')

    expect(raw.uci()).toBe('a1a1q')
    expect(raw.bool()).toBe(true)
    expect(() => new chess.Board().parseUci('a1a1q')).toThrow(
      chess.IllegalMoveError,
    )
  })
})

describe('Board.givesCheckmate state restoration', () => {
  const snapshot = (board: chess.Board) => ({
    fen: board.fen({ enPassant: 'fen' }),
    moveStack: board.moveStack.map(move => move.uci()),
  })

  test('identifies a mating move without changing the board', () => {
    const board = new chess.Board()
    for (const san of ['e4', 'e5', 'Qf3', 'Nc6', 'Bc4', 'Rb8']) {
      board.pushSan(san)
    }
    const before = snapshot(board)

    expect(board.givesCheckmate(chess.Move.fromUci('f3f7'))).toBe(true)
    expect(snapshot(board)).toEqual(before)
  })

  test('distinguishes a checking move that is not mate', () => {
    const board = new chess.Board('4k3/8/8/8/8/8/4R3/4K3 w - - 0 1')
    const before = snapshot(board)

    expect(board.givesCheckmate(chess.Move.fromUci('e2e7'))).toBe(false)
    expect(snapshot(board)).toEqual(before)
  })

  test('returns false for a non-checking move', () => {
    const board = new chess.Board()
    const before = snapshot(board)

    expect(board.givesCheckmate(chess.Move.fromUci('e2e4'))).toBe(false)
    expect(snapshot(board)).toEqual(before)
  })

  test('restores the board and propagates an isCheckmate failure', () => {
    const expected = new Error('isCheckmate failed')
    class ThrowingBoard extends chess.Board {
      isCheckmate(): boolean {
        throw expected
      }
    }

    const board = new ThrowingBoard()
    board.pushSan('e4')
    const before = snapshot(board)

    expect(() => board.givesCheckmate(chess.Move.fromUci('e7e5'))).toThrow(
      expected,
    )
    expect(snapshot(board)).toEqual(before)
  })
})

describe('effective promoted-piece policy', () => {
  class PromotionAwareBoard extends chess.Board {
    _effectivePromoted(): chess.Bitboard {
      return this.promoted
    }
  }

  test('separates raw promotion state from variant-facing rule semantics', () => {
    const fen = '4k3/8/8/8/8/8/8/4K2R w K - 0 1'
    const board = new PromotionAwareBoard(fen)
    board.promoted = chess.BB_E1

    expect(board.boardFen()).toBe('4k3/8/8/8/8/8/8/4K~2R')
    expect(board.boardFen({ promoted: false })).toBe(
      '4k3/8/8/8/8/8/8/4K2R',
    )
    expect(board.king(chess.WHITE)).toBeNull()
    expect(board.cleanCastlingRights()).toBe(chess.BB_EMPTY)
    expect(board.hasKingsideCastlingRights(chess.WHITE)).toBe(false)
    expect(Array.from(board.generateCastlingMoves())).toEqual([])
    expect(board.status() & chess.STATUS_NO_WHITE_KING).not.toBe(0)

    const withoutEffectivePromotion = new PromotionAwareBoard(fen)
    expect(board.equals(withoutEffectivePromotion)).toBe(false)

    const copied = board.copy()
    expect(copied).toBeInstanceOf(PromotionAwareBoard)
    expect(copied.promoted).toBe(chess.BB_E1)

    const standard = new chess.Board(fen)
    standard.promoted = chess.BB_E1
    expect(standard.boardFen()).toBe('4k3/8/8/8/8/8/8/4K2R')
    expect(standard.boardFen({ promoted: true })).toBe(
      '4k3/8/8/8/8/8/8/4K~2R',
    )
    expect(standard.king(chess.WHITE)).toBe(chess.E1)
    expect(standard.equals(new chess.Board(fen))).toBe(true)

    const promotionAwareStart = new PromotionAwareBoard()
    promotionAwareStart.promoted = chess.BB_E1
    expect(promotionAwareStart.chess960Pos()).toBeNull()

    const standardStart = new chess.Board()
    standardStart.promoted = chess.BB_E1
    expect(standardStart.chess960Pos()).not.toBeNull()
  })
})
