const isGroupMember = async (ctx, userId) => {
  try {
    const member = await ctx.telegram.getChatMember(ctx.chat.id, userId);
    const found = member.status !== "left" && member.status !== "kicked";
    return found;
  } catch (err) {
    return false
    console.log("Err checking members", err);
  }
};
module.exports = isGroupMember;
