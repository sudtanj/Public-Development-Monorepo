#!/usr/bin/env bash
# Starts a local Sui network, publishes the package and exercises
# mint_nft, burn_nft and withdraw_sales with real transactions.
# Requires the `sui` CLI (same version as the framework in Move.toml) and jq.
set -euo pipefail
cd "$(dirname "$0")/.."

WORK=$(mktemp -d)
sui genesis -f
sui start >"$WORK/node.log" 2>&1 &
NODE=$!
trap 'kill $NODE 2>/dev/null || true' EXIT

echo "Waiting for the local network..."
for _ in $(seq 1 60); do
  sui client gas >/dev/null 2>&1 && break
  sleep 2
done
sui client gas

ME=$(sui client active-address)
MOD=NonFungibleToken
GAS=100000000

echo "== publish"
sui client publish --gas-budget 500000000 --skip-dependency-verification --json >"$WORK/publish.json" 2>"$WORK/publish.err" \
  || { cat "$WORK/publish.err"; exit 1; }
PKG=$(jq -r '.objectChanges[] | select(.type=="published") | .packageId' "$WORK/publish.json")
CAP=$(jq -r --arg m "::$MOD::MinterCap" '.objectChanges[] | select(.type=="created" and (.objectType|endswith($m))) | .objectId' "$WORK/publish.json")
echo "package=$PKG minter_cap=$CAP"
test -n "$PKG" && test -n "$CAP"

echo "== mint_nft (pays 1 SUI into the MinterCap)"
sui client ptb \
  --split-coins gas "[1000000000]" --assign pay \
  --move-call "$PKG::$MOD::mint_nft" "@$ME" "'E2E NFT'" "'minted by CI'" "'https://example.com/nft.png'" pay "@$CAP" \
  --transfer-objects "[pay]" "@$ME" \
  --gas-budget $GAS --json >"$WORK/mint.json"
jq -e '.effects.status.status=="success"' "$WORK/mint.json"
jq -e '.events | map(.type) | any(endswith("::NonFungibleTokenMinted"))' "$WORK/mint.json"
NFT=$(jq -r --arg m "::$MOD::NonFungibleToken" '.objectChanges[] | select(.type=="created" and (.objectType|endswith($m))) | .objectId' "$WORK/mint.json")
echo "nft=$NFT"
test -n "$NFT"

echo "== burn_nft"
sui client call --package "$PKG" --module "$MOD" --function burn_nft --args "$NFT" --gas-budget $GAS --json >"$WORK/burn.json"
jq -e '.effects.status.status=="success"' "$WORK/burn.json"
jq -e '.events | map(.type) | any(endswith("::NonFungibleTokenDeleted"))' "$WORK/burn.json"

echo "== withdraw_sales"
sui client ptb \
  --move-call "$PKG::$MOD::withdraw_sales" "@$CAP" --assign coin \
  --transfer-objects "[coin]" "@$ME" \
  --gas-budget $GAS --json >"$WORK/withdraw.json"
jq -e '.effects.status.status=="success"' "$WORK/withdraw.json"
jq -e '.events[] | select(.type|endswith("::SalesWithdrawn")) | .parsedJson.amount == "1000000000"' "$WORK/withdraw.json"

echo "All local-network checks passed."
