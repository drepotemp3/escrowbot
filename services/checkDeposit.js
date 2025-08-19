
require("dotenv/config")
const { Connection, PublicKey, SystemProgram } = require('@solana/web3.js');
const axios = require('axios');

/**
 * Poll for a deposit until found or timeout.
 * @param {Object} params
 * @param {string} params.network - "BEP20", "POL", "SOL"
 * @param {string} params.token - "USDT", "USDC", "native", etc.
 * @param {string} params.depositAddress - Wallet address to watch
 * @param {number} params.intervalMs - Polling interval (default 8s)
 * @param {number} params.timeoutMs - Timeout in ms (default 10min)
 */
async function checkDeposit({ network, token, depositAddress, intervalMs = 8000, timeoutMs = 10 * 60 * 1000 }) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const deposit = await verifyDeposit({ network, token, depositAddress });
    if (deposit) return deposit;

    await new Promise(res => setTimeout(res, intervalMs));
  }

  return null; // Timed out
}

async function verifyDeposit({ network, token, depositAddress }) {
  switch (network.toUpperCase()) {
    case 'BEP20':
    case 'POL':
      return checkEVM(network, token, depositAddress);

    case 'SOL':
      return checkSolana(token, depositAddress);

    default:
      throw new Error(`Unsupported network: ${network}`);
  }
}

async function checkEVM(network, token, depositAddress) {
  const apiKeys = {
    BEP20: process.env.BSCSCAN_API_KEY,
    POL: process.env.POLYGONSCAN_API_KEY
  };
  const baseUrls = {
    BEP20: 'https://api.bscscan.com/api',
    POL: 'https://api.polygonscan.com/api'
  };

  if (token.toLowerCase() === 'native') {
    const nativeUrl = `${baseUrls[network]}?module=account&action=txlist&address=${depositAddress}&sort=desc&apikey=${apiKeys[network]}`;
    const res = await axios.get(nativeUrl);
    const tx = res.data.result.find(tx => tx.to.toLowerCase() === depositAddress.toLowerCase());
    if (!tx) return null;
    return {
      from: tx.from,
      amount: parseFloat(tx.value) / 1e18,
      token: network.toUpperCase(),
      txHash: tx.hash
    };
  }

  const url = `${baseUrls[network]}?module=account&action=tokentx&address=${depositAddress}&sort=desc&apikey=${apiKeys[network]}`;
  const res = await axios.get(url);
  const match = res.data.result.find(tx =>
    tx.to.toLowerCase() === depositAddress.toLowerCase() &&
    tx.tokenSymbol.toLowerCase() === token.toLowerCase()
  );
  if (!match) return null;
  return {
    from: match.from,
    amount: parseFloat(match.value) / Math.pow(10, match.tokenDecimal),
    token: match.tokenSymbol,
    txHash: match.hash
  };
}

async function checkSolana(token, depositAddress) {
  const connection = new Connection(process.env.SOLANA_RPC, 'confirmed');
  const pubKey = new PublicKey(depositAddress);

  const sigs = await connection.getSignaturesForAddress(pubKey, { limit: 5 });
  if (!sigs.length) return null;

  for (let sigInfo of sigs) {
    const tx = await connection.getTransaction(sigInfo.signature, { commitment: 'confirmed' });
    if (!tx) continue;

    const allInstructions = [
      ...tx.transaction.message.instructions,
      ...(tx.meta?.innerInstructions?.flatMap(i => i.instructions) || [])
    ];

    // Native SOL
    for (const instr of allInstructions) {
      if (
        instr.programId.equals(SystemProgram.programId) &&
        instr.parsed?.type === "transfer" &&
        instr.parsed?.info.destination === depositAddress
      ) {
        return {
          from: instr.parsed.info.source,
          amount: instr.parsed.info.lamports / 1e9,
          token: 'SOL',
          txHash: sigInfo.signature
        };
      }
    }

    // SPL Token (based on balance diff)
    const postTokenBalances = tx.meta?.postTokenBalances || [];
    const preTokenBalances = tx.meta?.preTokenBalances || [];

    const receiverEntry = postTokenBalances.find(b => b.owner === depositAddress);
    if (receiverEntry) {
      const mint = receiverEntry.mint;
      if (token !== 'native' && token !== mint) continue;

      const decimals = receiverEntry.uiTokenAmount.decimals;
      const preEntry = preTokenBalances.find(b => b.owner === depositAddress && b.mint === mint);
      const preAmount = preEntry ? BigInt(preEntry.uiTokenAmount.amount) : 0n;
      const postAmount = BigInt(receiverEntry.uiTokenAmount.amount);
      const diff = postAmount - preAmount;

      if (diff > 0) {
        return {
          from: 'Unknown',
          amount: Number(diff) / Math.pow(10, decimals),
          token: mint,
          txHash: sigInfo.signature
        };
      }
    }
  }

  return null;
}

// // Example usage:
// (async () => {
//   const deposit = await pollForDeposit({
//     network: 'BEP20',
//     token: 'USDT',
//     depositAddress: '0xYourAddress',
//     intervalMs: 8000,
//     timeoutMs: 10 * 60 * 1000
//   });

//   if (deposit) {
//     console.log(`✅ Received ${deposit.amount} ${deposit.token} from ${deposit.from} in tx ${deposit.txHash}`);
//   } else {
//     console.log("⏰ Timed out, no deposit found.");
//   }
// })();
module.exports = checkDeposit