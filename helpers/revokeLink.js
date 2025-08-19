const { Api } = require("telegram");

const revokeLink = async (client, groupId) => {
  try {
    console.log("All expected participants have joined. Revoking link.");
    // Use the SAME GramJS client that created the link
    const exportedInvites = await client.invoke(
      new Api.messages.GetExportedChatInvites({
        peer: groupId,
        adminId: await client.getInputEntity("me"), // the creator account
        limit: 20,
      })
    );

    const activeInvite = exportedInvites.invites.find((i) => !i.revoked);
    if (activeInvite) {
      await client.invoke(
        new Api.messages.EditExportedChatInvite({
          peer: groupId,
          link: activeInvite.link,
          revoked: true,
        })
      );

      console.log("Link revoked successfully...🚫");
    } else {
      console.log("⚠️ No active invite found to revoke.");
    }
  } catch (error) {
    console.log("Error revoking link:\n", error);
  }
};

module.exports = revokeLink;
