
async function deleteMessage(bot, chatId, messageId, messageType) {
  try {
    await bot.telegram.deleteMessage(chatId, messageId);
    console.log(`✅ ${messageType} Message deleted`);
    return true;
  } catch (err) {
    if (err.description?.includes("message to delete not found")) {
      console.log("⚠️ Message does not exist anymore.");
      return false;
    }
    console.error("❌ Delete failed:", err);
    return false;
  }
}


module.exports = deleteMessage