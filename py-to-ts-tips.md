# Tips for transpiling Python to TypeScript

If you are reading this because you want to contribute, thanks!
This file holds a collection of my notes and insights about transcribing 
`python-chess` to TypeScript (TS). Hopefully my future self and others 
will benefit from them.

I am experienced in Python but a beginner/intermediate in TS, so these
notes assume a similar background. Wherever possible, I try to use 
examples to show the most important ideas to be aware of when trying to 
understand how to correctly (or effectively) convert different Python code 
patterns to TS.

## Translation contract: the same program in different syntax

The goal is stronger than making the two libraries return the same answers.
The TypeScript should preserve the structure of the pinned Python source down
to classes, methods, blocks, branches, local steps, expression order, comments,
and docstrings. Imagine wearing glasses that hide each language's syntax. What
remains should look like the same program.

This matters because the intended user may already know how `python-chess`
works internally. The familiar implementation is itself a library benefit, not
an incidental detail. It also makes this unaffiliated port easy to audit and
makes future upstream maintenance mechanical: a Python diff should point to an
obvious TypeScript diff in the same place and with the same shape.

Most of this code is assignments, control flow, exceptions, functions, and
classes. Those constructs have direct TypeScript forms. Do not refactor them
into a more idiomatic TypeScript design, extract different abstractions,
reorder work, or otherwise make a new implementation merely because it behaves
the same. Behavioral parity is necessary, but it is not sufficient.

Some Python primitives do not have semantically equivalent JavaScript syntax.
Examples include `int.bit_count()`, lexicographic tuple comparison, Unicode
`len()`, and Python's round-half-even fixed-point formatting. Put the smallest
reusable adapter for such a primitive near the top of the target file under
`Custom declarations (no mirror in python-chess)`. The directly translated
method should retain the Python shape and invoke that adapter exactly where the
Python invokes its builtin or operator. The adapter is a language boundary; it
must not absorb or rearrange chess-domain logic.

### Spend target-only code only on proved language gaps

Treat every declaration with no `python-chess` mirror as an exception that
needs evidence, not as an ordinary refactoring tool. Use this order:

1. Start with the closest direct TypeScript expression at the exact Python
   expression site.
2. If a short composition of native TypeScript operations has the same
   semantics, keep it inline. Do not extract a one-use helper merely to give
   that expression a name.
3. Use the repository's established exact target representation before
   rejecting an input or inventing an adapter. In particular, Python integers
   outside JavaScript's safe `number` range become TypeScript `bigint`; a
   narrower `number` API is not evidence that the Python value is invalid.
4. Reuse an established language adapter when one already exists. General
   Python primitive bridges belong with the repository's existing helpers in
   `chess/utils.ts`; a file-local adapter should represent a gap specific to
   that translated value or source operation.
5. Add a new adapter only after identifying a concrete valid input for which
   the direct JavaScript operation differs from pinned Python. Document that
   mismatch and cover it with a parity test.

For example, JavaScript and Python disagree about the truthiness of `NaN`, but
the fixed `Score._score_tuple()` expression does not need a separate
`negatedOrZero()` declaration:

```py
-(mate or 0)
```

```ts
mate === null || mate === 0 ? 0 : -mate
```

The inline target syntax is longer, but it still performs the source's one
numeric selection and negation in place. By contrast, Python tuple comparison
needs an adapter: JavaScript array equality is reference equality and its
ordering operators coerce arrays to strings. That is a proved semantic gap,
not a readability preference.

Do not move chess decisions, branches, state transitions, or fallback policy
into an adapter. Do not introduce a wrapper solely to make primitives expose a
preferred method name. A `number`, `boolean`, or `null` remains a native
primitive when its native operation is faithful; exceptional element behavior
belongs inside the smallest containing value adapter that actually needs it.

### Preserve synchronization history and member order

Review and translate each first-parent upstream state, not only the final
source snapshot. If the port already contains a form introduced by a later
upstream change, restore the prior source-shaped state before its introducing
pin, then reproduce that hunk in the matching synchronization commit. Do not
omit a hunk because the current TypeScript is already behaviorally equivalent.

Preserve source order among members that have a source counterpart. Place
target-only declarations according to the target language's normal structure;
do not use them to reshape or fragment the mirrored source order.

For example, if Python accepts values in `__init__`, stores them as dynamically
created private attributes, and later exposes them through properties, the
TypeScript translation should store and expose those values in the same
constructor/property order. Because TypeScript requires private readonly
backing fields to be declared in the class body, group them at the top of the
class, the conventional TypeScript location. Keep the translated property
getters together at the later position where Python defines its properties.

