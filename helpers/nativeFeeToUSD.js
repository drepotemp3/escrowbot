const { default: axios } = require("axios");

const nativeFeeToUSD = async (networkType, feeInNative) => {
  try {
    // Convert native coin fee to USD using CoinGecko
    const nativeIdMap = {
      BEP20: "binancecoin",
      POL: "matic-network",
      SOL: "solana",
    };
    const nativePriceRes = await axios.get(
      `https://api.coingecko.com/api/v3/simple/price?ids=${nativeIdMap[networkType]}&vs_currencies=usd`
    );
    const nativeToUsd = nativePriceRes.data[nativeIdMap[networkType]].usd;
    const feeInUsd = feeInNative * nativeToUsd;
    const feeInUsdRounded = Math.ceil(feeInUsd * 1e6) / 1e6; // numeric value
    return Number(feeInUsdRounded.toFixed(6));
  } catch (error) {
    console.log("Error computing fee in USD\n", error);
    return null;
  }
};

module.exports = nativeFeeToUSD