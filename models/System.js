const { model, Schema } = require("mongoose");

const System = model(
  "System",
  new Schema({
    admin: { type: Boolean, default: true },
    admins: [Number],
    adminProfitWallets: {
      bsc: String,
      pol: String,
      sol: String,
    },
    gasFeeWallets: {
      BEP20: {
        address: { type: String},
        privateKey: { type: String },
      },
      POL: {
        address: { type: String},
        privateKey: { type: String },
      },
      SOL: {
        address: { type: String },
        privateKey: { type: String },
      },
    },
  })
);

module.exports = System;