Default whitespace operations are one proved language boundary. Python
`str.strip()` and whitespace `str.split()` include `U+001C` but exclude
`U+FEFF`; JavaScript `trim()` and `\s` do the opposite for those characters.
JavaScript `value.split()` with no separator does not implement Python
`value.split()`, and a JavaScript split limit discards the remainder whereas
Python `split(None, maxsplit)` preserves it.

Translate the ordinary forms inline and unilaterally:

| Python | TypeScript |
| --- | --- |
| `value.strip()` | `value.replace(PYTHON_LEADING_WHITESPACE, "").replace(PYTHON_TRAILING_WHITESPACE, "")` |
| `value.rstrip()` | `value.replace(PYTHON_TRAILING_WHITESPACE, "")` |
| `value.split()` | `value.split(PYTHON_WHITESPACE_RUN).filter(Boolean)` |
| `value.split(separator)` | `value.split(separator)` |

Only `split(None, maxsplit)` uses `splitWhitespaceWithMax()`: JavaScript's
native limit drops the source's unsplit remainder, and inlining the required
scan would obscure the surrounding source structure. Keep that adapter limited
to the exceptional max-split form.

### Comparison methods

The existing production convention for comparisons of translated object
types is to call a method on the left operand. Python `__eq__()` is represented
as TypeScript `equals()`. The comparable `Score` hierarchy represents
`__lt__()`, `__le__()`, `__gt__()`, and `__ge__()` as `lt()`, `le()`, `gt()`,
and `ge()`, respectively. The generated upstream tests use those same methods
when their proved operand shapes identify the corresponding production types.
Native TypeScript primitives still use native operators whenever those
operators have the required Python semantics.

When Python applies one of these operators to a value whose JavaScript
representation does not support the same operation, put the exceptional
semantics on the smallest internal value adapter and retain the established
method-shaped comparison at the translated call site. For example, JavaScript
arrays do not provide Python tuple equality or lexicographic ordering, so the
internal value returned by `Score._scoreTuple()` implements the same comparison
methods:

```py
return self._score_tuple() < other._score_tuple()
```

```ts
return this._scoreTuple().lt(other._scoreTuple())
```

Do not expose a lower-level implementation such as
`compareScoreTuples(left, right) < 0` in that translated body: it turns the
source's one object comparison into a helper call plus a different numeric
comparison. A private comparison routine may implement the adapter's methods,
but that target-only machinery stays behind the value's established method
interface.

This is the repository's existing comparison convention, not a general rule
for renaming every Python dunder. Preserve the established mapping for each
other protocol rather than deriving a new name mechanically.

Start from the complete pinned Python method and edit its syntax in place.
Transpilation helpers and AI can accelerate that syntax work, but neither is an
authority for changing the program's structure. Always finish with a
side-by-side source comparison. Do not fix an upstream defect only in the
TypeScript synchronization; upstream it first or make the divergence a
separate, explicitly approved change.

See [`AGENTS.md`](AGENTS.md) for the mandatory review rules and
[`UPSTREAM.md`](UPSTREAM.md) for the commit-by-commit update process.

## Style, comments, and docstrings
Unfortunately the TS norm is `camelCase` for variables and functions \:'(.
Translate Python `snake_case` identifiers to that established target spelling
wherever they name the TypeScript API, including method names embedded in a
representation string. Faithful structure does not mean emitting a Python
identifier that does not exist in TypeScript: `Piece.from_symbol(...)` becomes
`Piece.fromSymbol(...)`.

Constants should be in `CAPITAL_SNAKE_CASE`.

This is widely accepted by now, but you should only ever use `const` or
`let` to define variables.
```ts
// TS
const FOO_BAR = 42;     // ✅
let fooBar = 42;        // ✅
var bad_foo_bar = 42;   // ❌
```

I try to keep line comments in the same places where possible (see above—I 
recommend just copying the Python directly into TS to get going).

For docstrings, I have been just been converting them to the regular
TSDoc syntax, paying a bit of attention to convert any `snake_case` 
references to `camelCase`:
```py
# Python
def foo():
    """
    Multi-line docstring
    with references to `function_names().`
    """
    pass

FOO_BAR = 42
"""This is a variable equal to 42."""
```
becomes
```ts
// TS
/**
 * Multi-line docstring
 * with references to `functionNames()`.
 */
const foo = () => {
}

/** This is a variable equal to 42. */
const FOO_BAR = 42;
```

