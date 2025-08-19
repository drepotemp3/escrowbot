require("dotenv/config");
const { default: axios } = require("axios");
const Group = require("../models/Group");
const getLiveFee = require("../wallet/fees_calc");
const nativeFeeToUSD = require("./nativeFeeToUSD");
const getFeeInNative = require("./getFeeInNative");

const requestDeposit = async (group, ctx) => {
  const {
    participants,
    token,
    network,
    cryptoAmount,
  } = group.currentDeal;
  const wallets = group.wallets;


  const calculateFeesMsg = await ctx.reply(
    "Please wait...🟡"
  );

   const seller = participants.find(
      (e) => e.role == "Seller"
    );

  //Compute network fee
  const coin = `${token}_${network}`;
  let amount = parseFloat(cryptoAmount);
  let address,
    networkType,
    tokenType = null;
  if (coin.toLowerCase().endsWith("_bep20")) {
    address = wallets.BEP20.address;
    networkType = "BEP20";
  } else if (coin.toLowerCase().endsWith("_pol")) {
    address = wallets.POL.address;
    networkType = "POL";
  } else if (coin.toLowerCase().endsWith("_sol")) {
    address = wallets.SOL.address;
    networkType = "SOL";
  }

  // Detect if it's a token (like USDT_BEP20, USDT_POL, USDT_SOL)
  if (coin.startsWith("USDT") || coin.startsWith("USDC")) {
    tokenType = coin.startsWith("USDT") ? "USDT" : "USDC";
  }

       let feeInNative = await getFeeInNative(network.toUpperCase(), token);
        const feeInUsd = await nativeFeeToUSD(network, feeInNative * 2); //2x due to transfer to release + transfer to admin
        const totalDeposit = Number((
          Number(cryptoAmount.toFixed(3)) + Number(feeInUsd.toFixed(3))
        ).toFixed(3));

  const message = `
💴*Deposit Request*💵💰

🪙 Token: ${token.toUpperCase()}
💹 Network: ${network.toUpperCase()}
💰 *Total to Send*: ${totalDeposit} ${tokenType} 

📍 *Send to:*
\`${address}\` (Click to copy)

⚠️⚠️ If you send normal SOL, POL, BNB or any other native token, your funds will be lost and non-refundable!!
Only USDT and USDC *TOKENS* are accepted (*usdt/usdc* on sol, *usdt/usdc* on polygon, *usdt/usdc* on bsc) ⚠️⚠️ 

After deposit, [${seller.username}](tg://user?id=${
    seller.userId
  }) please click *I HAVE PAID*✅ below so i can check.
    `;
  const requestDepositMsgRef = ctx.reply(message, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "I HAVE PAID ✅",
            callback_data: "confirm-deposit",
          },
        ],
      ],
    },
  });

  //update group
  const updatedGroupInfo = await Group.findOneAndUpdate(
    { groupId: group.groupId },
    {
      $set: {
        calculateFeesMsg: {
          chatId: ctx.chat.id,
          messageId: calculateFeesMsg.message_id,
        },
        totalAmount:totalDeposit, //amount paid by seller
        waitingForDeposit: true,
        requestDepositMsg: {
          chatId: ctx.chat.id,
          messageId: requestDepositMsgRef.message_id,
        },
      },
    },
    { new: true }
  );

  //Update in cache
  let previousActiveEscrows = global.activeEscrows;
  previousActiveEscrows = previousActiveEscrows.filter(
    (e) => e.groupId !== group.groupId
  );
  const updatedActiveEscrows = [...previousActiveEscrows, updatedGroupInfo];
  global.activeEscrows = updatedActiveEscrows;
};

module.exports = requestDeposit;
