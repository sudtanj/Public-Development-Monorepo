// A line-by-line model of cpp-battleship/main.cpp, including its quirks.
// The map is kept flat (index = row * 10 + col) because that's how the C++ int map[10][10] is laid out,
// which matters when the sinking loop runs past column 10 into the next row.

export const WIDTH = 10, HEIGHT = 10;
export const EMPTY = 0, PLAYER = 1, COM = 2;
export const SHIPS_TO_WIN = 3;

// random(min, max) in main.cpp: an integer in [min, max)
export const cRandom = (min, max) => min + Math.floor(Math.random() * (max - min));

export class Battleship {
  constructor(random = cRandom) {
    this.map = new Array(WIDTH * HEIGHT).fill(EMPTY);
    this.output = '';
    this.destroyed = 0;
    this.over = false;

    this.print('Welcome to Battleship Game!!!');
    this.print('Player (P1) vs COM (P2)');
    this.print('Press 1 to start:');   // never read: the first number typed is the column
    this.placeShips(PLAYER, 0, 4, random);
    this.printMap();
    this.placeShips(COM, 5, 9, random);
    this.printMap();
    this.print('Coloumn');
  }

  print(line) {
    this.output += `${line}\n`;
  }

  at(i) {
    return i >= 0 && i < this.map.length ? this.map[i] : EMPTY;
  }

  // ships of length 2, 3 and 4, horizontal, in rows [rowMin, rowMax); a clash retries the same length
  placeShips(owner, rowMin, rowMax, random) {
    for (let len = 2; len <= 4; len++) {
      const col = random(0, WIDTH - (len - 1));
      const row = random(rowMin, rowMax);
      this.print(`${col} ${row}`);
      const cells = Array.from({ length: len }, (_, j) => row * WIDTH + col + j);
      if (cells.some(i => this.map[i] !== EMPTY)) {
        len--;
        continue;
      }
      for (const i of cells) this.map[i] = owner;
    }
  }

  printMap() {
    for (let r = 0; r < HEIGHT; r++) {
      this.print(this.map.slice(r * WIDTH, (r + 1) * WIDTH).map(v => `${v} `).join(''));
    }
  }

  // col and row are 1-based, as typed into the C++ program. Returns the flat indexes that were sunk.
  shoot(col, row) {
    if (this.over) throw new Error('The game is over');
    this.print(String(col));
    this.print('Row');
    this.print(String(row));
    const c = col - 1, r = row - 1;
    const sunk = [];

    if (this.at(r * WIDTH + c) === COM) {
      this.destroyed++;
      // clears from the hit cell to the right, stopping at the first 0, even past the end of the row
      let i = r * WIDTH + c;
      while (this.at(i) !== EMPTY) {
        this.map[i] = EMPTY;
        sunk.push(i);
        i++;
      }
      this.output += String(c);   // a leftover debug print, without a newline
      // meant to clear to the left, but it starts on the cell cleared above, so it never runs
      i = r * WIDTH + c;
      while (this.at(i) !== EMPTY) {
        this.map[i] = EMPTY;
        sunk.push(i);
        i--;
      }
      this.print('You destroy a ship');
    }

    this.printMap();
    if (this.destroyed === SHIPS_TO_WIN) {
      this.print('Human Win');
      this.over = true;
    } else {
      this.print('Coloumn');
    }
    return sunk;
  }
}