## Primitive types
The biggest difference here is that TS does not distinguish between 
`float` and `int`, it just uses `number` for both. There is also a
`bigint` type, which is used to hold integers with absolute values >= 2^53.
In `init.ts` (which mirrors `__init__.py`), the `Bitboard` type is just an
alias for `bigint`[^1] because bitboard numbers like `0xffff_ffff_ffff_ffff`
can't be represented by `number`.

Note that literal `bigint`s are followed by an `n`:
```ts
// TS
const BB_EMPTY = 0n;
const BB_ALL = 0xffff_ffff_ffff_ffffn;  // Both types inferred as `bigint`
```

[^1]: Note: My understanding is that `bigint` has a variable size in memory 
that can accomodate any large int, but does have some memory overhead which 
in the future might stand to be improved by choosing another data structure.

## Unpacking becomes destructuring
Notice how the Python code below simultaneously defines constants 
`A1, B1, ...` and also the constant `SQUARES`, which is equal to the
list containing all those squares, by chaining equals signs to ultimately 
equal `range(64)`:

```py
# Python
SQUARES = [
    A1, B1, C1, D1, E1, F1, G1, H1,
    A2, B2, C2, D2, E2, F2, G2, H2,
    A3, B3, C3, D3, E3, F3, G3, H3,
    A4, B4, C4, D4, E4, F4, G4, H4,
    A5, B5, C5, D5, E5, F5, G5, H5,
    A6, B6, C6, D6, E6, F6, G6, H6,
    A7, B7, C7, D7, E7, F7, G7, H7,
    A8, B8, C8, D8, E8, F8, G8, H8,
] = range(64)
```
This works because `range(64)` is an `Iterable`, and Python knows at 
runtime to call its `__next__()` function for each name in the list, 
setting `A1` equal to the first result, `B1` equal to the second, etc. 
until every name has been assigned a value. Python calls this "unpacking". 
Then, it sets `SQUARES` equal to the list containing those elements. This 
is just a regular assignment operation.

We can't do this sort of chained equals in TS, but we can accomplish
the same thing in two separate assignments. 

#### TLDR
If the Python assignment takes this form:
```py
# Python
CONSTANTS = [C1, C2, ...] = value
```
then the TS will look like this:
```ts
// TS
const CONSTANTS = value;
const [C1, C2, ...] = CONSTANTS;
``` 

So here's how the code above would look:
```ts
// TS
const SQUARES = Array.from({ length: 64 }, (_, i) => i) as Square[];
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
```

Read on for an explanation of how both assignments work.

### Assignment 1: Use `Array.map()` / `Array.from()` tricks
The first step involves knowing the TS trick to iterate over 
indices in a range. It works a little like Python's `enumerate()`:
```py
>>> # Python shell
>>> for i, e in enumerate(['a', 'b', 'c'])
...     print(i, e)  # index, element
0 a
1 b
2 b
```
The equivalent TS could look like this:
```ts
// TS
['a', 'b', 'c'].map((e, i) => console.log(i, e));
```

Or if you don't have a list to iterate over, but want to iterate
a fixed number of times:
```ts
// TS
Array.from({ length: 3 }, (_, i) => console.log(i));
```

Note that in either of these cases, the single `console.log()` call can be 
replaced with a `{}` block if you need to do something that requires 
multiple lines:
```ts
// TS
Array.from({ length: 3 }, (_, i) => {
  const j = i+1;
  console.log(j);
})
```

### Assignment 2: Do the destructuring
The second step is knowing that "destructuring" is the TS equivalent of
unpacking and also just works. You can do it like this:
```ts
// TS
const LETTERS = ['a', 'b', 'c'];
const [A, B, C] = LETTERS;  // Defines A, B, and C at the top level
```

### Putting it all together
Now we know how to transpile the Python code shown above that defines
`SQUARES` and `A1, B1, ...`, which uses iterable unpacking and chained 
assignment. Check the TLDR transpilation again and see if it makes sense!

## List comprehensions become `Array.map()`/`Array.flatMap()`
We can usually transpile list comprehensions cleanly with `Array.map()`:

```py
# Python
SQUARES_180 = [square_mirror(sq) for sq in SQUARES]
```
becomes
```ts
// TS
const SQUARES_180 = SQUARES.map(squareMirror);
```

