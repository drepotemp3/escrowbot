// const { default: axios } = require("axios");

// require("dotenv/config");

// const getFeeInNative = async (network) => {
//   console.log(network);
//   try {
//     if (network === "BEP20") {
//       const gasPriceRes = await axios.get(
//         "https://api.etherscan.io/v2/api?chainid=56",
//         {
//           params: {
//             module: "gastracker",
//             action: "gasoracle",
//             apikey: process.env.ETH_V2_API,
//           },
//         }
//       );

//       const gasPriceBNB = gasPriceRes.data.result.SafeGasPrice / 1e9;
//       const gasLimit = 65000;
//       const bep20Fee = gasPriceBNB * gasLimit;
//       return bep20Fee;
//     }

//     if (network === "POL") {
//       const gasPriceRes = await axios.get(
//         "https://gasstation.polygon.technology/v2"
//       );
//       const gasLimit = 65000;
//       const polGasFee = (gasPriceRes.data.standard.maxFee * gasLimit) / 1e9;
//       return polGasFee;
//     }

//     if (network === "SOL") {
//       return 0.004;
//     }
//   } catch (err) {
//     console.error(`Error fetching fee for ${network}`, err.message);
//   }
// };

// module.exports = getFeeInNative;

//chatgpt
// const { default: axios } = require("axios");
// require("dotenv/config");

// const getFeeInNative = async (network) => {
//   try {
//     if (network === "BEP20") {
//       const gasPriceRes = await axios.get(
//         "https://api.bscscan.com/api",
//         {
//           params: {
//             module: "gastracker",
//             action: "gasoracle",
//             apikey: process.env.ETH_V2_API, // use correct BSC key
//           },
//         }
//       );

//       const gasPriceGwei = Number(gasPriceRes.data.result.SafeGasPrice);
//       const gasLimit = 65000;
//       console.log((gasPriceGwei * 1e9 * gasLimit) / 1e18);
//       return (gasPriceGwei * 1e9 * gasLimit) / 1e18; // in BNB
//     }

//     if (network === "POL") {
//       const gasPriceRes = await axios.get("https://gasstation.polygon.technology/v2");
//       const gasPriceGwei = gasPriceRes.data.standard.maxFee;
//       const gasLimit = 65000;
//       return (gasPriceGwei * 1e9 * gasLimit) / 1e18; // in MATIC
//     }

//     if (network === "SOL") {
//       return 0.004; // better: query Solana RPC
//     }
//   } catch (err) {
//     console.error(`Error fetching fee for ${network}:`, err.message);
//   }
// };
const { default: axios } = require("axios");


/**
 * Gets BSC gas fee in BNB
 * @param {string} token - 'native', 'usdt', or 'usdc'
 * @returns {Promise<string>} Gas fee in BNB
 */
async function getBSCGasFee(token) {
    const gasLimits = { native: 21000, usdt: 65000, usdc: 65000 };
    
    let gasPrice = 5; // Default 5 Gwei - realistic for BSC
    
    try {
        const response = await axios.get('https://api.bscscan.com/api?module=gastracker&action=gasoracle', { timeout: 3000 });
        
        if (response.data?.result?.SafeGasPrice) {
            const apiGasPrice = parseFloat(response.data.result.SafeGasPrice);
            // Only use API value if it's realistic (between 1-50 Gwei)
            if (apiGasPrice >= 1 && apiGasPrice <= 50) {
                gasPrice = Math.max(apiGasPrice, 3); // Minimum 3 Gwei
            }
        }
    } catch (error) {
        // Use default 5 Gwei
    }
    
    const gasLimit = token? gasLimits[token.toLowerCase()] : gasLimits.native;
    const gasFee = gasPrice * gasLimit * 0.000000001 * 2; // 100% buffer for safety
    return gasFee.toFixed(8);
}

/**
 * Estimate Polygon gas fee in MATIC
 * @param {string|null} token - null for native MATIC, or "USDT"/"USDC"
 * @returns {Promise<string>} estimated fee in MATIC
 */
async function getPolygonFee(token = null) {
    let gasPriceGwei = 50; // Default 50 Gwei - realistic for Polygon
    
    try {
        const { data } = await axios.get("https://gasstation.polygon.technology/v2", { timeout: 3000 });
        
        if (data?.standard?.maxFee) {
            const apiGasPrice = data.standard.maxFee;
            // Only use API value if it's realistic (between 20-500 Gwei)
            if (apiGasPrice >= 20 && apiGasPrice <= 500) {
                gasPriceGwei = Math.max(apiGasPrice, 30); // Minimum 30 Gwei
            }
        }
    } catch (error) {
        // Use default 50 Gwei
    }
    
    const gasLimit = token ? 100000 : 21000;
    const feeMATIC = (gasPriceGwei * gasLimit) / 1e9;
    const bufferedFee = feeMATIC * 1.5; // 50% buffer
    
    return bufferedFee.toFixed(8);
}



//gemini


require("dotenv/config");

const getFeeInNative = async (coinType, tokenType = null) =>{
  try {
    if (coinType === "BEP20" || coinType === "BNB") {
       const bscGasFee = await getBSCGasFee(tokenType)
       return bscGasFee
    }

    if (coinType === "POL" || coinType === "MATIC") {
      const polygonFee = await getPolygonFee(tokenType)
      return polygonFee
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


module.exports = getFeeInNative;


