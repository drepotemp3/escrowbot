const { Api } = require('telegram/tl');
async function pinMessageInGroup(client, groupId, messageId, silent = false) {
  console.log(";lkjhgfghjk===========================================================!!!!!!!!!!!!!!!!!!!!!!!!!!!")
  try {
    const result = await client.invoke(
      new Api.messages.UpdatePinnedMessage({
        peer: Number(`${-100}${groupId}`), // Group ID or username
        id: messageId,
        silent: silent, // Pin without notification
        pmOneSide: false,
        unpin: false
      })
    );
    
    console.log('Message pinned in group successfully');
    return result;
  } catch (error) {
    console.error('Error pinning message in group:', error);
    throw error;
  }
}

module.exports = pinMessageInGroup