We can also transpile nested list comprehensions by figuring out a way to 
nest use `Array.map()` inside `Array.flatMap()`. It is critically important 
that you use these in the right order so the elements in the resulting TS 
array are ordered the same wasy as in the Python implementation. Refer to
this example for a correct way to do it:
```py
# Python
SQUARE_NAMES = [f + r for r in RANK_NAMES for f in FILE_NAMES]
```
becomes
```ts
// TS
const SQUARE_NAMES = RANK_NAMES.flatMap((r) =>
  FILE_NAMES.map((f) => f + r),
);
```

## Function types in TS
In Python, we have both `def` and `lambda` to define functions, with
the former being far more common.

In TS, we also have two ways to define functions, and they both seem
fairly common:
```ts
// TS
function greetRegular(name: string, age: number): string {
  return `Hi ${name}, you are ${age} years old!`;
}

const greetArrow = (name: string, age: number): string => {
  return `Hi ${name}, you are ${age} years old!`;
}
```

The first is the "regular" syntax and the second is the "arrow" syntax. 
Arrow functions in TS are comparable to a Python `lambda` function, but 
they also behave in some ways more like a regular `def` function[^2].

When choosing which syntax to transpile to, here is my general rule:
- For top-level functions, use the arrow syntax
- For methods inside classes or generators, use the regular syntax

I have adopted this rule primarily for two reasons[^2] which you don't need
to fully understand to be able to contribute.

[^2]: The first reason is that functions with the regular syntax are 
"hoisted", meaning at compile time, they are pulled up to the top of the 
file . This means you can use these functions anywhere in the scope where
they are defined (even above their definition). This is not how Python 
functions work, so since we are transpiling everything in the same 
order from the Python library, there should be no need for hoisting.
The other reason is that there are some strange differences between how
the arrow and regular syntaxes functions behave differently when it comes 
to how `this` is defined inside the function's scope. The TLDR is that
arrow functions define `this` as whatever `this` is defined as in the 
calling scope, whereas regular functions set `this` to reference the calling
object. If this confuses you as much as it does me I can only recommend 
you stop trying to understand it now.

The exception that Python generators must be transpiled to the regular 
syntax even at the top level is because I think it's just not supported/
possible with the arrow syntax:
```py
# Python
from typing import Iterable
def generate_ints_forever(): Iterable[int]:
    n = 0
    while True:
        yield n
        n += 1
```
must become
```ts
// TS
function* generateIntsForever(): IterableIterator<number> {
  let n: number = 0;
  while (true) {
    yield n;
    n++;  // `n += 1` also still works
  }
}
```

## Keyword-only function arguments
Python has a feature where you can enforce that some function parameters
must be passed as positional-only or keyword-only arguments by putting a
`/` and/or a `*` in the parameter list. Everything before a `/` is 
positional-only, everything after a `*` is keyword-only, and everything
in between can be passed either as a positional or as a keyword argument:
```py
# Python
def foo(a, /, b, *, c):
    ...

foo(1, 2, c=3)      # ✅ b passed as positional arg
foo(1, b=2, c=3)    # ✅ b passed as keyword arg

foo(1, 2, 3)        # ❌ TypeError: foo() takes 2 positional arguments but 3 were given
foo(a=1, b=2, b=3)  # ❌ TypeError: foo() got some positional-only arguments passed as keyword arguments: 'a'
```

