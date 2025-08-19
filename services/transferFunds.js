const { withdraw } = require("../transactions/withdraw");

const transferFunds = async (amount, coinInput, toAddress, key) => {
  console.log(amount, coinInput, toAddress, key)
  // const coinInput = "sol" // e.g. "usdt_pol

  try {
    // Parse coinInput into token symbol and network
    const parts = coinInput.split("_");
    let tokenSymbol, networkInput;

    if (parts.length === 2) {
      [tokenSymbol, networkInput] = parts;
    } else if (parts.length === 1) {
      tokenSymbol = null; // native coin
      networkInput = parts[0];
    } else {
      console("⚠️ Invalid coin format. Use <token>_<network> or <network>.");
    }

    // Normalize network input
    const networkMap = {
      bep20: "BSC",
      bnb: "BSC",
      pol: "POL",
      sol: "SOL",
    };

    networkInput = networkMap[networkInput];
    // Token map for contract addresses
    const tokenMap = {
      BSC: {
        USDT: process.env.USDT_BEP20,
        USDC: process.env.USDC_BEP20,
      },
      POL: {
        USDT: process.env.USDT_POL,
        USDC: process.env.USDC_POL,
      },
      SOL: {
        USDT: process.env.USDT_SOL,
        USDC: process.env.USDC_SOL,
      },
    };

    let tokenAddress = null;
    if (tokenSymbol) {
      const tokenKey = tokenSymbol.toUpperCase();
      tokenAddress = tokenMap[networkInput]?.[tokenKey];
    } else {
      //No token symbol passed, will withdraw native then🤣
    }

    // Get private key from wallet DB
    let privKey = null;
    if (networkInput === "SOL") {
      privKey = Uint8Array.from(Buffer.from(key, "hex"));
    } else {
      privKey = key;
    }

    // if (!privKey) {
    //     return bot.sendMessage(chatId, `⚠️ No private key found for ${networkInput}.`);
    // }

    // Optionally validate toAddress format here before proceeding

    console.log("⏳ Processing withdrawal...");
    const txHash = await withdraw({
      network: networkInput,
      walletPrivateKey: privKey,
      toAddress,
      amount,
      tokenAddress,
    });
    console.log(
      `✅ Transfer successful!\nTransaction hash/signature:\n${txHash}`
    );

    const explorerMap = {
      BEP20: "https://bscscan.com/tx/",
      BSC: "https://bscscan.com/tx/",
      POL: "https://polygonscan.com/tx/",
      SOL: "https://solscan.io/tx/",
    };
    const baseUrl = explorerMap[networkInput.toUpperCase()];
    return baseUrl + txHash;
  } catch (err) {
    console.error("Transfer error\n", err);
    return null;
    // bot.sendMessage(chatId, `⚠️ Withdrawal failed: ${err.message}`);
  }
};

module.exports = transferFunds;
