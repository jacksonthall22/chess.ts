# `chess.ts`

The best `chess.ts` package on `npm` because it just mirrors `python-chess`*!

###### *It's a work in progress!

## Examples
```ts
import chess, { Board, Move } from "@jacksonthall22/chess.ts"

const b = new Board()

b.pushSan('e4')
b.push(Move.fromUci('e7e5'))

const m = new Move(chess.G1, chess.F3)
console.log(b.san(m))  // Nf3

b.push(m)
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

console.log()
```