# chess.ts
A direct rewrite of [python-chess](https://github.com/niklasf/python-chess/tree/master) in TypeScript!

# Contributing

Ideally, this project will transpile everything from 
[python-chess core copy](./python-chess%20core%20copy/) over to the 
corresponding files in [chess](chess/). However, I think the most important files to start with for this library to be useful are:
- [ ]  `__init__.py`
- [ ] `pgn.py`
- [ ] `engine.py`

I have started transpiling `__init__.py` to [`chess/init.ts`](chess/init.ts).
In case anyone wants to help contribute (thank you, by the way!), I would 
recommend either starting with another file above, or working in `init.ts` 
from the bottom-up and committing often, so we don't duplicate work.

## Tips
Know Python but not TypeScript, and want to contribute? See [here](py-to-ts-tips.md).