import { Battleship, WIDTH, HEIGHT, PLAYER, COM, SHIPS_TO_WIN } from './game.js';

const $ = id => document.getElementById(id);
let game, shots, sunk;

function newGame() {
  game = new Battleship();
  shots = new Set();
  sunk = new Set();
  draw();
}

function fire(col, row) {
  shots.add((row - 1) * WIDTH + col - 1);
  for (const i of game.shoot(col, row)) sunk.add(i);
  draw();
}

function label(text) {
  const el = document.createElement('div');
  el.className = 'label';
  el.textContent = text;
  return el;
}

function draw() {
  const reveal = $('reveal').checked;
  const cells = [label('')];
  for (let c = 1; c <= WIDTH; c++) cells.push(label(c));
  for (let r = 0; r < HEIGHT; r++) {
    cells.push(label(r + 1));
    for (let c = 0; c < WIDTH; c++) {
      const i = r * WIDTH + c, v = game.map[i];
      const b = document.createElement('button');
      if (sunk.has(i)) {
        b.className = 'sunk';
        b.textContent = '✕';
      } else {
        if (v === PLAYER) b.classList.add('player');
        if (v === COM && reveal) b.classList.add('com');
        if (shots.has(i)) b.classList.add('miss');
      }
      b.title = `Column ${c + 1}, row ${r + 1}`;
      b.setAttribute('aria-label', b.title);
      b.disabled = game.over;
      b.onclick = () => fire(c + 1, r + 1);
      cells.push(b);
    }
  }
  $('sea').replaceChildren(...cells);
  $('terminal').textContent = game.output;
  $('terminal').scrollTop = 1e9;
  $('status').textContent = game.over
    ? `Human Win: ${SHIPS_TO_WIN} ships destroyed.`
    : `Ships destroyed: ${game.destroyed} / ${SHIPS_TO_WIN}`;
}

$('reveal').onchange = draw;
$('restart').onclick = newGame;
newGame();