We don't really need to worry about positional-only arguments because they 
are pretty rare and esoteric. However, keyword-only arguments can be useful.
I can recommend [this article](https://levelup.gitconnected.com/how-to-write-named-parameters-in-typescript-f05d5031dec6)
if you want more background, but note that my preferred pattern for this 
library differs a bit from what is recommended there[^3]. Here's a full 
example with the full function body transpilation included just because:

[^3]: I have two problems with the author's suggested method. The first is
that in TS we can't define an interface inside a class, so for method 
signatures like the one shown below, we would need to awkwardly define them 
outside the class. The second is that the author chooses to make params
optional by allowing them to be `undefined` instead of explicitly setting 
them as `null`:
    ```ts
    // Source: https://levelup.gitconnected.com/how-to-write-named-parameters-in-typescript-f05d5031dec6
    // Put all function arguments here. Define which ones are optional and which ones are required
    interface User {
        firstName?: string,
        age?: number,
        email: string,
    }

    // Use the interface to define the function argument type
    function addUserToDatabase({firstName, age = 0, email}: User = {}) {
        // ...
    }
    ```
    This means that if ex. we wanted `age` to default to `null`, then its
type in the function would be inferred as `number | null | undefined`. In 
our context, we could also choose to just use `undefined` instead of 
`null` for these scenarios, but since we are copying a Python library and 
Python does not have an `undefined` equivalent, but rather prefers to 
explicitly set nonexistent objects, I think `null` is a more appropriate 
choice (also see [here](https://stackoverflow.com/a/5076962/7304977)).

```py
# Python
class Piece:
    # ...  
    def unicode_symbol(self, *, invert_color: bool = False) -> str:
        symbol = self.symbol().swapcase() if invert_color else self.symbol()
        return UNICODE_PIECE_SYMBOLS[symbol]
    # ...
```
becomes
```ts
// TS
class Piece {
  // ...
  unicodeSymbol({ invertColor }: { invertColor: boolean } = { invertColor: false }): string {
    const swapcase = (symbol: string) =>
      symbol === symbol.toUpperCase()
        ? symbol.toLowerCase()
        : symbol.toUpperCase();
    const symbol = invertColor ? swapcase(this.symbol()) : this.symbol();
    return UNICODE_PIECE_SYMBOLS[symbol];
  }
  // ...
}
```

It's a bit verbose, but this achieves the desired functionality by making 
the method's only parameter an object whose type is
`{ invertColor: boolean }`, and then assigning that parameter a default 
value of `{ invertColor: false }`. So you can only call it in one of two 
ways:

```ts
// TS
const p = Piece.fromSymbol('P')

const s1 = p.unicodeSymbol();
// ✅ `invertColor` defaults to `false`
const s2 = p.unicodeSymbol({ invertColor: true })
// ✅ `invertColor` manually set to `true`

const s3 = p.unicodeSymbol(true)
// ❌ Argument of type 'boolean' is not assignable to parameter of type '{ invertColor: boolean; }'.
const s4 = p.unicodeSymbol({ true })
// ❌ Object literal may only specify known properties, and 'true' does not exist in type '{ invertColor: boolean; }'.
const s5 = p.unicodeSymbol({ invertColor: true, someOtherParam: 42 })
// ❌ Object literal may only specify known properties, and 'someOtherParam' does not exist in type '{ invertColor: boolean; }'.
```

And of course you could have multiple properties in the parameter object if
there are multiple keyword-only args.

## `type`, `enum`, `const`, or `interface`?
This one took me a bit to fully understand. To me, it seemed like `enum` 
and `type` are almost interchangable, but a key difference is that `type` 
is only used at compile time to validate types, and so it **does not exist 
at runtime**.

The rule of thumb while transpiling is this:
- If the Python code is defining a `Literal` type alias, use a `type`:
  ```py
  # Python
  Color = Literal['white', 'black']
  ```
  becomes
  ```ts
  // TS
  type Color = 'white' | 'black'
  ```

- If the Python code is defining a type alias, and the values of that type 
are fixed and can be exhaustively enumerated, or if you need access to 
their actual values at runtime, use an `enum`:
  ```py
  # Python
  PieceType = int
  ```
  becomes
  ```ts
  // TS
  const enum PieceType {
    PAWN = 1,
    KNIGHT,  // = 2 automatically, etc.
    BISHOP,
    ROOK,
    QUEEN,
    KING,
  }
  ```

- If the Python code is defining the actual values that correspond to a 
previously-set type alias (which could have been set as a `type` or an 
`enum` in your TS code), use a `const`:
  ```py
  # Python
  PIECE_TYPES = [PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING] = range(1, 7)
  ```
  becomes
  ```ts
  // TS
  const PIECE_TYPES: PieceType[] = Array.from({ length: 6 }, (_, i) => i + 1);
  const [PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING] = PIECE_TYPES;
  ```

- Don't use an `interface`?

## `TypeVar`s
`TypeVar`s are a way to achieve the same effect as a generic in Python 
typehinting. TS just has generics built in, so there's no need to panic here:
```py
# Python
BaseBoardT = TypeVar("BaseBoardT", bound="BaseBoard")

class BaseBoard:
    # ...
    def mirror(self: BaseBoardT) -> BaseBoardT:
        board = self.copy()
        board.apply_mirror()
        return board
    # ...
```
becomes
```ts
// TS
class BaseBoard {
    //...
    mirror<T extends BaseBoard>(): T {
      const board = this.copy();
      board.apply_mirror();
      return board;
    }
    //...
}
```

## Other
If there's something that's worth mentioning here that I haven't covered,
feel free to open an issue or a PR.
