# chess.ts
A direct port of [python-chess](https://github.com/niklasf/python-chess/tree/master) to TypeScript!

# Install
```
npm i @jacksonthall22/chess.ts
```

# Contributing
I have compiled some notes about how I am approaching this transpilation effort 
[here](py-to-ts-tips.md). Probably this would be a good starting point.

Ideally, this library will transpile everything from 
[python-chess core copy](./python-chess%20core%20copy/) over to the 
corresponding files in [chess](chess/). However, I think the most important
and immediate objectives to make this library useful are (in order):
- [x]  Transpile `__init__.py` → `index.ts`
- [x]  Transpile `pgn.py` → `pgn.ts`
- [ ]  Transpile `engine.py` → `engine.ts` (WIP: minimal functionality for `pgn.ts` to work)
- [ ]  Create a testing suite

If anyone wants to help contribute (thank you, by the way!), I would recommend
starting with the next item in this list. Specifically, `engine.py` might be a
behemoth—threading stuff is not my forte.

### Transpilation helper
I noticed that 90% of the work is pretty repetitive when converting Python to TypeScript:
switching the class/method/docstring formatting, putting parentheses around `if` statement
conditions, changing `True`s to `true`s, `None`s to `null`s, and `==`s to `===`s, etc. I created
[`transpilation_helper.py`](transpilation_helper.py) for this reason to quickly transpile
a block of Python code of arbitrary length to TypeScript. This can be used **as a decent starting point**,
but the almost-TS-code it outputs will almost always need additional manual work. To point out just a
couple of examples, it does not detect which vars need `let` or `const` (and so it omits those keywords
completely), and it does not modify `if`/`while` conditions (these will need to be manually edited to
guarantee the same functionality). Also, it handles methods, but not top-level functions.

To use it, just run `python transpilation_helper.py`. Copy a block of Python code to the clipboard
(triple-click and drag to select multiple whole lines, including the leading indents). Press `Enter`.
The transpiled code will be copied to the clipboard. Paste it into a TypeScript file, continue to
make edits, and verify it works the same way as the original Python code.

You might need `pip install chess pyperclip`.

### `chess.ts`'s GPT
Also check out the GPT I made for this project, [`python-chess` to `chess.ts` helper!](https://chat.openai.com/g/g-Ht5toEWik-python-chess-to-chess-ts-helper).
I have provided it with instructions specific to this task, which closely follow my 
notes in [`py-to-ts-tips.md`](py-to-ts-tips.md) (it may even address you as Jackson lol). 
Thus far it has been an indispensible tool to speed up the manual transpilation effort.
It is near perfect at transpiling arbitrarily long functions/methods that do not have 
complex Python-specific code patterns. However, for example, it struggled with 
transpiling `BaseBoard.copy()` in `__init__.py`, which starts by instantiating a new board 
with the same dynamic type as `self`:

```py
board = type(self)(None)
```

After initially giving a poor response that raised TS errors, I had to probe it for a bit 
before it came up with a successful idea:

```ts
const board = new (this.constructor as new () => this)();
```

So while it is definitely subject to basic mistakes, it usually gets 90% of the way there.
The other 10% usually just takes a bit more artful prompting. Always make sure to verify its 
solutions with the original Python code on a split screen.
