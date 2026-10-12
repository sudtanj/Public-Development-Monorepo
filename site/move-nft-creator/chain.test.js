import test from 'node:test';
import assert from 'node:assert/strict';
import { Chain, Abort, MIST_PER_SUI, E_INSUFFICIENT_PAYMENT } from './chain.js';

const M = '0xa';
const A = '0xb';
const nft = (name) => ({ recipient: A, name, description: `${name} description`, image: `https://example.com/${name}.png` });

test('init creates an empty MinterCap owned by the manager', () => {
  const c = new Chain(M);
  assert.equal(c.minterCap.owner, M);
  assert.equal(c.minterCap.sales, 0n);
  assert.equal(c.events.length, 0);
});

test('mint takes 1 SUI, keeps the change and gives the NFT to the recipient', () => {
  const c = new Chain(M);
  c.faucet(M, 3n * MIST_PER_SUI);
  const n = c.mint(M, nft('one'));
  assert.equal(c.balance(M), 2n * MIST_PER_SUI);
  assert.equal(c.minterCap.sales, MIST_PER_SUI);
  assert.equal(n.owner, A);
  assert.deepEqual(c.events.map((e) => e.type), ['NonFungibleTokenMinted']);
});

test('mint aborts with EInsufficientPayment below 1 SUI', () => {
  const c = new Chain(M);
  c.faucet(M, MIST_PER_SUI - 1n);
  assert.throws(() => c.mint(M, nft('one')), (e) => e instanceof Abort && e.code === E_INSUFFICIENT_PAYMENT);
});

test('only the MinterCap owner can mint or withdraw', () => {
  const c = new Chain(M);
  c.faucet(A, 5n * MIST_PER_SUI);
  assert.throws(() => c.mint(A, nft('one')), Abort);
  assert.throws(() => c.withdrawSales(A), Abort);
});

test('combine burns both NFTs and builds name and description', () => {
  const c = new Chain(M);
  c.faucet(M, 5n * MIST_PER_SUI);
  const a = c.mint(M, nft('NFT1'));
  const b = c.mint(M, nft('NFT2'));
  const n = c.combine(A, a.id, b.id, 'https://example.com/new.png');
  assert.equal(n.name, 'NFT1 + NFT2');
  assert.equal(n.description, 'Combined NFT of NFT1 and NFT2');
  assert.equal(n.image, 'https://example.com/new.png');
  assert.equal(c.nfts.has(a.id), false);
  assert.equal(c.nfts.has(b.id), false);
  assert.equal(c.events.at(-1).type, 'NonFungibleTokenCombined');
});

test('combine rejects NFTs the sender does not own, or the same NFT twice', () => {
  const c = new Chain(M);
  c.faucet(M, 5n * MIST_PER_SUI);
  const a = c.mint(M, nft('NFT1'));
  const b = c.mint(M, nft('NFT2'));
  assert.throws(() => c.combine(M, a.id, b.id, 'x'), Abort);
  assert.throws(() => c.combine(A, a.id, a.id, 'x'), Abort);
});

test('burn deletes the NFT and only for its owner', () => {
  const c = new Chain(M);
  c.faucet(M, 2n * MIST_PER_SUI);
  const a = c.mint(M, nft('NFT1'));
  assert.throws(() => c.burn(M, a.id), Abort);
  c.burn(A, a.id);
  assert.equal(c.nfts.size, 0);
  assert.equal(c.events.at(-1).type, 'NonFungibleTokenDeleted');
});

test('withdraw_sales moves the whole sales balance to the manager', () => {
  const c = new Chain(M);
  c.faucet(M, 3n * MIST_PER_SUI);
  c.mint(M, nft('a'));
  c.mint(M, nft('b'));
  const amount = c.withdrawSales(M);
  assert.equal(amount, 2n * MIST_PER_SUI);
  assert.equal(c.minterCap.sales, 0n);
  assert.equal(c.balance(M), 3n * MIST_PER_SUI);
  assert.equal(c.events.at(-1).amount, 2n * MIST_PER_SUI);
});
