const allParticipantsHaveJoined = async (ctx, participants) => {
  const chatId = ctx.chat.id;

  for (const user of participants) {
    try {
      const member = await ctx.telegram.getChatMember(chatId, user.userId);
      console.log(user.username,",s status is ", member.status)
      if (member.status === "left" || member.status === "kicked") {
        return false; // user is not currently a member
      }
    } catch (error){
      console.log(error)
      return false; // if bot can't find user, treat as not joined
    }
  }

  return true; // all are members
};

module.exports = allParticipantsHaveJoined;
