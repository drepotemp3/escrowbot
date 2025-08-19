// wallet_create.js
const { ethers } = require("ethers");
const solanaWeb3 = require("@solana/web3.js");

class MultiChainWallet {
  constructor() {
    this.tokenContracts = {
      USDT_BEP20: "0x55d398326f99059ff775485246999027b3197955", // Binance Smart Chain
      USDT_POL: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", // Polygon
      USDT_SOL: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // Solana
      USDC_BEP20: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
      USDC_POL: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
      USDC_SOL: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    };
  }

  async generateWallets() {
    // 2️⃣ Create a single EVM wallet for both BEP20 and POL
    const evmWallet = ethers.Wallet.createRandom();

    // 3️⃣ Create a Solana wallet
    const solKeypair = solanaWeb3.Keypair.generate();

    // 4️⃣ Structure wallet data
    const walletData = {
      BEP20: {
        address: evmWallet.address,
        privateKey: evmWallet.privateKey,
      },
      POL: {
        address: evmWallet.address,
        privateKey: evmWallet.privateKey,
      },
      SOL: {
        address: solKeypair.publicKey.toBase58(),
        privateKey: Buffer.from(solKeypair.secretKey).toString("hex"),
      },
    };

    return walletData;
  }
}

module.exports = MultiChainWallet;
