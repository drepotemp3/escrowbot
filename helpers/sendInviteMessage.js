const Group = require("../models/Group");

function escapeMarkdownV2(text) {
  // Escape all special MarkdownV2 characters including periods
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

const sendInviteMessage = async (
  ctx,
  sellerUsername,
  buyerUsername,
  groupName,
  inviteLink,
  client,
  groupId,
  chatId,
  groupIdIncluded
) => {
  try {
    const sellerUser = await client.getEntity(sellerUsername);
    const buyerUser = await client.getEntity(buyerUsername);

    const sellerLink = `[${escapeMarkdownV2(
      "@" + sellerUser.username
    )}](tg://user?id=${sellerUser.id})`;
    const buyerLink = `[${escapeMarkdownV2(
      "@" + buyerUser.username
    )}](tg://user?id=${buyerUser.id})`;

    const safeGroupName = escapeMarkdownV2(groupName);
    const safeInviteLink = escapeMarkdownV2(inviteLink);

    const message =
      `${sellerLink} & ${buyerLink} are requested to join *${safeGroupName}*\\.` +
      ` Please use the following link to join the room\\.\\.\\.\n\n` +
      `${safeInviteLink}\n\n` +
      `⚠️ Scammers may invite you to some parallel fake escrow room\\. Always double check the correct one by using the above link\\. ` +
      `Please deposit USDT/USDC only when the bot prompts you to do so\\. Do not send anything in advance to avoid issues\\.`;

    const sentMessage = await ctx.reply(message, {
      reply_to_message_id: ctx.message.message_id,
      disable_web_page_preview: true,
      parse_mode: "MarkdownV2",
    });

    //Only save this msg when this function is invoked with a groupId
    if (groupIdIncluded) {
      //Store invite message for later deletion
      Group.findOneAndUpdate(
        { groupId },
        {
          escrowInviteMsg: {
            chatId,
            messageId: sentMessage.message_id,
          },
        }
      );
    }
    return sentMessage.message_id
  } catch (error) {
    console.error("Error sending invite message:", error);
    throw error; // Or handle it differently
  }
};

module.exports = sendInviteMessage;
