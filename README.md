# chess.ts
A direct port of [python-chess](https://github.com/niklasf/python-chess/tree/master) to TypeScript!

# Install
```
npm i @jacksonthall22/chess.ts
```

# Contributing
Ideally, this library will transpile everything from 
[python-chess core copy](./python-chess%20core%20copy/) over to the 
corresponding files in [chess](chess/). However, I think the most important
and immediate objectives to make this library useful are (in order):
- [x]  Transpile `__init__.py`
- [ ]  Transpile `pgn.py`
- [ ]  Transpile `engine.py`
- [ ]  Create a testing suite

If anyone wants to help contribute (thank you, by the way!), I would recommend
starting on `engine.py`. I have fully transpiled `__init__.py` to `index.ts` and
am working on transpiling `pgn.py`, which should go relatively quickly. I also 
compiled some notes about how I am approaching this transpilation effort 
[here](py-to-ts-tips.md). Maybe these will be useful to check out.

### Transpilation helper
It's pretty annoying while transpiling to get a bunch of red lines under methods or
functions whose signatures do not yet exist. I created
[`transpilation_helper.py`](transpilation_helper.py) for this reason to quickly generate
TypeScript function/method signatures from Python code. Just create a new file `temp.txt`
and paste in a bunch of Python functions or methods from the same class, then run 
`python transpilation_helper.py`. TypeScript method signatures with empty bodies will be 
printed and also copied to your clipboard using [`pyperclip`](https://pypi.org/project/pyperclip/). Make sure to check the output as it doesn't handle every edge case, like named kwargs passed
as `dict`s or generator functions (TODO).

### `chess.ts`'s GPT
Also check out the GPT I made for this project, [`python-chess` to `chess.ts` helper!](https://chat.openai.com/g/g-Ht5toEWik-python-chess-to-chess-ts-helper).
I have provided it with instructions specific to this library, which closely follow my 
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
before it came up with a successful transpilation:

```ts
const board = new (this.constructor as new () => this)();
```

So while it is definitely subject to basic mistakes, it usually gets 90% of the way there.
The other 10% usually just takes a bit more artful prompting. I always make sure to verify its 
solutions with the corresponding Python code on a split screen.