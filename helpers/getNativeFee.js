require("dotenv/config");

const { default: axios } = require("axios");

const getNativeFee = async (coinType, tokenType)=>{
      try {
    if (coinType === "BEP20" || coinType === "BNB") {
      const gasPriceRes = await axios.get("https://api.etherscan.io/v2/api?chainid=56", {
        params: {
          module: "gastracker",
          action: "gasoracle",
          apikey: process.env.ETH_V2_API
        }
      });

      const gasPriceBNB = gasPriceRes.data.result.SafeGasPrice / 1e9;

      // Tokens cost more gas than native transfers
      const gasLimit = tokenType ? 65000 : 21000; 
      return gasPriceBNB * gasLimit;
    }

    if (coinType === "POL" || coinType === "MATIC") {
      const gasPriceRes = await axios.get("https://gasstation.polygon.technology/v2");
      const gasLimit = tokenType ? 65000 : 21000; 
      return (gasPriceRes.data.standard.maxFee * gasLimit) / 1e9;
    }

    if (coinType === "SOL") {
      // Just return typical fees if estimation fails
      if (tokenType === "USDT" || tokenType === "USDC" || tokenType === "SPL") {
        return 0.00204; 
      }
      return 0.000005;
    }

    throw new Error("Unsupported coin type for fee calculation");
  } catch (err) {
    console.error(`Error fetching fee for ${coinType}-${tokenType || "native"}:`, err.message);
  }
}

module.exports = getNativeFee