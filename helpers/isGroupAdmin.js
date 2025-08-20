async function isGroupAdmin(ctx) {
  try {
    const chatMember = await ctx.telegram.getChatMember(
      ctx.chat.id,
      ctx.from.id
    );
    return (
      chatMember.status === "creator" || chatMember.status === "administrator"
    );
  } catch (error) {
    console.error("Error checking admin status:", error);
    return false;
  }
}

module.exports = isGroupAdmin;
