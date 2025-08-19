const { Api } = require("telegram/tl");

async function clearGroupMessages(client, group) {
  try {
    const inputChannel = new Api.InputChannel({
    channelId: BigInt(group.id),
    accessHash: BigInt(group.accessHash),
  });

  let offsetId = 0;
  let totalDeleted = 0;

  while (true) {
    const messages = await client.getMessages(inputChannel, { limit: 100, offsetId });
    if (!messages.length) break;

    const ids = messages.map((m) => m.id);
    offsetId = messages[messages.length - 1].id;

    await client.invoke(
      new Api.channels.DeleteMessages({
        channel: inputChannel,
        id: ids,
      })
    );

    totalDeleted += ids.length;
    console.log(`Deleted ${ids.length}, total: ${totalDeleted}`);
  }

  console.log(`✅ Finished cleaning group ${group.id}`);
  } catch (error) {
    console.log("Error clearing group>:\n",error)
  }
}

module.exports = clearGroupMessages;
