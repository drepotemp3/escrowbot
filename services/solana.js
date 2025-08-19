// // const { Connection, Keypair, PublicKey } = require("@solana/web3.js");
// // const {
// //   getOrCreateAssociatedTokenAccount,
// //   transfer,
// //   getAccount,
// // } = require("@solana/spl-token");

// // // Solana RPC
// // const SOLANA_RPC = "https://api.mainnet-beta.solana.com";
// // const connection = new Connection(SOLANA_RPC);

// // // Solana Token Mints
// // const SOLANA_TOKENS = {
// //   USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
// //   USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
// // };

// // const solana = {
// //   getBalance: async (token, address) => {
// //     const publicKey = new PublicKey(address);
// //     const mint = new PublicKey(SOLANA_TOKENS[token]);
// //     try {
// //         console.log("Attempting to fetch")
// //       const account = await getAccount(
// //         connection,
// //         await getOrCreateAssociatedTokenAccount(
// //           connection,
// //           null, // No payer needed for read-only
// //           mint,
// //           publicKey
// //         )
// //       );
// //       return {
// //         fetched: true,
// //         balance: account.amount.toString() / Math.pow(10, account.decimals),
// //       };
// //     } catch (error) {
// //       console.log("Error checking balance:\n", error);
// //       return { fetched: false };
// //     }
// //   },
// // };

// // (async () => {
// //   const res = await solana.getBalance("USDT", "HvwC9QSAzvGXhhVrgPmauVwFWcYZhne3hVot9EbHuFTm");
// //   console.log(res);
// // })();



// const { Connection, PublicKey } = require('@solana/web3.js');
// const { ethers } = require('ethers');

// (async () => {
//   const solana = new Connection('https://api.mainnet-beta.solana.com');
//   const polygon = new ethers.providers.JsonRpcProvider('https://polygon-rpc.com');
//   const bsc = new ethers.providers.JsonRpcProvider('https://bsc-dataseed.binance.org/');

//   async function solBalance(mint, owner, label) {
//     try {
//       const resp = await solana.getTokenAccountsByOwner(new PublicKey(owner), { mint: new PublicKey(mint) });
//       const amount = resp.value.length > 0
//         ? resp.value[0].account.data.parsed.info.tokenAmount.uiAmount
//         : 0;
//       console.log(`[${label}] Solana balance for ${owner}:`, amount);
//     } catch (err) {
//       console.error(`[${label}] Solana error for ${owner}:`, err.message);
//     }
//   }

//   async function evmBalance(contract, owner, provider, label) {
//     try {
//       const abi = ['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)'];
//       const token = new ethers.Contract(contract, abi, provider);
//       const [bal, dec] = await Promise.all([token.balanceOf(owner), token.decimals()]);
//       console.log(`[${label}] balance for ${owner}:`, Number(bal) / 10 ** dec);
//     } catch (err) {
//       console.error(`[${label}] error:`, err.message);
//     }
//   }

//   // === Real Wallet Addresses from Public Sources ===
//   // Solana (Binance Hot Wallet)
//   const solOwner = '8JbKJuoJgBq6RtWLpmjHtkobaN6D2PfYZ7RUTpuC9JVe';

//   // Polygon & BSC (Binance Hot Wallet)
//   const evmOwner = '0x3f5CE5FBFe3E9af3971dD833D26BA9b5C936f0bE';

//   // === IIFE Invocations ===
//   // Solana USDT
//   (async () => solBalance('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', solOwner, 'Solana USDT'))();

//   // Solana USDC
//   (async () => solBalance('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', solOwner, 'Solana USDC'))();

//   // Polygon USDT
//   (async () => evmBalance('0xc2132d05d31c914a87c6611c10748aeb04b58e8f', evmOwner, polygon, 'Polygon USDT'))();

//   // Polygon USDC
//   (async () => evmBalance('0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', evmOwner, polygon, 'Polygon USDC'))();

//   // BSC USDT
//   (async () => evmBalance('0x55d398326f99059ff775485246999027b3197955', evmOwner, bsc, 'BSC USDT'))();

//   // BSC USDC
//   (async () => evmBalance('0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', evmOwner, bsc, 'BSC USDC'))();
// })();
