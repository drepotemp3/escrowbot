const { ethers } = require("ethers");
const solanaWeb3 = require("@solana/web3.js");
const splToken = require("@solana/spl-token");
const multichainWallet = require("multichain-crypto-wallet");
const bs58 = require("bs58");
const {
  Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction,
} = solanaWeb3;


async function withdrawNativeEVM({
  network,
  walletPrivateKey,
  toAddress,
  amount,
  priorityFeeGwei = null
}) {
  const rpcUrl = network === "BSC" ? process.env.BSC_RPC_URL : process.env.POLYGON_RPC_URL;
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(walletPrivateKey, provider);

  // 1. Safely parse the input amount
  let amountInWei;
  try {
    amountInWei = ethers.utils.parseEther(amount.toString());
  } catch (error) {
    if (error.code === "NUMERIC_FAULT") {
      const roundedAmount = parseFloat(amount).toFixed(18);
      amountInWei = ethers.utils.parseEther(roundedAmount);
    } else {
      throw error;
    }
  }

  // 2. Get current balance
  const balance = await provider.getBalance(wallet.address);

  // 3. Get current block and fee data
  const [block] = await Promise.all([
    provider.getBlock("latest"),
  ]);

  // 4. Dynamic fee calculation
  const baseFeePerGas = block.baseFeePerGas ?? ethers.utils.parseUnits("30", "gwei");
  const maxPriorityFeePerGas = priorityFeeGwei
    ? ethers.utils.parseUnits(priorityFeeGwei.toString(), "gwei")
    : network === "POL"
      ? ethers.utils.parseUnits("30", "gwei")
      : ethers.utils.parseUnits("1.5", "gwei");

  const maxFeePerGas = baseFeePerGas.add(maxPriorityFeePerGas);
  const gasLimit = 21000;
  const estimatedGasCost = maxFeePerGas.mul(gasLimit);

  // 5. Check balance sufficiency (amount + gas cost)
  let amountToSend = amountInWei;

  if (balance.lt(amountInWei.add(estimatedGasCost))) {
    const maxAmount = balance.sub(estimatedGasCost).gt(0)
      ? balance.sub(estimatedGasCost)
      : ethers.BigNumber.from(0);

    // Automatically adjust amountToSend to maxAmount
    amountToSend = maxAmount;
  }



  // 6. Send transaction with full amount
  const tx = {
    to: toAddress,
    value: amountToSend,
    gasLimit,
    maxFeePerGas,
    maxPriorityFeePerGas,
    type: 2,
  };

  try {
    const txResponse = await wallet.sendTransaction(tx);
    return txResponse.hash;
  } catch (error) {
    if (error.message.includes("insufficient funds")) {
      // Retry with max amount if possible
      const remainingAfterGas = balance.sub(estimatedGasCost.mul(2));
      if (remainingAfterGas.gt(0)) {
        console.warn(`Retrying with maximum possible amount: ${ethers.utils.formatEther(remainingAfterGas)}`);
        return withdrawNativeEVM({
          network,
          walletPrivateKey,
          toAddress,
          amount: ethers.utils.formatEther(remainingAfterGas),
          priorityFeeGwei
        });
      }
    }
    throw error;
  }
}

