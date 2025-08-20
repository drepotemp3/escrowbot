const { model, Schema } = require("mongoose");

const groupSchema = new Schema({
  takingPartialAmount:{
    type:Boolean, default:false
  },
  partialAmount:Number,
  cancelled:{
    type:Boolean,
    default:false
  },
  cancelInvokerState:String, //Message upon which the cancel button was clicked
  canceller:String, //Second user to finalize cancellation
  confirm1Msg:Number,// seller fiat receipt confirmation - initial
  confirm2Msg:Number,//seller Fiat receipt confimation - final
  dealSummaryMsg:Number,//Message referencing the deal's summary
  sellerFiatPromptMsg:Number, //Message that the seller replies with their fiat details
  buyerAddressPromptMsg:Number,//Message that the buyer replies with their release address
  sellerAddressPromptMsg:Number,//Message that the seller replies with their release address

  networkSelectMsg: Number,//message where user clicks buttons to select network. This ref is stored to enable updating it eventually
  formFilled: { type: Boolean, default: false },
  feeCount: { type: Number, default: 2 },
  refundAmount: {
    type: Number,
    default: 0,
  },
  withdrawalAmount: Number,
  totalAmount: Number, //Amount + fees = expected deposit amount
  escrowFee: Number,
  typeOfPaymentReceived: String,
  escrowInitiatorMsg: {
    chatId: Number,
    messageId: Number,
  },
  calculateFeesMsg: {
    chatId: Number,
    messageId: Number,
  },
  escrowInviteMsg: {
    chatId: Number,
    messageId: Number,
  },
  requestDepositMsg: {
    chatId: Number,
    messageId: Number,
  },
  paymentInfoSet: {
    type: Boolean,
    default: false,
  },
  tokenInfoSet: {
    type: Boolean,
    default: false,
  },
  groupId: Number,
  waitingForDeposit: {
    type: Boolean,
    default: false,
  },
  inUse: { type: Boolean, default: true },
  currentDeal: {
    participants: {
      type: [{ role: String, username: String, userId: Number }],
    }, //{role:"Buyer"|"Seller",}
    token: String,
    network: String,
    cryptoAmount: Number,
    fiatAmount: Number,
    paymentMethod: String, //upi | bank transfer
    releaseAddress: String,
    refundAddress: String,
    fiatPaymentDetails:String,
    sellerConfirmed: { type: Boolean, default: false },
    buyerConfirmed: { type: Boolean, default: false },
  },
  wallets: {
    BEP20: {
      address: { type: String, required: true },
      privateKey: { type: String, required: true },
    },
    POL: {
      address: { type: String, required: true },
      privateKey: { type: String, required: true },
    },
    SOL: {
      address: { type: String, required: true },
      privateKey: { type: String, required: true },
    },
  },
  name: String,
  accessHash: String,
});
const Group = model("Group", groupSchema);
module.exports = Group;
