const mongoose = require('mongoose');

const WalletSchema = new mongoose.Schema({
  mnemonic: { type: String, required: true },
  BEP20: {
    address: String,
    privateKey: String,
  },
  POL: {
    address: String,
    privateKey: String,
  },
  SOL: {
    address: String,
    privateKey: String,
  },
  tokens: Object,
  version: { type: String, default: "1.0" },
});

module.exports = mongoose.model("Wallet", WalletSchema);
