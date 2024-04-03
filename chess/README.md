# `chess.ts`

The best `chess.ts` package on `npm` because it just mirrors `python-chess`*!

###### *It's a work in progress!

All of the features you would expect with `import chess` or `import chess.pgn` are implemented.
Other `python-chess` subpackages have minimal functionality to support the main features of the library.
Please report any issues on GitHub!

## Examples

### Pushing moves on a `Board`
```ts
import * as chess from "@jacksonthall22/chess.ts"

const b = new chess.Board()

// Push SAN or UCI
b.pushSan('e4')
b.pushUci('e7e5')

// Push `Move`s
const m = new chess.Move(chess.G1, chess.F3)
console.log(b.san(m))  // Nf3
b.push(m)

// ASCII representation
b.pushSan('Nc6')
b.pushSan('Bb5')
console.log(b.toString())
/*
r . b q k b n r
p p p p . p p p
. . n . . . . .
. B . . p . . .
. . . . P . . .
. . . . . N . .
P P P P . P P P
R N B Q K . . R
*/

// Nice trick to get SANs from a Board's moveStack
const tempB = new chess.Board()
const sanStack = b.moveStack.map((m) => tempB.sanAndPush(m))
console.log(sanStack.join(' '))
/*
e4 e5 Nf3 Nc6 Bb5
*/
```

### Reading `Game`s
```ts
import { readGame, StringIO } from "@jacksonthall22/chess.ts/pgn"


// This lib provides a minimal mirror of Python's `io.StringIO` class
// to work with PGNs. Reading directly from files is not yet supported,
// but you can use a `chessPgn.StringIO` object to read games sequentially
// from a multi-game PGN the same way you would in `python-chess`:
const pgns = `
[Event "FIDE World Championship 2023"]\n[Site "Astana KAZ"]\n[Date "2023.04.30"]\n[Round "18"]\n[White "Nepomniachtchi, Ian"]\n[Black "Liren, Ding"]\n[Result "0-1"]\n[WhiteFideId "4168119"]\n[BlackFideId "8603677"]\n[WhiteElo "2795"]\n[BlackElo "2788"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. d3 b5 7. Bb3 d6 8. a4 Bd7 9. h3 O-O 10. Be3 Na5 11. Ba2 bxa4 12. Nc3 Rb8 13. Bb1 Qe8 14. b3 c5 15. Nxa4 Nc6 16. Nc3 a5 17. Nd2 Be6 18. Nc4 d5 19. exd5 Nxd5 20. Bd2 Nxc3 21. Bxc3 Bxc4 22. bxc4 Bd8 23. Bd2 Bc7 24. c3 f5 25. Re1 Rd8 26. Ra2 Qg6 27. Qe2 Qd6 28. g3 Rde8 29. Qf3 e4 30. dxe4 Ne5 31. Qg2 Nd3 32. Bxd3 Qxd3 33. exf5 Rxe1+ 34. Bxe1 Qxc4 35. Ra1 Rxf5 36. Bd2 h6 37. Qc6 Rf7 38. Re1 Kh7 39. Be3 Be5 40. Qe8 Bxc3 41. Rc1 Rf6 42. Qd7 Qe2 43. Qd5 Bb4 44. Qe4+ Kg8 45. Qd5+ Kh7 46. Qe4+ Rg6 47. Qf5 c4 48. h4 Qd3 49. Qf3 Rf6 50. Qg4 c3 51. Rd1 Qg6 52. Qc8 Rc6 53. Qa8 Rd6 54. Rxd6 Qxd6 55. Qe4+ Qg6 56. Qc4 Qb1+ 57. Kh2 a4 58. Bd4 a3 59. Qc7 Qg6 60. Qc4 c2 61. Be3 Bd6 62. Kg2 h5 63. Kf1 Be5 64. g4 hxg4 65. h5 Qf5 66. Qd5 g3 67. f4 a2 68. Qxa2 Bxf4 0-1


[Event "FIDE World Championship 2023"]\n[Site "Astana KAZ"]\n[Date "2023.04.30"]\n[Round "18"]\n[White "Nepomniachtchi, Ian"]\n[Black "Liren, Ding"]\n[Result "0-1"]\n[WhiteFideId "4168119"]\n[BlackFideId "8603677"]\n[WhiteElo "2795"]\n[BlackElo "2788"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. d3 b5 7. Bb3 d6 8. a4 Bd7 9. h3 O-O 10. Be3 Na5 11. Ba2 bxa4 12. Nc3 Rb8 13. Bb1 Qe8 14. b3 c5 15. Nxa4 Nc6 16. Nc3 a5 17. Nd2 Be6 18. Nc4 d5 19. exd5 Nxd5 20. Bd2 Nxc3 21. Bxc3 Bxc4 22. bxc4 Bd8 23. Bd2 Bc7 24. c3 f5 25. Re1 Rd8 26. Ra2 Qg6 27. Qe2 Qd6 28. g3 Rde8 29. Qf3 e4 30. dxe4 Ne5 31. Qg2 Nd3 32. Bxd3 Qxd3 33. exf5 Rxe1+ 34. Bxe1 Qxc4 35. Ra1 Rxf5 36. Bd2 h6 37. Qc6 Rf7 38. Re1 Kh7 39. Be3 Be5 40. Qe8 Bxc3 41. Rc1 Rf6 42. Qd7 Qe2 43. Qd5 Bb4 44. Qe4+ Kg8 45. Qd5+ Kh7 46. Qe4+ Rg6 47. Qf5 c4 48. h4 Qd3 49. Qf3 Rf6 50. Qg4 c3 51. Rd1 Qg6 52. Qc8 Rc6 53. Qa8 Rd6 54. Rxd6 Qxd6 55. Qe4+ Qg6 56. Qc4 Qb1+ 57. Kh2 a4 58. Bd4 a3 59. Qc7 Qg6 60. Qc4 c2 61. Be3 Bd6 62. Kg2 h5 63. Kf1 Be5 64. g4 hxg4 65. h5 Qf5 66. Qd5 g3 67. f4 a2 68. Qxa2 Bxf4 0-1`

let pgnio = new chessPgn.StringIO(pgns)
let g: chessPgn.Game | null

while (true) {
  g = chessPgn.readGame(pgnio)
  if (g === null) break
  console.log(g!.end().board().toString(), '\n')
}
/*
. . . . . . . .
. . . . . . p k
. . . . . . . .
. . . . . q . P
. . . . . b . .
. . . . B . p .
Q . p . . . . .
. . . . . K . .

. . . . . . . .
. . . . . . p k
. . . . . . . .
. . . . . q . P
. . . . . b . .
. . . . B . p .
Q . p . . . . .
. . . . . K . .

*/
```