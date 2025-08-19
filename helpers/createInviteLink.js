const { Api } = require("telegram");

const createInviteLink = async (client, groupId) => {
  // 4. Create invite link
  const inputPeer = await client.getInputEntity(groupId);
  const invite = await client.invoke(
    new Api.messages.ExportChatInvite({
      peer: inputPeer,
      legacyRevokePermanent: true,
    })
  );

  return invite.link;
};

module.exports = createInviteLink