import test from 'node:test';
import assert from 'node:assert/strict';
import { Battleship, WIDTH, PLAYER, COM, EMPTY } from './game.js';

// feeds main.cpp's random(min, max) calls from a list, checking each value is in range
function scripted(values) {
  return (min, max) => {
    const v = values.shift();
    assert.ok(v >= min && v < max, `${v} is outside [${min}, ${max})`);
    return v;
  };
}

// [col, row] for the 2-, 3- and 4-long ships of the player, then of COM
const layout = ships => scripted(ships.flat());
const idx = (col, row) => row * WIDTH + col;   // 0-based, like the C++ map
const rowOf = (g, r) => g.map.slice(r * WIDTH, (r + 1) * WIDTH);

const BASIC = [[0, 0], [0, 1], [0, 2], [0, 5], [0, 6], [0, 7]];

test('each side gets ships of 2, 3 and 4 in its own rows', () => {
  for (let n = 0; n < 200; n++) {
    const g = new Battleship();
    const rows = owner => [...new Set(g.map.flatMap((v, i) => (v === owner ? [Math.floor(i / WIDTH)] : [])))];
    assert.equal(g.map.filter(v => v === PLAYER).length, 9);
    assert.equal(g.map.filter(v => v === COM).length, 9);
    assert.ok(rows(PLAYER).every(r => r >= 0 && r <= 3));
    assert.ok(rows(COM).every(r => r >= 5 && r <= 8));
  }
});

test('a clash retries the same ship length, printing every attempt', () => {
  // the 3-long ship first lands on the 2-long one, then retries in row 1
  const g = new Battleship(layout([[0, 0], [1, 0], [0, 1], [0, 2], ...BASIC.slice(3)]));
  assert.deepEqual(rowOf(g, 0), [1, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(rowOf(g, 1), [1, 1, 1, 0, 0, 0, 0, 0, 0, 0]);
  assert.match(g.output, /^0 0\n1 0\n0 1\n0 2\n/m);
});

test('the transcript starts like the C++ program', () => {
  const g = new Battleship(layout(BASIC));
  const lines = g.output.split('\n');
  assert.deepEqual(lines.slice(0, 6), [
    'Welcome to Battleship Game!!!', 'Player (P1) vs COM (P2)', 'Press 1 to start:', '0 0', '0 1', '0 2',
  ]);
  assert.equal(lines[6], '1 1 0 0 0 0 0 0 0 0 ');
  assert.equal(lines.at(-2), 'Coloumn');
});

test('hitting the left end of a ship sinks all of it', () => {
  const g = new Battleship(layout(BASIC));
  const sunk = g.shoot(1, 7);   // COM's 3-long ship in row 7 (index 6)
  assert.deepEqual(sunk, [idx(0, 6), idx(1, 6), idx(2, 6)]);
  assert.equal(g.destroyed, 1);
  assert.match(g.output, /\n0You destroy a ship\n/);
});

test('hitting the middle of a ship only sinks the hit cell and the cells to its right', () => {
  const g = new Battleship(layout(BASIC));
  g.shoot(3, 8);   // the third cell of COM's 4-long ship in row 8 (index 7)
  assert.deepEqual(rowOf(g, 7), [COM, COM, 0, 0, 0, 0, 0, 0, 0, 0]);
  g.shoot(1, 8);   // the leftover counts as another ship
  assert.equal(g.destroyed, 2);
});

test('a miss and a shot at your own ship change nothing', () => {
  const g = new Battleship(layout(BASIC));
  const before = [...g.map];
  assert.deepEqual(g.shoot(10, 10), []);
  assert.deepEqual(g.shoot(1, 1), []);
  assert.deepEqual(g.map, before);
  assert.equal(g.destroyed, 0);
});

test('sinking runs past column 10 into the next row', () => {
  // COM's 2-long ship ends in the last column of row 6; its 3-long ship starts row 7
  const g = new Battleship(layout([[0, 0], [0, 1], [0, 2], [8, 5], [0, 6], [0, 8]]));
  const sunk = g.shoot(9, 6);
  assert.deepEqual(sunk, [idx(8, 5), idx(9, 5), idx(0, 6), idx(1, 6), idx(2, 6)]);
  assert.equal(g.destroyed, 1);
});

test('three destroyed ships win, and the game stops taking shots', () => {
  const g = new Battleship(layout(BASIC));
  g.shoot(1, 6);
  g.shoot(1, 7);
  g.shoot(1, 8);
  assert.ok(g.over);
  assert.ok(g.map.every(v => v !== COM));
  assert.match(g.output, /Human Win\n$/);
  assert.throws(() => g.shoot(1, 6));
  assert.equal(g.map.filter(v => v === EMPTY).length, 100 - 9);
});
