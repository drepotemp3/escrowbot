/**
 * Parses escrow form message and extracts values
 * @param {string} message - The message to parse
 * @returns {Object} - { isAFormMessage: boolean, isValid: boolean, data: Object|null }
 */
const isFormMessage = (message) => {
  if (!message) {
    return {
      isAFormMessage: false,
      isValid: false,
      data: null,
    };
  }
  // Remove any leading/trailing whitespace
  const cleanMessage = message?.trim();

  // Check if it contains any form fields (loose check)
  const hasFormFields =
    /(?:Seller\s*:|Buyer\s*:|Amount\s*(?:\[?(?:USDT|USDC|INR)\]?)?\s*:|Payment\s*Method\s*:)/i.test(
      cleanMessage
    );

  if (!hasFormFields) {
    return {
      isAFormMessage: false,
      isValid: false,
      data: null,
    };
  }

  // Regular expression to match the exact format (REQUIRES square brackets)
  const pattern =
    /^Seller\s*:\s*@(\w+)\s*\nBuyer\s*:\s*@(\w+)\s*\nAmount\s*\[(USDT|USDC)\]\s*:\s*(\d+(?:\.\d+)?)\s*\nAmount\s*\[INR\]\s*:\s*(\d+(?:\.\d+)?)\s*\nPayment\s*Method\s*:\s*(.+)$/;

  const match = cleanMessage.match(pattern);

  if (!match) {
    return {
      isAFormMessage: true, // It has form fields but wrong format
      isValid: false,
      data: null,
    };
  }

  // Extract values from regex groups
  const [, seller, buyer, cryptoType, cryptoAmount, inrAmount, paymentMethod] =
    match;

  return {
    isAFormMessage: true,
    isValid: true,
    data: {
      seller: `@${seller.toLowerCase()}`,
      buyer: `@${buyer.toLowerCase()}`,
      cryptoType: cryptoType, // 'USDT' or 'USDC'
      cryptoAmount: parseFloat(cryptoAmount),
      inrAmount: parseFloat(inrAmount),
      paymentMethod: paymentMethod.trim(),
    },
  };
};

module.exports = isFormMessage;
