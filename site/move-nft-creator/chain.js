// A small in-memory model of move-nft-creator/sources/nft.move (module overmind::NonFungibleToken).
// It mirrors the contract's rules so the behaviour can be explored in the browser. It is NOT the Move VM;
// the real contract is covered by `sui move test` and a local Sui network in CI.

export const MIST_PER_SUI = 1_000_000_000n;
export const MINT_PRICE = MIST_PER_SUI; // 1 SUI, same constant as in mint_nft
export const E_INSUFFICIENT_PAYMENT = 1; // EInsufficientPayment

export class Abort extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

export class Chain {
  constructor(manager) {
    this.manager = manager;
    this.balances = new Map(); // address -> bigint (MIST)
    this.nfts = new Map(); // id -> { id, owner, name, description, image }
    this.events = [];
    this.nextId = 1;
    // init(): MinterCap created and transferred to the deployer
    this.minterCap = { id: this.newId(), owner: manager, sales: 0n };
  }

  newId() {
    return '0x' + (this.nextId++).toString(16).padStart(8, '0');
  }

  balance(addr) {
    return this.balances.get(addr) ?? 0n;
  }

  faucet(addr, amount) {
    this.balances.set(addr, this.balance(addr) + amount);
  }

  emit(type, fields) {
    this.events.push({ type, ...fields });
  }

  nftsOf(addr) {
    return [...this.nfts.values()].filter((n) => n.owner === addr);
  }

  owned(sender, id) {
    const nft = this.nfts.get(id);
    if (!nft) throw new Abort(`Object ${id} does not exist`);
    if (nft.owner !== sender) throw new Abort(`Object ${id} is not owned by the sender`);
    return nft;
  }

  // mint_nft: only the MinterCap owner can call it; costs 1 SUI which goes to the MinterCap's sales.
  mint(sender, { recipient, name, description, image }) {
    if (this.minterCap.owner !== sender) throw new Abort('Only the owner of the MinterCap can mint');
    if (this.balance(sender) < MINT_PRICE) {
      throw new Abort('Abort: EInsufficientPayment', E_INSUFFICIENT_PAYMENT);
    }
    this.balances.set(sender, this.balance(sender) - MINT_PRICE);
    this.minterCap.sales += MINT_PRICE;
    const nft = { id: this.newId(), owner: recipient, name, description, image };
    this.emit('NonFungibleTokenMinted', { nft_id: nft.id, recipient });
    this.nfts.set(nft.id, nft);
    return nft;
  }

  // combine_nfts: both NFTs are deleted and a new one is returned to the sender.
  combine(sender, id1, id2, newImage) {
    if (id1 === id2) throw new Abort('Pick two different NFTs');
    const a = this.owned(sender, id1);
    const b = this.owned(sender, id2);
    const nft = {
      id: this.newId(),
      owner: sender,
      name: `${a.name} + ${b.name}`,
      description: `Combined NFT of ${a.name} and ${b.name}`,
      image: newImage,
    };
    this.emit('NonFungibleTokenCombined', { nft1_id: a.id, nft2_id: b.id, new_nft_id: nft.id });
    this.nfts.delete(a.id);
    this.nfts.delete(b.id);
    this.nfts.set(nft.id, nft);
    return nft;
  }

  // burn_nft
  burn(sender, id) {
    const nft = this.owned(sender, id);
    this.emit('NonFungibleTokenDeleted', { nft_id: nft.id });
    this.nfts.delete(nft.id);
  }

  // withdraw_sales: the MinterCap owner takes the whole sales balance.
  withdrawSales(sender) {
    if (this.minterCap.owner !== sender) throw new Abort('Only the owner of the MinterCap can withdraw');
    const amount = this.minterCap.sales;
    this.minterCap.sales = 0n;
    this.emit('SalesWithdrawn', { amount });
    this.faucet(sender, amount);
    return amount;
  }
}