async function withdrawTokenEVM({
  network,
  walletPrivateKey,
  toAddress,
  amount,
  tokenAddress,
  priorityFeeGwei = null,
}) {
  const rpcUrl = network === "BSC" ? process.env.BSC_RPC_URL : process.env.POLYGON_RPC_URL;
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(walletPrivateKey, provider);

  const ERC20_ABI = [
    "function decimals() view returns (uint8)",
    "function transfer(address to, uint amount) returns (bool)",
  ];
  const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);

  // Get token decimals and parse amount
  const decimals = await tokenContract.decimals();
  const tokenAmount = ethers.utils.parseUnits(amount.toString(), decimals);

  // Get current network conditions
  const [block, feeData] = await Promise.all([
    provider.getBlock("latest"),
    provider.getFeeData()
  ]);

  // Dynamic fee calculation
  const baseFeePerGas = block.baseFeePerGas ?? ethers.utils.parseUnits("30", "gwei");
  const maxPriorityFeePerGas = priorityFeeGwei
    ? ethers.utils.parseUnits(priorityFeeGwei.toString(), "gwei")
    : network === "POL"
      ? ethers.utils.parseUnits("30", "gwei") // Polygon can handle higher priority fees
      : ethers.utils.parseUnits("1.5", "gwei"); // Reduced default for BSC

  // More accurate gas estimation
  const populatedTx = await tokenContract.populateTransaction.transfer(toAddress, tokenAmount);
  const gasEstimate = await provider.estimateGas({
    ...populatedTx,
    from: wallet.address
  });

  // Add buffer (10-20%) to gas estimate rather than using raw estimate
  const gasLimit = gasEstimate.mul(110).div(100); // 10% buffer

  const tx = {
    ...populatedTx,
    gasLimit,
    maxFeePerGas: baseFeePerGas.add(maxPriorityFeePerGas),
    maxPriorityFeePerGas,
    type: 2,
  };

  // Send transaction with more accurate fees
  const txResponse = await wallet.sendTransaction(tx);
  const receipt = await txResponse.wait();

  return receipt.transactionHash;
}
async function withdrawNativeSOL({ walletPrivateKey, toAddress, amount }) {
  const connection = new solanaWeb3.Connection(process.env.SOLANA_URL, "confirmed");

  try {
    const fromKeypair = solanaWeb3.Keypair.fromSecretKey(walletPrivateKey);
    const toPubkey = new solanaWeb3.PublicKey(toAddress);

    const [balance, { blockhash, lastValidBlockHeight }, rentExemptMin] = await Promise.all([
      connection.getBalance(fromKeypair.publicKey),
      connection.getLatestBlockhash(),
      connection.getMinimumBalanceForRentExemption(0)
    ]);

    const amountLamports = Math.floor(parseFloat(amount) * solanaWeb3.LAMPORTS_PER_SOL);

    // Estimate network fee
    const dummyTx = new solanaWeb3.Transaction({
      blockhash,
      lastValidBlockHeight,
      feePayer: fromKeypair.publicKey
    }).add(
      solanaWeb3.SystemProgram.transfer({
        fromPubkey: fromKeypair.publicKey,
        toPubkey,
        lamports: 1
      })
    );
    const { value: feeEstimate } = await connection.getFeeForMessage(dummyTx.compileMessage());
    const fee = feeEstimate || 5000;

    let lamportsToSend;
    if (amountLamports > balance) {
      throw new Error(`Insufficient balance. Available: ${balance / solanaWeb3.LAMPORTS_PER_SOL} SOL`);
    }
    if (balance - amountLamports < rentExemptMin) {
      // Case 1: leftover would be less than rent min → send all minus fee
      lamportsToSend = balance - fee;
    } else {
      // Case 2: leftover would be rent-safe → send requested amount minus fee
      lamportsToSend = amountLamports - fee;
    }

    if (lamportsToSend <= 0) {
      throw new Error("Not enough SOL to cover fee.");
    }
    if (lamportsToSend > balance) {
      throw new Error(`Insufficient balance. Available: ${balance / solanaWeb3.LAMPORTS_PER_SOL} SOL`);
    }

    // Build & send transaction
    const transaction = new solanaWeb3.Transaction({
      blockhash,
      lastValidBlockHeight,
      feePayer: fromKeypair.publicKey
    }).add(
      solanaWeb3.SystemProgram.transfer({
        fromPubkey: fromKeypair.publicKey,
        toPubkey,
        lamports: lamportsToSend
      })
    );

    const signature = await solanaWeb3.sendAndConfirmTransaction(
      connection,
      transaction,
      [fromKeypair],
      { skipPreflight: false, commitment: "confirmed" }
    );

    return signature;

  } catch (error) {
    console.error("❌ Withdrawal failed:", error.message);
    if (error.logs) console.error("Transaction logs:", error.logs);
    throw error;
  }
}



