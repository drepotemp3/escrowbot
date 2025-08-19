const { Schema, model } = require("mongoose");

// mongoose user schema
const userSchema = new Schema({
  chatId: { type: Number, unique: true },
  username: String,
});
const User = model("User", userSchema);
module.exports = User