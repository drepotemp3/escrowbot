require("dotenv").config();
const axios = require("axios");
const solanaWeb3 = require("@solana/web3.js");

async function axiosGetWithRetry(url, params, retries = 5, delay = 500) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await axios.get(url, { params });
      return res;
    } catch (err) {
      if (err.response?.status === 429 && i < retries) {
        console.warn(`Rate limited, retry #${i + 1} after ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        delay *= 2; // exponential backoff
      } else {
        throw err;
      }
    }
  }
  throw new Error("Max retries exceeded");
}

let lastBlocks = {
  BEP20: 0,
  POL: 0,
  SOL: 0
};

async function getNewIncoming(wallets) {
  const results = {};

 
  try {
    results.BEP20 = {};
    const apiKey = process.env.BSC_API_KEY;

    results.BEP20.native = await fetchEvmNative(
      "https://api.etherscan.io/v2/api?chainid=56",
      wallets.BEP20,
      lastBlocks.BEP20,
      apiKey,
    );
    

    results.BEP20.usdt = await fetchEvmTokens(
      "https://api.etherscan.io/v2/api?chainid=56",
      wallets.BEP20,
      lastBlocks.BEP20,
      apiKey,
      process.env.USDT_BEP20
    );

    results.BEP20.usdc = await fetchEvmTokens(
      "https://api.etherscan.io/v2/api?chainid=56",
      wallets.BEP20,
      lastBlocks.BEP20,
      apiKey,
      process.env.USDC_BEP20
    );

    lastBlocks.BEP20 = getHighestBlock(results.BEP20);
  } catch (err) {
    console.error("BEP20 error:", err.message);
  }

  try {
    results.POL = {};
    const apiKey = process.env.POL_API_KEY;

    results.POL.native = await fetchEvmNative(
      "https://api.etherscan.io/v2/api?chainid=137",
      wallets.POL,
      lastBlocks.POL,
      apiKey,
    );

    results.POL.usdt = await fetchEvmTokens(
      "https://api.etherscan.io/v2/api?chainid=137",
      wallets.POL,
      lastBlocks.POL,
      apiKey,
      process.env.USDT_POL
    );

    results.POL.usdc = await fetchEvmTokens(
      "https://api.etherscan.io/v2/api?chainid=137",
      wallets.POL,
      lastBlocks.POL,
      apiKey,
      process.env.USDC_POL
    );

    lastBlocks.POL = getHighestBlock(results.POL);
  } catch (err) {
    console.error("POL error:", err.message);
  }

try {
  results.SOL = {};

  const connection = new solanaWeb3.Connection(
    process.env.SOLANA_RPC_URL,
    "confirmed"
  );

  results.SOL.native = await fetchSolNativeIncoming(
      connection,
      wallets.SOL,
      lastBlocks.SOL
    );

 
  results.SOL.usdt = await fetchSolSPLIncoming(
      connection,
      wallets.SOL,
      lastBlocks.SOL,
      process.env.USDT_SOL
    );

  results.SOL.usdc = await fetchSolSPLIncoming(
      connection,
      wallets.SOL,
      lastBlocks.SOL,
      process.env.USDC_SOL
    );

  lastBlocks.SOL = getHighestSolSlot(results.SOL);
  } catch (err) {
    console.error("SOL error:", err.message);
  }


  return results;
}

async function fetchEvmTokens(
  apiUrl,
  address,
  lastBlock,
  apiKey,
  contract_address
) {
  const params = {
    module: "account",
    action: "tokentx",
    "contractaddress": contract_address,
    address,
    startblock: lastBlock + 1,
    endblock: 99999999,
    sort: "asc",
    apikey: apiKey,
  };
    const res = await axiosGetWithRetry(apiUrl, params);
  if (!res.data || res.data.status !== "1" || !Array.isArray(res.data.result)) {
    if (res.data && res.data.message) {
      console.warn(`API warning: ${res.data.result}`);
    }
    return [];
  }
  return res.data.result.filter(
    (tx) => tx.to?.toLowerCase() === address.toLowerCase()
  );
}
async function fetchEvmNative(
  apiUrl,
  address,
  lastBlock,
  apiKey,
) {
  const params = {
    module: "account",
    action: "txlist",
    address,
    startblock: lastBlock + 1,
    endblock: 99999999,
    sort: "asc",
    apikey: apiKey,
  };


  const res = await axiosGetWithRetry(apiUrl, params);
  if (!res.data || res.data.status !== "1" || !Array.isArray(res.data.result)) {
    if (res.data && res.data.message) {
      console.warn(`API warning: ${res.data.message}`);
    }
    return [];
  }

  return res.data.result.filter(
    (tx) => tx.to?.toLowerCase() === address.toLowerCase()
  );
}

function getHighestBlock(networkTxs) {
  let maxBlock = 0;
  for (const type in networkTxs) {
    for (const tx of networkTxs[type]) {
      const block = parseInt(tx.blockNumber);
      if (block > maxBlock) maxBlock = block;
    }
  }
  return maxBlock;
}
async function fetchSolNativeIncoming(connection, wallet, lastSlot) {
  const pubkey = new solanaWeb3.PublicKey(wallet);
  const sigs = await connection.getSignaturesForAddress(pubkey, { limit: 50 });
  const incoming = [];

  for (const sig of sigs) {
    if (sig.slot <= lastSlot) continue;

    const tx = await connection.getParsedTransaction(sig.signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (!tx) continue;

    // Check both top-level and inner instructions for native SOL transfers
    const allInstructions = [
      ...tx.transaction.message.instructions,
      ...(tx.meta?.innerInstructions?.flatMap(i => i.instructions) || [])
    ];

    const isIncoming = allInstructions.some(instr => {
      return (
        instr.programId.equals(solanaWeb3.SystemProgram.programId) &&
        instr.parsed?.type === "transfer" &&
        instr.parsed?.info.destination === wallet
      );
    });

    if (isIncoming) incoming.push(tx);
  }
  return incoming;
}

const splToken = require("@solana/spl-token");

async function fetchSolSPLIncoming(connection, wallet, lastSlot, mint) {
  const walletPubkey = new solanaWeb3.PublicKey(wallet);
  const mintPubkey = new solanaWeb3.PublicKey(mint);

  // Get the associated token account for this wallet + mint
  const associatedTokenAccount = await splToken.getAssociatedTokenAddress(
    mintPubkey,
    walletPubkey
  );

  // Fetch recent signatures to wallet (you might want to paginate for older ones)
  const sigs = await connection.getSignaturesForAddress( associatedTokenAccount, { limit: 50 });
  const incoming = [];
  for (const sig of sigs) {
    if (sig.slot <= lastSlot) continue;
    const tx = await connection.getParsedTransaction(sig.signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (!tx) continue;

    // Combine all instructions, including inner instructions
    const allInstructions = [
      ...tx.transaction.message.instructions,
      ...(tx.meta?.innerInstructions?.flatMap(i => i.instructions) || []),
    ];

    const isIncoming = allInstructions.some(instr => {
      if (!instr.parsed) return false;

      // Check transfer or transferChecked instructions
      if (
        (instr.parsed.type === "transfer" || instr.parsed.type === "transferChecked") &&
        instr.parsed.info.mint === mint &&
        instr.parsed.info.destination === associatedTokenAccount.toBase58()
      ) {
        return true;
      }

      // Also consider createAssociatedTokenAccount if it creates the token account for this mint & wallet
      if (
        instr.parsed.type === "createAssociatedTokenAccount" &&
        instr.parsed.info.mint === mint &&
        instr.parsed.info.associatedAccount === associatedTokenAccount.toBase58()
      ) {
        const rawAmount = instr.parsed.info.amount;
        const amount = Number(rawAmount) / 10 ** tokenDecimals;
    // You can store or log this amount as you like

    // e.g. attach to instruction object for later use
    instr.amount = amount;
        return true;
      }

      return false;
    });

    if (isIncoming) incoming.push(tx);
  }
  return incoming;
}



function getHighestSolSlot(networkTxs) {
  let maxSlot = 0;
  for (const type in networkTxs) {
    for (const tx of networkTxs[type]) {
      if (tx.slot > maxSlot) maxSlot = tx.slot;
    }
  }
  return maxSlot;
}



module.exports = { getNewIncoming };
