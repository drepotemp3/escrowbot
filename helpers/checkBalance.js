// EVM chains: BSC and Polygon
const { ethers } = require("ethers");
const { Connection, PublicKey } = require("@solana/web3.js");
const {
  getAccount,
  getAssociatedTokenAddress,
  getMint,
} = require("@solana/spl-token");

// RPCs
const RPCS = {
  bsc: "https://lb.drpc.org/bsc/AukSluwhPk7Poe7SNv7xbCjqmHeHdiAR8IjtIgaNGuYu",
  pol: "https://lb.drpc.org/polygon/AukSluwhPk7Poe7SNv7xbCjqmHeHdiAR8IjtIgaNGuYu",
};

// ERC20 token addresses
const TOKENS = {
  bsc: {
    usdt: "0x55d398326f99059fF775485246999027B3197955",
    usdc: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
  },
  pol: {
    usdt: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
    usdc: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
  },
};

// ERC20 ABI for balance and decimals
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

// Solana RPC and token addresses
const SOL_RPC =
  "https://lb.drpc.org/solana/AukSluwhPk7Poe7SNv7xbCjqmHeHdiAR8IjtIgaNGuYu";
const TOKENS_SOL = {
  usdt: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  usdc: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
};

const checkSolBalance = async (walletAddress) => {
  const connection = new Connection(SOL_RPC);
  const pubKey = new PublicKey(walletAddress);

  const result = { native: null, usdt: null, usdc: null };

  // Native SOL balance
  try {
    const solBalance = await connection.getBalance(pubKey);
    result.native = solBalance / 1e9;
  } catch {
    result.native = null;
  }

  // SPL tokens (USDT, USDC)
  for (const [symbol, mintAddr] of Object.entries(TOKENS_SOL)) {
    try {
      const mintPubKey = new PublicKey(mintAddr);
      const ata = await getAssociatedTokenAddress(mintPubKey, pubKey);
      const accountInfo = await getAccount(connection, ata);
      const mintInfo = await getMint(connection, mintPubKey);
      result[symbol] =
        Number(accountInfo.amount) / Math.pow(10, mintInfo.decimals);
    } catch {
      result[symbol] = null;
    }
  }

  return result;
};

const checkEvmBalance = async (chain, walletAddress) => {
  // ✅ ethers v5 style
  const provider = new ethers.providers.JsonRpcProvider(RPCS[chain]);
  const result = { native: null, usdt: null, usdc: null };

  try {
    // Native balance
    const nativeBalance = await provider.getBalance(walletAddress);
    const native = Number(ethers.utils.formatEther(nativeBalance));
    result.native = native;

    // ERC20 tokens
    for (const [symbol, tokenAddr] of Object.entries(TOKENS[chain])) {
      const token = new ethers.Contract(tokenAddr, ERC20_ABI, provider);
      const rawBalance = await token.balanceOf(walletAddress);
      const decimals = await token.decimals();
      const formatted = Number(ethers.utils.formatUnits(rawBalance, decimals));
      result[symbol] = formatted;
    }
  } catch (e) {
    console.error(`Error fetching balances for ${chain}:`, e);
  }

  return result;
};

module.exports = { checkSolBalance, checkEvmBalance };