async function withdrawTokenSOL({ walletPrivateKey, toAddress, amount, tokenAddress }) {
  // Connect to Solana
  const connection = new Connection(process.env.SOLANA_URL, "confirmed");

  // Load sender keypair from base64 private key
  const secretKey = Uint8Array.from(Buffer.from(walletPrivateKey, "base64"));
  const fromKeypair = Keypair.fromSecretKey(secretKey);

  const toPubkey = new PublicKey(toAddress);
  const tokenMint = new PublicKey(tokenAddress);

  // --- 1️⃣ Check SOL balance for fees/rent ---
  const solBalanceLamports = await connection.getBalance(fromKeypair.publicKey);
  const rentExemptionLamports = await connection.getMinimumBalanceForRentExemption(165); // typical ATA size
  const estimatedFeeLamports = 5000; // ~0.000005 SOL for transaction fee

  if (solBalanceLamports < rentExemptionLamports + estimatedFeeLamports) {
    throw new Error(
      `Not enough SOL for rent & fees. Need at least ${(rentExemptionLamports + estimatedFeeLamports) / solanaWeb3.LAMPORTS_PER_SOL} SOL`
    );
  }

  // --- 2️⃣ Get mint info (decimals) ---
  const mintInfo = await splToken.getMint(connection, tokenMint);
  const decimals = mintInfo.decimals;

  // --- 3️⃣ Get sender token account ---
  const fromTokenAccount = await splToken.getAssociatedTokenAddress(
    tokenMint,
    fromKeypair.publicKey
  );

  const fromTokenBalance = await connection.getTokenAccountBalance(fromTokenAccount);
  const availableAmount = BigInt(fromTokenBalance.value.amount);

  if (availableAmount === 0n) {
    throw new Error("Sender has no tokens to send");
  }

  // --- 4️⃣ Determine recipient token account ---
  const toTokenAccount = await splToken.getAssociatedTokenAddress(
    tokenMint,
    toPubkey
  );

  // Prepare transaction
  const transaction = new Transaction();

  // Create ATA for recipient if it doesn't exist
  const toAccountInfo = await connection.getAccountInfo(toTokenAccount);
  if (!toAccountInfo) {
    transaction.add(
      splToken.createAssociatedTokenAccountInstruction(
        fromKeypair.publicKey, // payer
        toTokenAccount,        // ATA to create
        toPubkey,              // owner of the ATA
        tokenMint              // token mint
      )
    );
  }

  // --- 5️⃣ Convert amount to raw units ---
  let rawAmount = BigInt(Math.round(parseFloat(amount) * 10 ** decimals));

  // Safety: if sending all tokens, leave 1 unit to avoid close errors
  if (rawAmount >= availableAmount) {
    rawAmount = availableAmount - 1n;
    if (rawAmount <= 0n) {
      throw new Error("Not enough tokens to send after safety adjustment");
    }
  }

  // --- 6️⃣ Add transfer instruction ---
  transaction.add(
    splToken.createTransferInstruction(
      fromTokenAccount,
      toTokenAccount,
      fromKeypair.publicKey,
      rawAmount,
      [],
      splToken.TOKEN_PROGRAM_ID
    )
  );

  // --- 7️⃣ Send & confirm ---
  const signature = await sendAndConfirmTransaction(connection, transaction, [
    fromKeypair,
  ]);

  console.log("Transaction Signature:", signature);
  return signature; // Can be tracked on Solscan
}




async function withdraw(params) {
  const { network, tokenAddress } = params;

  if (network === "BSC" || network === "POL") {
    if (!tokenAddress) {
      console.log(params)
      return withdrawNativeEVM(params);
    } else {
      return withdrawTokenEVM(params);
    }
  }

  if (network === "SOL") {
    if (!tokenAddress) {
      return withdrawNativeSOL(params);
    } else {
      return withdrawTokenSOL(params);
    }
  }

  throw new Error("Unsupported network");
}

module.exports = {
  withdraw,
  withdrawNativeEVM,
  withdrawTokenEVM,
  withdrawNativeSOL,
  withdrawTokenSOL,
};
