const deleteMessage = require("../helpers/deleteMessage");

const startEscrow = async (group, ctx, traders, restarted = false) => {
  const trader1 = traders[0];
  const trader2 = traders[1];
  try {
    if (!restarted) {
      //Delete initiator msg
      await deleteMessage(
        global.bot,
        group.escrowInitiatorMsg.chatId,
        group.escrowInitiatorMsg.messageId,
        "Escrow initiator"
      );
      //Delete invite msg
      await deleteMessage(
        global.bot,
        group.escrowInviteMsg.chatId,
        group.escrowInviteMsg.messageId,
        "Escrow Invite"
      );
    }

    const trader1Mention = `[${trader1.username}](tg://user?id=${trader1.userId})`;
    const trader2Mention = `[${trader2.username}](tg://user?id=${trader2.userId})`;

    const msg = `${trader1Mention} ${trader2Mention}
One of you need to fill the form given below to start the deal!

Use /exampleform to check out a filled example to guide you.

*Note:-* While specifying Amount [USDT/USDC] *include* Escrow Fees in it. Escrow Fees, which is *0.5%*, will be deducted before releasing the amount to the buyer.`;

    await ctx.reply(msg, { parse_mode: "Markdown" });
    const form = `
Seller :
Buyer :
Amount [USDT/USDC] :
Amount [INR] :
Payment Method :`;
    await ctx.reply(form);
  } catch (error) {
    console.log("Error in startEscrow() fn, :\n", error);
  }
};

module.exports = startEscrow;
