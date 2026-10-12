# NFT Module in Move

This repository contains a Move-based Non-Fungible Token (NFT) module with advanced features for creating, managing, and interacting with NFTs. It allows minting, combining, and burning NFTs while supporting a seamless sales mechanism.

## Features

### Collection Manager
The collection manager is the owner of the `MinterCap` object, granting them the following privileges:
- Mint new NFTs.
- Withdraw proceeds from NFT sales.

### Minting NFTs
- Only the collection manager can mint NFTs.
- Minting requires a payment of 1 SUI, which is sent to the `MinterCap` object. Any change is returned to the sender.
- The newly minted NFT is represented by a `NonFungibleToken` object and transferred to the specified recipient.

### Combining NFTs
- Users who own at least two NFTs can combine them to create a new NFT.
- The two original NFTs are burned, and a new NFT is created, represented by a `NonFungibleToken` object.
- The name of the new NFT is the concatenation of the names of the two NFTs:  
  New NFT Name = NFT1 Name + " + " + NFT2 Name.
- The description of the new NFT follows this format:  
  "Combined NFT of " + NFT1 Name + " and " + NFT2 Name.
- The image URL of the new NFT is provided by the user during the transaction.

**Example:**
- NFT1 Name: NFT1
- NFT2 Name: NFT2
- New NFT Name: NFT1 + NFT2
- New NFT Description: Combined NFT of NFT1 and NFT2

### Burning NFTs
- Users can burn NFTs they own. Once burned, the NFT is permanently deleted.

### Withdrawing NFT Sales
- The collection manager can withdraw the sales balance stored in the `MinterCap` object.
- The sales balance represents the total amount of SUI paid for NFTs.

### Public Getters
The module provides public getter functions to retrieve the following NFT attributes:
- Name
- Description
- Image URL

---

## How to Run the Tests

Follow these steps to test the NFT module using the Sui framework and Move language:

1. Set Up the Environment: Ensure you have the necessary tools and environment configured. Install the Sui CLI and framework by following the installation guide from the official documentation. Verify your setup by running sui --version.

2. Clone the Repository: Clone the repository and navigate to the project directory using the following commands: git clone <repository_url> and cd <repository_folder>.

3. Run Move Unit Tests: To run the Move tests for the module, execute sui move test.

4. View Test Results: The command will output test results, including passed and failed test cases as well as detailed error messages for failed tests.

5. Debugging Tests: If any tests fail, check the specific test cases and their expected outputs. Debug using the error logs provided by the sui move test command. Review the tests/ directory (if included) for the Move test scripts.

6. Local Network Testing (Optional): If you'd like to test the module on a local Sui network, start the Sui local network using sui start. Deploy the module using sui client publish --gas-budget <gas_amount>. Use sui client call commands to manually interact with the deployed module and verify functionality.

---

## Contribution

We welcome contributions to enhance and expand the module. Please feel free to submit issues, feature requests, or pull requests.  

---

## CI and showcase (in this monorepo)

- **Unit tests:** `.github/workflows/move.yml` runs `sui move build` and `sui move test` (Sui CLI `testnet-v1.18.1`, matching the framework rev in `Move.toml`).
- **Simulated blockchain:** the same workflow starts a local Sui network (`sui genesis` + `sui start`), publishes the package and sends real transactions for `mint_nft`, `burn_nft` and `withdraw_sales` (`scripts/localnet-e2e.sh`). `combine_nfts` is covered by the unit tests only, because the NFT type has neither `store` nor `drop`, so a transaction can't hold its result without a wrapper function.
- **Try it in the browser:** an interactive simulation on GitHub Pages (`site/move-nft-creator`) models the contract's rules: mint for 1 SUI, combine, burn, withdraw. It is a JavaScript model, not the Move VM, and it has its own tests in CI.
