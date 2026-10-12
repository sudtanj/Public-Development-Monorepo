import { Chain, Abort, MIST_PER_SUI } from './chain.js';

const ACCOUNTS = [
  { addr: '0xa', label: 'Manager (0xa)' },
  { addr: '0xb', label: 'Alice (0xb)' },
  { addr: '0xc', label: 'Bob (0xc)' },
];
const label = (addr) => ACCOUNTS.find((a) => a.addr === addr)?.label ?? addr;
const sui = (mist) => `${Number(mist) / Number(MIST_PER_SUI)} SUI`;
const $ = (id) => document.getElementById(id);

let chain;

function reset() {
  chain = new Chain('0xa');
  chain.faucet('0xa', 5n * MIST_PER_SUI);
  render();
}

// Deterministic placeholder artwork so NFTs without an image URL still show something.
function placeholder(name) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160"><rect width="240" height="160" fill="hsl(${h},60%,55%)"/><circle cx="120" cy="80" r="40" fill="hsl(${(h + 60) % 360},70%,75%)"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function safeImage(url, fallbackName) {
  return /^https?:\/\//i.test(url) ? url : placeholder(fallbackName);
}

function fill(select, items, empty) {
  const prev = select.value;
  select.replaceChildren(...items.map(([value, text]) => Object.assign(document.createElement('option'), { value, textContent: text })));
  if (!items.length) select.append(Object.assign(document.createElement('option'), { value: '', textContent: empty }));
  if (items.some(([v]) => v === prev)) select.value = prev;
}

function render() {
  const actor = $('actor').value || '0xa';
  fill($('actor'), ACCOUNTS.map((a) => [a.addr, a.label]));
  $('actor').value = actor;
  fill($('recipient'), ACCOUNTS.map((a) => [a.addr, a.label]));
  const mine = chain.nftsOf(actor).map((n) => [n.id, `${n.name} (${n.id})`]);
  for (const id of ['c1', 'c2', 'b1']) fill($(id), mine, '(no NFTs)');
  if (mine.length > 1 && $('c1').value === $('c2').value) $('c2').value = mine[1][0];

  $('sales').textContent = sui(chain.minterCap.sales);
  $('balances').replaceChildren(
    ...ACCOUNTS.map((a) => {
      const tr = document.createElement('tr');
      for (const text of [a.label, sui(chain.balance(a.addr)), `${chain.nftsOf(a.addr).length} NFT(s)`]) {
        tr.append(Object.assign(document.createElement('td'), { textContent: text }));
      }
      return tr;
    }),
  );

  $('nfts').replaceChildren(
    ...[...chain.nfts.values()].map((n) => {
      const card = document.createElement('div');
      card.className = 'nft';
      const img = document.createElement('img');
      img.src = safeImage(n.image, n.name);
      img.alt = n.name;
      img.referrerPolicy = 'no-referrer';
      img.onerror = () => (img.src = placeholder(n.name));
      const info = document.createElement('div');
      const title = document.createElement('b');
      title.textContent = n.name;
      info.append(title, document.createElement('br'), n.description, document.createElement('br'), `owner: ${label(n.owner)}`);
      card.append(img, info);
      return card;
    }),
  );

  $('log').textContent = chain.events
    .map((e) => {
      const { type, ...rest } = e;
      const fields = Object.entries(rest).map(([k, v]) => `${k}=${typeof v === 'bigint' ? sui(v) : v}`);
      return `${type}  ${fields.join('  ')}`;
    })
    .join('\n');
}

function run(action) {
  $('error').textContent = '';
  try {
    action($('actor').value);
  } catch (e) {
    if (!(e instanceof Abort)) throw e;
    $('error').textContent = e.message;
  }
  render();
}

$('faucet').onclick = () => run((actor) => chain.faucet(actor, 5n * MIST_PER_SUI));
$('reset').onclick = reset;
$('mint').onclick = () =>
  run((actor) => {
    const name = $('name').value.trim() || 'Untitled';
    chain.mint(actor, { recipient: $('recipient').value, name, description: $('desc').value, image: $('image').value.trim() });
  });
$('combine').onclick = () =>
  run((actor) => chain.combine(actor, $('c1').value, $('c2').value, $('cimage').value.trim()));
$('burn').onclick = () => run((actor) => chain.burn(actor, $('b1').value));
$('withdraw').onclick = () => run((actor) => chain.withdrawSales(actor));
$('actor').onchange = render;

reset();
