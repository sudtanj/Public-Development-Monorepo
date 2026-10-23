# Battleship (C++)

A console Battleship prototype, moved here from [`sudtanj/battleship-game`](https://github.com/sudtanj/battleship-game).
`main.cpp` is unchanged.

The program hides three ships (2, 3 and 4 cells long, all horizontal) for each side on a 10×10 map. Yours go in rows
1-4 and COM's in rows 6-9. You type a column and then a row, and the game ends when you have destroyed 3 ships.
It's unfinished: COM never shoots back, and the whole map, enemy ships included, is printed after every shot.

```sh
g++ -O2 -o battleship main.cpp && ./battleship
```

## Play in the browser

**[▶ Open the showcase](https://sudtanj.github.io/Public-Development-Monorepo/cpp-battleship/)**. The page
(`site/cpp-battleship/`) is a line-by-line JavaScript model of `main.cpp`. Clicking a cell types its column and row,
and the terminal panel shows the same output the program prints. The page also lists the original's quirks, which
are kept on purpose. For example, hitting a ship mid-hull only sinks the cells from the hit to the right.

## CI

`.github/workflows/cpp.yml` compiles `main.cpp` with g++. `test_e2e.py` then plays a real game through stdin: it reads
the printed map, makes three hits that each count as a destroyed ship, and checks for `Human Win`. The same workflow
runs `site/cpp-battleship/game.test.js`, which checks that the browser model follows the same rules.
