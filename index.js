require("dotenv/config");
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const { Telegraf, Markup } = require("telegraf");
const Queue = require("queue-promise");
const connectDb = require("./db/connectDb");
const User = require("./models/User");
require("dotenv").config();
const fs = require("fs");
const { TelegramClient, Api } = require("telegram");
const { StringSession } = require("telegram/sessions");
const input = require("input"); // for prompting in terminal
const { message } = require("telegraf/filters");
const checkParticipantEligibity = require("./helpers/checkParticipantEligibity");
const Group = require("./models/Group");
const createInviteLink = require("./helpers/createInviteLink");
const sendInviteMessage = require("./helpers/sendInviteMessage");
const createGroup = require("./services/createGroup");
const allParticipantsHaveJoined = require("./helpers/allParticipantsHaveJoined");
const startEscrow = require("./services/startEscrow");
const requestDeposit = require("./helpers/requestDeposit");
const findUserEscrow = require("./helpers/findUserEscrow");
const checkDeposit = require("./services/checkDeposit");
const System = require("./models/System");
const MultiChainWallet = require("./wallet/wallet_create");
const { checkSolBalance, checkEvmBalance } = require("./helpers/checkBalance");
const getLiveFee = require("./wallet/fees_calc");
const getFeeInNative = require("./helpers/getFeeInNative");
const nativeFeeToUSD = require("./helpers/nativeFeeToUSD");
const transferFunds = require("./services/transferFunds");
const clearGroupMessages = require("./helpers/clearGroupMessages");
const revokeLink = require("./helpers/revokeLink");
const isFormMessage = require("./helpers/isFormMessage");
const isGroupMember = require("./helpers/isGroupMember");
const updateCache = require("./helpers/updateCache");
const pinMessageInGroup = require("./helpers/pinMessage");

const bot = new Telegraf(process.env.BOT_TOKEN);

global.bot = bot;
global.activeEscrows = [];

const app = express();

// throttle queue: up to 25 messages/sec → interval ≈ 40 ms, concurrency 1
const msgQueue = new Queue({ concurrent: 1, interval: 40 });

//system schema

// utility to enqueue send/edit
function sendWrapped(fn) {
  msgQueue.enqueue(() => fn().catch(console.error));
}

// middleware: ensure channel membership
async function requireJoin(ctx, next) {
  try {
    const member = await ctx.telegram.getChatMember(
      global.channel,
      ctx.from.id
    );
    const okStatuses = ["member", "creator", "administrator"];

    if (!okStatuses.includes(member.status)) {
      await ctx.reply(
        `Please join the channel to use this bot.\n\nلطفاً برای استفاده از ربات، به کانال بپیوندید:\n${global.channel}`
      );
      return;
    }
  } catch (err) {
    console.error(err);
    await ctx.reply(
      "Error verifying membership. Try again later.\n\nخطا در بررسی عضویت. لطفاً بعداً دوباره امتحان کنید."
    );
    return;
  }

  return next();
}

bot.start(async (ctx) => {
  const { id: chatId, username } = ctx.from;
  let user = await User.findOne({ chatId });

  if (!user) {
    await User.create({ chatId, username });
  }

  ctx.reply("Welcome");
});

const apiId = parseInt(process.env.API_ID);
const apiHash = process.env.API_HASH;
const sessionString = process.env.SESSION_STRING || ""; // For user accounts

const session = new StringSession(sessionString);
const client = new TelegramClient(session, apiId, apiHash, {
  connectionRetries: 5,
});
global.client = client;

// Admin and allowed users configuration
const ADMINS = ["@endurenow", "@jsornothing", "@escrowfatherthe"]; // Replace with actual admin usernames
const BOT_USERNAME = "@escrow_tg_official_bot"; // Replace with your bot's username
const ALLOWED_USERS = ["@xdfrozennn"]; // Users allowed to join via link

// (async () => {
//   await client.connect();
// })();

// async function handleUpdate(update) {
//   if (update instanceof Api.UpdateChatParticipants) {
//     const participants = update.participants;

//     // Only process our target group
//     if (groupId && participants.chatId.toString() !== groupId) return;

//     for (const participant of participants.newParticipants || []) {
//       try {
//         const user = await client.getEntity(participant.userId);
//         const username = user.username
//           ? `@${user.username}`
//           : user.id.toString();

//         // Check if user is allowed
//         if (!ALLOWED_USERS.includes(username)) {
//           console.log(`Removing unauthorized user: ${username}`);
//           await removeUser(groupId, user);
//           continue;
//         }

//         // Track allowed users
//         if (!joinedUsers.has(username)) {
//           joinedUsers.add(username);
//           console.log(`Allowed user joined: ${username}`);

//           // Check if all allowed users have joined
//           if (joinedUsers.size === ALLOWED_USERS.length) {
//             await revokeLinkAndScheduleCleanup();
//           }
//         }
//       } catch (error) {
//         console.error("Error processing participant:", error);
//       }
//     }
//   }
// }

// Add this after client.connect()

async function revokeLinkAndScheduleCleanup() {
  // try {
  //   const botChatId = `-100${groupId.toString()}`;
  //   console.log("All allowed users have joined - revoking link...");
  //   // 1️⃣ Revoke old link
  //   await bot.telegram.revokeChatInviteLink(botChatId, groupLink);

  //   // 2️⃣ Create new link
  //   const newLink = await bot.telegram.createChatInviteLink(botChatId, {
  //     expire_date: Math.floor(Date.now() / 1000) + 86400, // 1 day expiry
  //     member_limit: 8, // optional: limit members
  //   });

  //   console.log(`✅ Old link revoked!\n🔗 New link: ${newLink.invite_link}`);
  //   // Schedule cleanup after 10 minutes
  //   setTimeout(async () => {
  //     try {
  //       console.log("Executing scheduled cleanup...");
  //       await removeAllowedUsers();
  //       ALLOWED_USERS.length = 0; // Empty the array
  //       console.log(
  //         "Cleanup complete. Allowed users removed and array cleared."
  //       );
  //     } catch (error) {
  //       console.error("Cleanup error:", error);
  //     }
  //   }, 10 * 60 * 1000); // 10 minutes
  // } catch (error) {
  //   console.error("Error revoking link:", error);
  // }

  try {
    // 1️⃣ Get all active invite links for the group
    const invites = await client.invoke(
      new Api.messages.GetExportedChatInvites({
        peer: groupId,
        adminId: await client.getMe(),
        limit: 50,
      })
    );

    // 2️⃣ Revoke all existing active links
    for (const invite of invites.invites) {
      try {
        await client.invoke(
          new Api.messages.DeleteExportedChatInvite({
            peer: groupId,
            link: invite.link,
          })
        );
      } catch (err) {
        console.warn(`Failed to delete invite ${invite.link}: ${err.message}`);
      }
    }

    // 3️⃣ Create a brand new invite link
    const newInvite = await client.invoke(
      new Api.messages.ExportChatInvite({
        peer: groupId,
        expireDate: 0, // 0 = never expire
        usageLimit: 0, // 0 = unlimited uses
        legacyRevokePermanent: true,
      })
    );

    console.log("✅ New invite link created:", newInvite.link);
    return newInvite.link;
  } catch (error) {
    console.error("❌ Failed to revoke/regenerate links:", error);
  }
}

async function removeAllowedUsers() {
  if (!client.connected) {
    await client.connect();
    console.log("Reconnected successfully");
  }
  try {
    // Get current participants
    const participants = await client.invoke(
      new Api.channels.GetParticipants({
        channel: groupId,
        filter: new Api.ChannelParticipantsRecent(),
        limit: 100,
      })
    );

    // Remove each allowed user
    for (const user of participants.users) {
      const username = user.username ? `@${user.username}` : user.id.toString();
      if (ALLOWED_USERS.includes(username)) {
        await removeUser(groupId, user);
        console.log(`Removed user: ${username}`);
      }
    }

    await client.disconnect();
  } catch (error) {
    console.error("Error removing users:", error);
  }
}

async function removeUser(groupId, user) {
  if (!client.connected) {
    await client.connect();
    console.log("Reconnected successfully");
  }
  await client.invoke(
    new Api.channels.EditBanned({
      channel: groupId,
      participant: user,
      bannedRights: new Api.ChatBannedRights({
        viewMessages: false, // Important: false means remove but don't ban
        untilDate: 0,
      }),
    })
  );
  await client.disconnect();
}

bot.command("escrow", async (ctx) => {
  const chat = ctx.chat;
  // 1️⃣ Ensure command is run in a group
  if (chat.type !== "group" && chat.type !== "supergroup") {
    return ctx.reply("❌ This command can only be used in a group chat.", {
      reply_to_message_id: ctx.message.message_id,
    });
  }

  const chatId = ctx.chat.id;
  const messageId = ctx.message.message_id;
  //Store this message for deletion later
  const escrowInitiatorMsg = {
    chatId,
    messageId,
  };

  let sellerUsername = ctx.from.username;

  if (!sellerUsername) {
    return ctx.reply("❌ Please set a username to use escrow", {
      reply_to_message_id: ctx.message.message_id,
    });
  }

  // 2️⃣ Get username argument
  const args = ctx.message.text.trim().split(" ").slice(1);
  let buyerUsername = args[0]?.replace(/^@/, ""); // remove @ if present

  if (!buyerUsername) {
    return ctx.reply(
      "⚠️ Please provide a username. Example: /escrow @username",
      {
        reply_to_message_id: ctx.message.message_id,
      }
    );
  }

  try {
    // 3️⃣ Try to find user in group
    const admins = await ctx.telegram.getChatAdministrators(chat.id);
    let found = false;

    // Check admins first
    found = admins.some(
      (admin) =>
        admin.user.username?.toLowerCase() === buyerUsername.toLowerCase()
    );

    const buyerUser = await client.getEntity(buyerUsername);
    // If not found in admins, try getChatMember for regular members
    if (!found) {
      console.log("Checking members");
      try {
        const member = await ctx.telegram.getChatMember(chat.id, buyerUser.id);
        found = member.status !== "left" && member.status !== "kicked";
      } catch (err) {
        console.log("Err checking members", err);
        // Will throw if user not found
        found = false;
      }
    }

    // 4️⃣ Reply appropriately
    if (found) {
      sellerUsername = `@` + sellerUsername.toLowerCase();
      buyerUsername = `@` + buyerUsername.toLowerCase();

      const groupsExist = await Group.find();
      //If at least a group exists, check for free groups
      if (groupsExist.length > 0) {
        //Check if they have pending escrows
        const usernames = [sellerUsername, buyerUsername];
        const checkResult = await checkParticipantEligibity(usernames, client);

        //Reply and reject escrow request
        if (checkResult.inAGroup) {
          return await ctx.reply(checkResult.message, {
            reply_to_message_id: ctx.message.message_id,
            parse_mode: "Markdown",
          });
        }

        //Look for an empty group
        const emptyGroups = await Group.find({
          inUse: false,
          "currentDeal.participants": { $size: 0 },
        });

        if (emptyGroups.length == 0) {
          //No empty groups, proceed with new group creation

          createGroup(
            [sellerUsername, buyerUsername],
            client,
            ctx,
            escrowInitiatorMsg
          );
        } else {
          //Empty groups exist, invite users to the first one
          const groupToUse = emptyGroups[0];

          //Setup group
          await groupToUse.updateOne({
            escrowInitiatorMsg,
            inUse: true,
            currentDeal: {
              participants: [
                { role: "Seller", username: sellerUsername },
                { role: "Buyer", username: buyerUsername },
              ],
            },
          });

          //Create invite link
          const link = await createInviteLink(client, groupToUse.groupId);

          sendInviteMessage(
            ctx,
            sellerUsername,
            buyerUsername,
            groupToUse.name,
            link,
            client,
            groupToUse.id,
            chatId,
            true // Indicate that groupId was included, so that it saves the invite msg to db instantly
          );
        }
      } else {
        //Since no groups have been created, just create one
        createGroup(
          [sellerUsername, buyerUsername],
          client,
          ctx,
          escrowInitiatorMsg
        );
      }
    } else {
      ctx.reply(
        `❌ @${buyerUsername} is NOT a member of this group. They must be in this group to use escrow.`,
        {
          reply_to_message_id: ctx.message.message_id,
        }
      );
    }
  } catch (err) {
    console.error("Error checking member:", err);
    // await ctx.reply("⚠️ Could not verify member status.", {
    //   reply_to_message_id: ctx.message.message_id,
    // });
  }
});

bot.action("confirm-deposit", async (ctx) => {
  await ctx.answerCbQuery();
  try {
    const username = ctx.from.username;

    if (!username) {
      return ctx.reply("❌ You must set a username to use that command.");
    }

    //check if they have an active escrow session
    const userEscrowGroup = findUserEscrow("@" + username);
    if (!userEscrowGroup) {
      return ctx.reply("❌ Network error. Please try again.");
    }

    //check if the right party sent that command (seller only)
    const seller = userEscrowGroup.currentDeal.participants.find(
      (e) => e.role == "Seller"
    );
    const buyer = userEscrowGroup.currentDeal.participants.find(
      (e) => e.role == "Buyer"
    );
    const invokerUsername = "@" + ctx.from.username;
    if (seller.username.toLowerCase() !== invokerUsername.toLowerCase()) {
      return ctx.reply(
        `❌ You can't use that command.\nOnly [${seller.username}](tg://user?id=${seller.userId}) can confirm deposits.`,
        {
          parse_mode: "Markdown",
        }
      );
    }

    const { network, token, cryptoAmount } = userEscrowGroup.currentDeal;
    if (!userEscrowGroup.waitingForDeposit) {
      return await ctx.reply("Already confirmed deposit. Proceed.");
    }

    await ctx.reply("🔍 I will confirm in the next 5 secs...");

    const { wallets } = userEscrowGroup;
    const deposit = {
      native: null,
      usdt: null,
      usdc: null,
    };
    setTimeout(() => {
      const confirmBalances = async () => {
        if (network == "pol") {
          const polBalances = await checkEvmBalance(
            "pol",
            wallets["POL"].address
          );
          deposit["native"] = polBalances.native;
          deposit["usdc"] = polBalances.usdc;
          deposit["usdt"] = polBalances.usdt;
        } else if (network == "sol") {
          const solBalances = await checkSolBalance(wallets["SOL"].address);
          deposit["native"] = solBalances.native;
          deposit["usdc"] = solBalances.usdc;
          deposit["usdt"] = solBalances.usdt;
        } else {
          const bscBalances = await checkEvmBalance(
            "bsc",
            wallets["BEP20"].address
          );
          console.log(bscBalances);
          deposit["native"] = bscBalances.native;
          deposit["usdc"] = bscBalances.usdc;
          deposit["usdt"] = bscBalances.usdt;
        }

        console.log("fetched deposits", deposit);

        //Reject native deposits
        if (!deposit.usdc && !deposit.usdt)
          return await ctx.reply(
            "No deposit found🔍\nIf you deposited actual Sol, Pol or Bnb, your funds are lost and non-refundable."
          );

        //Confirm deposit
        let msg = ``;
        if (deposit.usdt) {
          msg += `Deposit of $${deposit.usdt} ${token.toUpperCase()} on ${
            network.toLowerCase() == "bep20" ? "BSC" : network.toUpperCase()
          } confirmed✅`;
        } else if (deposit.usdc) {
          msg += `Deposit of $${deposit.usdc} ${token.toUpperCase()} on ${
            network.toLowerCase() == "bep20" ? "BSC" : network.toUpperCase()
          } confirmed✅`;
        }

        //Check deposit equality
        const expectedAmount = userEscrowGroup.totalAmount;
        const amountDeposited = deposit.usdc ? deposit.usdc : deposit.usdt;

        //If they sent greater amounts
        if (amountDeposited > expectedAmount) {
          //check if the excess is over $1
          const excess = amountDeposited - expectedAmount > 1;
          //Delete invoker msg
          await ctx.deleteMessage();

          const refundAmount = amountDeposited - expectedAmount;

          //Calculate tx fee for refund
          let feeInNative = await getFeeInNative(network.toUpperCase(), token);
          const feeInUsd = await nativeFeeToUSD(
            network.toUpperCase(),
            feeInNative
          ); //1x of fees to cover buyer refund
          const buyerNetworkFeeInUSD = excess ? feeInUsd : 0; //Charge buyer network fees if seller needs a refund
          const escrowFee = Number(((0.5 / 100) * cryptoAmount).toFixed(3));
          const buyerPayment = Number(
            (cryptoAmount - (escrowFee + buyerNetworkFeeInUSD)).toFixed(3)
          ); //Deduct refund fee from buyer's payment

          msg += `\n${excess ? `Expected amount: *${expectedAmount} USD*` : ""}
Amount Deposited: *${amountDeposited} USD*
Escrow Fee(0.5%): -*${escrowFee} USD*
${excess ? `Refund Amount: *${refundAmount} USD*` : ""}
${excess ? `Refund fee: -*${feeInUsd} USD*` : ""}

Hey [${buyer.username}](tg://user?id=${
            buyer.userId
          }), you will receive: *$${buyerPayment}* USD

Please send the fiat equivalent of $${cryptoAmount} to ${seller.username} 👇

*Payment Method:* ${userEscrowGroup.currentDeal.paymentMethod}
*Payment Details:* ${userEscrowGroup.currentDeal.fiatPaymentDetails}

After sending fiat, please confirm payment`;
          await ctx.reply(msg, {
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "Fiat Paid✅",
                    callback_data: "confirm-fiat",
                  },
                ],
              ],
            },
          });

          //Update group record with changed parameters
          const updatedGroupInfo = await Group.findOneAndUpdate(
            { groupId: userEscrowGroup.groupId },
            {
              $set: {
                refundAmount: excess ? refundAmount : 0,
                waitingForDeposit: false,
                feeCount: excess ? 3 : 2,
                withdrawalAmount: buyerPayment,
                typeOfPaymentReceived: deposit.native ? "native" : "token",
              },
            },
            { new: true }
          );
          //Update in cache
          let previousActiveEscrows = global.activeEscrows;
          previousActiveEscrows = previousActiveEscrows.filter(
            (e) => e.groupId !== userEscrowGroup.groupId
          );
          const updatedActiveEscrows = [
            ...previousActiveEscrows,
            updatedGroupInfo,
          ];
          global.activeEscrows = updatedActiveEscrows;
          console.log("updated", updatedActiveEscrows);
          console.log(
            "\n==========================\nGlobal\n",
            global.activeEscrows
          );
          return;
        }

        //If they send lesser amounts

        if (
          amountDeposited < expectedAmount &&
          expectedAmount - amountDeposited > 0.5
        ) {
          return await ctx.reply(
            `[${seller.username}](tg://user?id=${
              seller.userId
            }) you sent *$${amountDeposited}* out of *$${expectedAmount}*.
Send $${(expectedAmount - amountDeposited).toFixed(2)} more to continue.
After topup, click *Confirm*✅ above so i can check`,
            {
              parse_mode: "Markdown",
            }
          );
        }

        //If they paid the exact amount
        if (amountDeposited == expectedAmount) {
          //Delete invoker msg
          await ctx.deleteMessage();

          const escrowFee = Number(((0.5 / 100) * cryptoAmount).toFixed(3));
          const buyerPayment = Number((cryptoAmount - escrowFee).toFixed(3));

          msg += `\n
Amount Deposited: *${amountDeposited} USD*
Escrow Fee(0.5%): -*${escrowFee} USD*

Hey [${buyer.username}](tg://user?id=${buyer.userId}), you will receive: *$${buyerPayment}* USD

Please send the fiat equivalent of $${cryptoAmount} to ${seller.username} 👇

*Payment Method:* ${userEscrowGroup.currentDeal.paymentMethod}
*Payment Details:* ${userEscrowGroup.currentDeal.fiatPaymentDetails}

After sending fiat, please confirm payment`;
          await ctx.reply(msg, {
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "Fiat Paid✅",
                    callback_data: "confirm-fiat",
                  },
                ],
              ],
            },
          });

          //Update group record with changed parameters
          const updatedGroupInfo = await Group.findOneAndUpdate(
            { groupId: userEscrowGroup.groupId },
            {
              $set: {
                waitingForDeposit: false,
                feeCount: 2,
                withdrawalAmount: buyerPayment,
                typeOfPaymentReceived: deposit.native ? "native" : "token",
              },
            },
            { new: true }
          );
          //Update in cache
          updateCache(userEscrowGroup, updatedGroupInfo);
          return;
        }
      };
      confirmBalances();
    }, 1000 * 5);

    // console.log("Deposit check result", deposit);
  } catch (error) {
    console.log("Error in >confirm-deposit handler:\n", error);
  }
});

bot.action("confirm-fiat", async (ctx) => {
  try {
    const username = ctx.from.username;

    if (!username) {
      return ctx.reply("❌ You must set a username to use that command.");
    }

    //check if they have an active escrow session
    const userEscrowGroup = findUserEscrow("@" + username);
    if (!userEscrowGroup) {
      return ctx.reply("❌ Network error. Please try again.");
    }

    //check if the right party sent that command (buyer only)
    const seller = userEscrowGroup.currentDeal.participants.find(
      (e) => e.role == "Seller"
    );
    const buyer = userEscrowGroup.currentDeal.participants.find(
      (e) => e.role == "Buyer"
    );
    const invokerUsername = "@" + ctx.from.username;
    if (buyer.username.toLowerCase() !== invokerUsername.toLowerCase()) {
      return ctx.reply(
        `❌ You can't use that command.\nOnly [${buyer.username}](tg://user?id=${buyer.userId}) can confirm fiat payment.`,
        {
          parse_mode: "Markdown",
        }
      );
    }
    await ctx.deleteMessage();

    const sellerMention = `<a href="tg://user?id=${seller.userId}">${seller.username}</a>`;
    const confirm1Msg = await ctx.reply(
      `Hey ${sellerMention}, [Buyer] confirms they have paid fiat to you.

Please check your account to confirm fiat payment before releasing the crypto.

Please note that this process is irreversible.

<b>Release Crypto ONLY</b> if you are <b>SURE</b>`,
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "Release Crypto",
                callback_data: "fiat-received",
              },
            ],
          ],
        },
      }
    );

    //Update group record with changed parameters
    const updatedGroupInfo = await Group.findOneAndUpdate(
      { groupId: userEscrowGroup.groupId },
      {
        $set: {
          confirm1Msg: confirm1Msg.message_id,
        },
      },
      { new: true }
    );
    //Update in cache
    updateCache(userEscrowGroup, updatedGroupInfo);
  } catch (error) {
    console.log("Error in >fiat-paid handler:\n", error);
  }
});

bot.action("fiat-received", async (ctx) => {
  try {
    const username = ctx.from.username;

    if (!username) {
      return ctx.reply("❌ You must set a username to use that command.");
    }

    //check if they have an active escrow session
    const userEscrowGroup = findUserEscrow("@" + username);
    if (!userEscrowGroup) {
      console.log(userEscrowGroup);
      return ctx.reply("❌ Network error. Please try again.");
    }

    //check if the right party sent that command (buyer only)
    const seller = userEscrowGroup.currentDeal.participants.find(
      (e) => e.role == "Seller"
    );
    const buyer = userEscrowGroup.currentDeal.participants.find(
      (e) => e.role == "Buyer"
    );
    const invokerUsername = "@" + ctx.from.username;
    if (seller.username.toLowerCase() !== invokerUsername.toLowerCase()) {
      return ctx.reply(
        `❌ You can't use that command.\nOnly [${seller.username}](tg://user?id=${seller.userId}) can confirm fiat receipt.`,
        {
          parse_mode: "Markdown",
        }
      );
    }

    //Remove the buttons from confirm1Msg
    await ctx.telegram.editMessageReplyMarkup(
      ctx.chat.id,
      userEscrowGroup.confirm1Msg,
      undefined,
      {
        inline_keyboard: [],
      }
    );

    const confirm2Msg = await ctx.reply(
      `[${seller.username}](tg://user?id=${seller.userId}) are you really Really REALLY Sure???
*Your ${userEscrowGroup.currentDeal.token}* will be sent to ${buyer.username} and if you have not received your *INR*, then you are responsible for your LOSS!`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "Yes, I am Responsible!",
                callback_data: "i-am-responsible",
              },
            ],
          ],
        },
      }
    );

    //Update group record with changed parameters
    const updatedGroupInfo = await Group.findOneAndUpdate(
      { groupId: userEscrowGroup.groupId },
      {
        $set: {
          confirm2Msg: confirm2Msg.message_id,
        },
      },
      { new: true }
    );
    //Update in cache
    updateCache(userEscrowGroup, updatedGroupInfo);
  } catch (error) {
    console.log("Error in >fiat--received handler:\n", error);
  }
});

bot.action("i-am-responsible", async (ctx) => {
  try {
    const username = ctx.from.username;

    if (!username) {
      return ctx.reply("❌ You must set a username to use that command.");
    }

    //check if they have an active escrow session
    const userEscrowGroup = findUserEscrow("@" + username);
    if (!userEscrowGroup) {
      console.log(userEscrowGroup);
      return ctx.reply("❌ Network error. Please try again.");
    }

    //check if the right party sent that command (buyer only)
    const seller = userEscrowGroup.currentDeal.participants.find(
      (e) => e.role == "Seller"
    );
    const buyer = userEscrowGroup.currentDeal.participants.find(
      (e) => e.role == "Buyer"
    );
    const invokerUsername = "@" + ctx.from.username;
    if (seller.username.toLowerCase() !== invokerUsername.toLowerCase()) {
      return ctx.reply(
        `❌ You can't use that command.\nOnly [${seller.username}](tg://user?id=${seller.userId}) can confirm fiat receipt.`,
        {
          parse_mode: "Markdown",
        }
      );
    }

    //Remove the buttons from confirm2Msg
    const confirm2MsgUpdate = `${seller.username} are you really Really REALLY Sure???
*Your ${userEscrowGroup.currentDeal.token}* will be sent to ${buyer.username} and if you have not received your *INR*, then you are responsible for your LOSS!`;
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      userEscrowGroup.confirm2Msg,
      undefined,
      confirm2MsgUpdate,
      {
        parse_mode: "Markdown",
      }
    );

    //=============================BEGIN CRYPTO TRANSFER===============================================

    const { token, network, releaseAddress, refundAddress, cryptoAmount } =
      userEscrowGroup.currentDeal;
    const { withdrawalAmount, refundAmount, name } = userEscrowGroup;
    const groupName = name;
    const escrowFee = Number(((0.5 / 100) * cryptoAmount).toFixed(3));

    // await ctx.reply(`${seller.username} has confirmed fiat receipt.`);

    await ctx.reply("Please wait...🟡");
    //Process withdrawal
    //First transfer gas fees(native coin) from gas wallet to escrow address, according to fee count
    //1. Check fee count (fee multiplier count depending on number of transactions needed)
    const feeCount = userEscrowGroup.feeCount;
    //2. Calculate fees based on fee count
    let feeInNative = await getFeeInNative(network.toUpperCase(), token);
    feeInNative = feeCount * feeInNative; //This is enough for all transfers needed
    //3. Send fees to escrow address
    const escrowWalletAddress =
      userEscrowGroup.wallets[network.toUpperCase()].address;
    const escrowWalletPrivateKey =
      userEscrowGroup.wallets[network.toUpperCase()].privateKey;
    const gasWalletPrivateKey =
      global.systemData.gasFeeWallets[network.toUpperCase()].privateKey;
    console.log("Transfering native fees for ", groupName, "...");
    const feeTxRes = await transferFunds(
      feeInNative,
      network.toLowerCase(),
      escrowWalletAddress,
      gasWalletPrivateKey
    );

    if (feeTxRes) {
      //4. Transfer withdrawal amount to release address
      console.log(
        "Transfering withdrawal amount to ",
        groupName,
        "'s release address"
      );

      console.log(
        "params",
        withdrawalAmount,
        `${token}_${network}`.toLowerCase(),
        releaseAddress,
        escrowWalletPrivateKey
      );
      const releaseTxHash = await transferFunds(
        withdrawalAmount,
        `${token}_${network}`.toLowerCase(),
        releaseAddress,
        escrowWalletPrivateKey
      );
      if (releaseTxHash) {
        const sellerPureUsername = seller.username.split("@")[1];
        const buyerPureUsername = buyer.username.split("@")[1];
        const sellerMention = `<a href="tg://user?id=${seller.userId}">${sellerPureUsername} [Seller]</a>`;
        const buyerMention = `<a href="tg://user?id=${buyer.userId}">${buyerPureUsername} [Buyer]</a>`;
        const finalMsg = `
<b>Deal</b> FINISHED

${buyerMention} | ${sellerMention}

Withdrawal of <b>${withdrawalAmount.toFixed(3)} ${token}</b> Finished!

Tx Hash:
${releaseTxHash}

<b><i>We are thankful to you for using our escrow service</i></b>

Please use /clean before leaving the group.

<i>Have a Nice Day!</i>😊`;
        await ctx.replyWithHTML(finalMsg, {
          disable_web_page_preview: true,
        });
        // 5. Process refunds if any, from escrow wallet to refund address
        if (refundAmount > 0) {
          console.log(
            "Transfering refund amount to ",
            groupName,
            "'s refund address"
          );
          await ctx.reply(
            `Sending refund of ${refundAmount} ${token.toUpperCase()} to refund address 👇\n\n\`${refundAddress}\``,
            { parse_mode: "Markdown" }
          );
          const refundTxHash = await transferFunds(
            refundAmount,
            `${token}_${network}`.toLowerCase(),
            refundAddress,
            escrowWalletPrivateKey
          );
          if (refundTxHash) {
            await ctx.reply(`Refund successful✅\n\n${refundTxHash}`, {
              disable_web_page_preview: true,
            });
          } else {
            await ctx.reply(
              "Error refunding to refund address.\nPlease try again."
            );
          }
        }

        //6. Withdraw escrow fee + total gas fees consumed
        //First convert fee consumed to usd
        const feesConsumedInUsd = await nativeFeeToUSD(
          network.toUpperCase(),
          feeInNative
        );

        const adminProfits = escrowFee + feesConsumedInUsd;
        // const adminProfits = 0.005

        console.log("Admin profits", adminProfits);
        const adminWalletToReceiveProfits =
          global.systemData.gasFeeWallets[network.toUpperCase()].address;
        const adminProfitTxHash = await transferFunds(
          adminProfits,
          `${token}_${network}`.toLowerCase(),
          adminWalletToReceiveProfits,
          escrowWalletPrivateKey
        );
        for (const admin of global.systemData.admins) {
          if (adminProfitTxHash) {
            bot.telegram.sendMessage(
              admin,
              "✅✅New Payout💰🪙💴\n\n\nReceived escrow profits of *" +
                adminProfits.toFixed(3) +
                " " +
                token.toUpperCase() +
                "* from " +
                groupName +
                "\n\n" +
                adminProfitTxHash,
              { parse_mode: "Markdown", disable_web_page_preview: true }
            );
            console.log("Paid admin.\n", adminProfitTxHash);
          } else {
            bot.telegram.sendMessage(
              admin,
              `Error withdrawing admin escrow profits from ${groupName}
              \nPlease contact dev immediately.`
            );
          }
        }
      } else {
        await ctx.reply(
          "Error withdrawing to release address.\nPlease try again."
        );
      }
    } else {
      await ctx.reply(
        "An Error occured_(sending gas fees to escrow wallet)_\nPlease try again.",
        { parse_mode: "Markdown" }
      );
    }

    //Then transfer tokens from escrow address to release address
    //Then transfer escrow profit + network fee paid by seller to admin profit wallet
    //Then transfer refunds to refund wallet (for refunds)
  } catch (error) {
    console.log("Error in i-am-responsible handler:\n", error);
  }
});

bot.command("set_admin", async (ctx) => {
  try {
    const chat = ctx.chat;

    const userId = ctx.from.id;

    //Non admin uses it in a group or in a private chat
    if (
      (!global.systemData.admins.includes(userId) &&
        (chat.type == "group" || chat.type == "supergroup")) ||
      (!global.systemData.admins.includes(userId) &&
        (chat.type !== "group" || chat.type !== "supergroup"))
    ) {
      return ctx.reply("Haha you can't do that.", {
        reply_to_message_id: ctx.message.message_id,
      });
    }

    //Admin uses it in a group
    if (
      global.systemData.admins.includes(userId) &&
      (chat.type == "group" || chat.type == "supergroup")
    ) {
      return bot.telegram.sendMessage(
        userId,
        "Please use the /set\\_admin {admin-id} command in a private chat, here.",
        { parse_mode: "Markdown" }
      );
    }

    const text = ctx.message.text.trim();

    // Extract everything after the command
    // Split by space
    const parts = text.split(/\s+/);

    // parts[0] is the command, parts[1] is the new admin's id (if given)
    const newAdminId = parts[1];

    if (!newAdminId) {
      return ctx.reply(
        "Please provide the admin id.\nUse /set\\_admin {admin-id}",
        { parse_mode: "Markdown" }
      );
    }

    const updatedSystem = await System.findOneAndUpdate(
      {}, // assuming there's only one system document
      { $addToSet: { admins: newAdminId } }, // adds to array if not present
      { new: true, upsert: true } // return updated doc, create if not exists
    );
    global.systemData = updatedSystem;
    ctx.reply("Saved✅\nUser-", newAdminId, " is now an admin👍🏼");
  } catch (error) {
    console.log("Error in /set_admin handler:\n", error);
  }
});

bot.command("reset_gas_fee_wallets", async (ctx) => {
  try {
    const chat = ctx.chat;

    const userId = ctx.from.id;

    //Non admin uses it in a group or in a private chat
    if (
      (!global.systemData.admins.includes(userId) &&
        (chat.type == "group" || chat.type == "supergroup")) ||
      (!global.systemData.admins.includes(userId) &&
        (chat.type !== "group" || chat.type !== "supergroup"))
    ) {
      return ctx.reply("Lol😂", {
        reply_to_message_id: ctx.message.message_id,
      });
    }

    //Admin uses it in a group
    if (
      global.systemData.admins.includes(userId) &&
      (chat.type == "group" || chat.type == "supergroup")
    ) {
      return bot.telegram.sendMessage(
        userId,
        "Whatttt???😯\nPlease use the /reset\\_gas\\_fee\\_wallet command ONLY in a private chat, here!!",
        { parse_mode: "Markdown" }
      );
    }

    //Create wallets
    const walletCreator = new MultiChainWallet();
    const wallets = await walletCreator.generateWallets();
    const updatedSystem = await System.findOneAndUpdate(
      { admin: true },
      {
        $set: {
          gasFeeWallets: wallets,
        },
      },
      { new: true }
    );
    global.systemData = updatedSystem;
    await ctx.reply("Gas fee wallets reset✅");
    const lmsg = `💸New Wallets📝

Bsc = \`${wallets.BEP20.address}\`  

Sol = \`${wallets.SOL.address}\`  

Pol = \`${wallets.POL.address}\`  

Send native tokens here to topup gas fee wallets.
Use /check\\_gas\\_fee\\_wallet\\_balance to see balances`;

    ctx.reply(lmsg, { parse_mode: "Markdown" });
  } catch (error) {
    console.log("Error in /reset_gas_fee_wallets handler:\n", error);
  }
});

bot.command("gas_fee_wallets", async (ctx) => {
  try {
    const chat = ctx.chat;

    const userId = ctx.from.id;

    //Non admin uses it in a group or in a private chat
    if (
      (!global.systemData.admins.includes(userId) &&
        (chat.type == "group" || chat.type == "supergroup")) ||
      (!global.systemData.admins.includes(userId) &&
        (chat.type !== "group" || chat.type !== "supergroup"))
    ) {
      return ctx.reply("Lol😂", {
        reply_to_message_id: ctx.message.message_id,
      });
    }

    //Admin uses it in a group
    if (
      global.systemData.admins.includes(userId) &&
      (chat.type == "group" || chat.type == "supergroup")
    ) {
      return bot.telegram.sendMessage(
        userId,
        "Whatttt???😯\nPlease use the /gas\\_fee\\_wallet command ONLY in a private chat, here!!",
        { parse_mode: "Markdown" }
      );
    }

    await ctx.reply("Fetching wallets...🟡");

    //Fetch balances of gas fee wallets
    const solBalance = await checkSolBalance(
      global.systemData.gasFeeWallets["SOL"].address
    );
    const polBalance = await checkEvmBalance(
      "pol",
      global.systemData.gasFeeWallets["POL"].address
    );
    const bscBalance = await checkEvmBalance(
      "bsc",
      global.systemData.gasFeeWallets["BEP20"].address
    );

    const lmsg = `💸Gas Fee Wallets

Bsc Address: \`${global.systemData.gasFeeWallets.BEP20.address}\`
Balance: ${bscBalance.native ? bscBalance.native : "0"} BNB 

Sol Address: \`${global.systemData.gasFeeWallets.SOL.address}\`  
Balance: ${solBalance.native ? solBalance.native : "0"} SOL

Pol Address: \`${global.systemData.gasFeeWallets.POL.address}\` 
Balance: ${polBalance.native ? polBalance.native : "0"} POL

Deposit native tokens into these addresses to topup.`;

    ctx.reply(lmsg, { parse_mode: "Markdown" });
  } catch (error) {
    console.log("Error in /gas_fee_wallets handler:\n", error);
  }
});

bot.command("set_escrow_profit_wallets", async (ctx) => {
  try {
    const chat = ctx.chat;

    const userId = ctx.from.id;

    //Non admin uses it in a group or in a private chat
    if (
      (!global.systemData.admins.includes(userId) &&
        (chat.type == "group" || chat.type == "supergroup")) ||
      (!global.systemData.admins.includes(userId) &&
        (chat.type !== "group" || chat.type !== "supergroup"))
    ) {
      return ctx.reply("Lol😂", {
        reply_to_message_id: ctx.message.message_id,
      });
    }

    //Admin uses it in a group
    if (
      global.systemData.admins.includes(userId) &&
      (chat.type == "group" || chat.type == "supergroup")
    ) {
      return bot.telegram.sendMessage(
        userId,
        "Whatttt???😯\nPlease use the /set\\_escrow\\_profit\\_wallets command ONLY in a private chat, here!!",
        { parse_mode: "Markdown" }
      );
    }

    //Free to go
    global.takingProfitWallets = true;

    ctx.reply(`Send me the addresses using this format👇

Bsc = {wallet_address_here}

Sol = {wallet_address_here}

Pol = {wallet_address_here}`);
  } catch (error) {
    console.log("Error in /set_gas_fee_wallet_keys handler:\n", error);
  }
});

bot.command("clean", async (ctx) => {
  const username = ctx.from.username;
  let groupId = ctx.chat.id;
  groupId = Number(groupId.toString().split("-100")[1]);
  const groupIsForEscrow = global.activeEscrows.find(
    (e) => e.groupId == groupId
  );

  if (!groupIsForEscrow) {
    return await ctx.reply("Use /clean in escrow groups only"); //if they use in non-escrow groups or private chats
  }

  let userEscrowGroup = findUserEscrow("@" + username);
  if (userEscrowGroup) {
    if (userEscrowGroup.groupId !== groupId) {
      return await ctx.reply("Use /clean in escrow groups only"); //if they use in non-escrow groups
    }
  }

  await clearGroupMessages(client, {
    id: userEscrowGroup.groupId,
    accessHash: userEscrowGroup.accessHash,
  });
});

bot.command("exampleform", async (ctx) => {
  try {
    const username = ctx.from.username;
    let groupId = ctx.chat.id;
    groupId = Number(groupId.toString().split("-100")[1]);
    const groupIsForEscrow = global.activeEscrows.find(
      (e) => e.groupId == groupId
    );
    if (!groupIsForEscrow) {
      return; //if they use in non-escrow groups or private chats
    }

    let userEscrowGroup = findUserEscrow("@" + username); //if user has an active escrow session
    if (userEscrowGroup) {
      if (userEscrowGroup.groupId !== groupId) {
        return; //if they use in non-escrow groups
      }
    } else {
      return; //if they have no active escrow session
    }
    const form1 = `
Seller : @sellerUsername
Buyer : @buyerUsername
Amount [USDT] : 200
Amount [INR] : 800
Payment Method : UPI`;

    const form2 = `
Seller : @sellerUsername
Buyer : @buyerUsername
Amount [USDC] : 200
Amount [INR] : 800
Payment Method : UPI`;

    await ctx.reply("For USDT escrow, follow this example👇");
    await ctx.replyWithHTML(form1);
    await ctx.reply("For USDC escrow, follow this example👇");
    await ctx.replyWithHTML(form2);
  } catch (error) {
    console.log("Error in /exampleform handler", error);
  }
});

// Listen for any select network callback
bot.action(/^select-(.+)$/, async (ctx) => {
  const selectedNetwork = ctx.match[1]; // Extracts 'bsc', 'pol', or 'sol'

  try {
    await ctx.answerCbQuery();
    const username = ctx.from.username;
    if (!username)
      return await ctx.reply(
        "Someone clicked a button here.\nPlease set a username before using escrow bot."
      );

    const invoker = "@" + username;
    const userEscrowGroup = findUserEscrow(invoker);
    const { participants, token } = userEscrowGroup.currentDeal;
    console.log(
      "==============================\nThe main problem\n",
      userEscrowGroup
    );
    const seller = participants.find((e) => e.role == "Seller");
    const buyer = participants.find((e) => e.role == "Buyer");
    if (invoker.toLowerCase() !== seller.username.toLowerCase()) {
      return await ctx.reply(
        "Buyer tried to select network❌\nOnly Seller can select network."
      );
    }

    //Update network
    const updatedGroupInfo = await Group.findOneAndUpdate(
      { groupId: userEscrowGroup.groupId },
      {
        $set: {
          "currentDeal.network": selectedNetwork.toUpperCase(),
        },
      },
      { new: true }
    );
    //update cache
    updateCache(userEscrowGroup, updatedGroupInfo);
    console.log("======================\nnetwork set\n", updatedGroupInfo);

    //Update the message

    const sellerMention = `<a href="tg://user?id=${seller.userId}">${seller.username}</a>`;
    const buyerMention = `<a href="tg://user?id=${buyer.userId}">${buyer.username}</a>`;
    const cryptoType = userEscrowGroup.currentDeal.token;
    let updatedMessage =
      sellerMention +
      " has selected <b>" +
      selectedNetwork.toUpperCase() +
      "</b> as the deposit network for <b>" +
      cryptoType +
      ".</b>" +
      "\n\n🔷 <b>Note to Buyer</b> " +
      buyerMention +
      ": You will only be able to withdraw " +
      cryptoType +
      " on the network selected by the seller.";

    await ctx.telegram.editMessageReplyMarkup(
      ctx.chat.id,
      userEscrowGroup.networkSelectMsg,
      undefined,
      {
        inline_keyboard: [],
      }
    );

    const text = `${buyerMention} <b>[Buyer]</b>, please <b>QUOTE</b> this message and reply with your <b>${token} ${selectedNetwork.toUpperCase()}</b> address
Please be mindful that funds <b>cannot be recovered</b> if sent to the wrong network address.`;

    const buyerAddressPromptMsg = await ctx.replyWithHTML(text);

    //Update network
    const updatedGroup = await Group.findOneAndUpdate(
      { groupId: userEscrowGroup.groupId },
      {
        $set: {
          buyerAddressPromptMsg: buyerAddressPromptMsg.message_id,
        },
      },
      { new: true }
    );
    //update cache
    updateCache(userEscrowGroup, updatedGroup);
  } catch (error) {
    console.log("Error in select-network handler:\n", error);
  }
});

bot.on("chat_member", async (ctx) => {
  console.log("someone joined");
  const { new_chat_member, invite_link } = ctx.update.chat_member;
  if (new_chat_member.status === "member") {
    if (invite_link) {
      try {
        let groupId = ctx.chat.id;
        groupId = Number(groupId.toString().split("-100")[1]);

        //Process new member
        const member = new_chat_member.user;
        const newMemberUsername = "@" + member?.username;
        const newMemberId = member?.id;

        const ADMINS = ["@endurenow", "@jsornothing"];
        const BOT_USERNAME = "@escrow_tg_official_bot";
        const allowedUsers = [BOT_USERNAME];
        let expectedMembers = []; //full object of traders
        let thisGroup = null;
        let expectedParticipants = []; //username of traders

        //If the user that joined isn't an expected admin, check if they're an expected escrow participant
        if (!allowedUsers.includes(newMemberUsername.toLowerCase())) {
          console.log("Not an admin of course, so checking participants");
          thisGroup = await Group.findOne({ groupId });

          expectedMembers = thisGroup.currentDeal.participants;

          const allExpectedMembersUsernames = expectedMembers.map((e) =>
            e.username.toLowerCase()
          );
          expectedParticipants = allExpectedMembersUsernames; //Send this to outer scope
          const allExpectedMembersUserIds = expectedMembers.map(
            (e) => e.userId
          );

          if (
            !allExpectedMembersUsernames.includes(
              newMemberUsername.toLowerCase()
            ) ||
            !allExpectedMembersUserIds.includes(newMemberId)
          ) {
            //Kick them out
            console.log(
              `Removing unauthorized user: ${newMemberUsername} | ${newMemberId}`
            );
            await ctx.banChatMember(newMemberId);
            return await ctx.unbanChatMember(newMemberId); // Remove without ban
          } else {
            ctx.reply(
              `Hii, [${newMemberUsername}](tg://user?id=${newMemberId}), Welcome to the Escrow Group!\n\n\nPlease use /clean to free the group after the deal is completed.`,
              { parse_mode: "Markdown" }
            );
          }
          console.log("Checked partcipants, ", newMemberUsername, " passed");
        }

        console.log("Allowed user joined. ->", newMemberUsername);
        //Check if all expected users are now in the group
        const allHaveJoined = await allParticipantsHaveJoined(
          ctx,
          expectedMembers
        );
        if (allHaveJoined) {
          await revokeLink(client, groupId); //Revoke invite link

          //Begin escrow
          startEscrow(thisGroup, ctx, expectedMembers);
        } else {
          //If second person hasn't joined
          //If joiner has a username
          if (member?.username) {
            const joiner = "@" + member.username;
            const otherParty = expectedParticipants.filter(
              (e) => e.toLowerCase() !== joiner.toLowerCase()
            );
            await ctx.reply(`Waiting for ${otherParty} to join the group.`);
          }
          console.log("Waiting for more participants");
        }
      } catch (error) {
        console.error("Error processing new member:", error);
      }
    }
  }
});

bot.action(/^(seller|buyer)-deal-confirm$/, async (ctx) => {
  const userType = ctx.match[1]; // Extracts 'seller' or 'buyer'

  try {
    await ctx.answerCbQuery();
    const username = ctx.from.username;
    if (!username) {
      return await ctx.reply(
        "❌ Someone tried to confirm without having a username.\nSet a username to use escrowbot."
      );
    }
    const invoker = "@" + username.toLowerCase();
    const userEscrowGroup = findUserEscrow(invoker);
    const {
      participants,
      token,
      network,
      cryptoAmount,
      sellerConfirmed,
      fiatPaymentDetails,
      fiatAmount,
    } = userEscrowGroup.currentDeal;
    const seller = participants.find((e) => e.role == "Seller");
    const buyer = participants.find((e) => e.role == "Buyer");
    const sellerMention = `<a href="tg://user?id=${seller.userId}">${seller.username}</a>`;
    const buyerMention = `<a href="tg://user?id=${buyer.userId}">${buyer.username}</a>`;

    if (userType === "seller") {
      //If the seller button was clicked by the seller
      if (invoker == seller.username.toLowerCase()) {
        // Handle seller confirmation logic
        const updatedGroupInfo = await Group.findOneAndUpdate(
          { groupId: userEscrowGroup.groupId },
          {
            $set: {
              "currentDeal.sellerConfirmed": true,
            },
          }
        );
        //update cache
        updateCache(userEscrowGroup, updatedGroupInfo);
        //Update summary message

        //Calculate escrow fees (0.5%)
        const escrowFee = (0.5 / 100) * cryptoAmount;
        let feeInNative = await getFeeInNative(network.toUpperCase(), token);
        const feeInUSD = await nativeFeeToUSD(network, feeInNative * 2); //2x due to transfer to release + transfer to admin
        const totalDeposit = (
          Number(cryptoAmount.toFixed(3)) + Number(feeInUSD.toFixed(3))
        ).toFixed(3);

        const warning = `🚫 <b>IMPORTANT:</b> ${sellerMention}, <b>do <u>NOT</u></b> deposit any ${token}s to the addresses above.
You will receive a seperate <b>Escrow Deposit Address</b> after confirming the deal details.

🔷 <b>Note to Buyer (${buyerMention}):</b> You can only withdraw ${token} on the <b>${network}</b> network as selected by the seller.`;
        const buyerConfirmed = updatedGroupInfo.currentDeal.buyerConfirmed;
        //Send deal summary
        const text = `Both parties, please review the deal details below carefully and confirm if everything is correct.

▶️ <b>Buyer:</b> ${buyer.username} ${buyerConfirmed ? "✅" : ""}
▶️ <b>Seller:</b> ${seller.username} ✅
▶️ <b>Token:</b> ${token}
▶️ <b>Chain:</b> ${network}
▶️ <b>Network Fee:</b> ${feeInUSD.toFixed(3)} USD
▶️ <b>Amount[${token}]:</b> ${cryptoAmount}
▶️ <b>Amount[INR]:</b> ${fiatAmount}
▶️ <b>Payment Method:</b> ${userEscrowGroup.currentDeal.paymentMethod}
▶️ <b>Total Escrow Fees:</b> ${escrowFee.toFixed(3)} USD
▶️ <b>Release Address:</b> ${userEscrowGroup.currentDeal.releaseAddress}
▶️ <b>Refund Address:</b> ${userEscrowGroup.currentDeal.refundAddress}
▶️ <b>Payment Details:</b> ${fiatPaymentDetails}

===================================
▶️ <b>Total Cryto Deposit:</b> =  <b>Amount</b><i>(${cryptoAmount} USD)</i> + <b>Network fee</b><i>(${feeInUSD.toFixed(
          3
        )} USD)</i> = ${totalDeposit} USD
          
${
  buyerConfirmed
    ? `Both Confirmed!!`
    : `Seller Confirmed!! Waiting for Buyer's confirmation...\n\n${warning}`
}`;

        //if both have confirmed, return no buttons + proceed with deposit address provision
        if (updatedGroupInfo.currentDeal.buyerConfirmed) {
          //Send updated deal summary message with no buttons, then send deposit details
          await ctx.telegram.editMessageReplyMarkup(
            ctx.chat.id,
            userEscrowGroup.dealSummaryMsg,
            undefined,
            {
              inline_keyboard: [],
            }
          );
          //pin deal summary
          await pinMessageInGroup(
            client,
            updatedGroupInfo.groupId,
            updatedGroupInfo.dealSummaryMsg
          );
          //Send deposit address
          await requestDeposit(updatedGroupInfo, ctx);
        } else {
          //Otherwise wait for buyer confirmation
          await ctx.telegram.editMessageText(
            ctx.chat.id,
            userEscrowGroup.dealSummaryMsg,
            undefined,
            text,
            {
              parse_mode: "HTML", // or "HTML"
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: "Confirm [Buyer]",
                      callback_data: "buyer-deal-confirm",
                    },
                  ],
                ],
              },
            }
          );
        }
      }
    } else if (userType === "buyer") {
      //If the buyer button was clicked by the buyer
      if (invoker == buyer.username.toLowerCase()) {
        // Handle seller confirmation logic
        const updatedGroupInfo = await Group.findOneAndUpdate(
          { groupId: userEscrowGroup.groupId },
          {
            $set: {
              "currentDeal.buyerConfirmed": true,
            },
          }
        );
        //update cache
        updateCache(userEscrowGroup, updatedGroupInfo);
        //Update summary message

        //Calculate escrow fees (0.5%)
        const escrowFee = (0.5 / 100) * cryptoAmount;
        let feeInNative = await getFeeInNative(network.toUpperCase(), token);
        const feeInUSD = await nativeFeeToUSD(network, feeInNative * 2); //2x due to transfer to release + transfer to admin
        const totalDeposit = (
          Number(cryptoAmount.toFixed(3)) + Number(feeInUSD.toFixed(3))
        ).toFixed(3);

        const warning = `🚫 <b>IMPORTANT:</b> ${sellerMention}, <b>do <u>NOT</u></b> deposit any ${token}s to the addresses above.
You will receive a seperate <b>Escrow Deposit Address</b> after confirming the deal details.

🔷 <b>Note to Buyer (${buyerMention}):</b> You can only withdraw ${token} on the <b>${network}</b> network as selected by the seller.`;
        const sellerConfirmed = updatedGroupInfo.currentDeal.sellerConfirmed;
        //Send deal summary
        const text = `Both parties, please review the deal details below carefully and confirm if everything is correct.

▶️ <b>Buyer:</b> ${buyer.username} ✅
▶️ <b>Seller:</b> ${seller.username} ${sellerConfirmed ? "✅" : ""}
▶️ <b>Token:</b> ${token}
▶️ <b>Chain:</b> ${network}
▶️ <b>Network Fee:</b> ${feeInUSD.toFixed(3)} USD
▶️ <b>Amount[${token}]:</b> ${cryptoAmount}
▶️ <b>Amount[INR]:</b> ${fiatAmount}
▶️ <b>Payment Method:</b> ${userEscrowGroup.currentDeal.paymentMethod}
▶️ <b>Total Escrow Fees:</b> ${escrowFee.toFixed(3)} USD
▶️ <b>Release Address:</b> ${userEscrowGroup.currentDeal.releaseAddress}
▶️ <b>Refund Address:</b> ${userEscrowGroup.currentDeal.refundAddress}
▶️ <b>Payment Details:</b> ${fiatPaymentDetails}

===================================
▶️ <b>Total Cryto Deposit:</b> =  <b>Amount</b><i>(${cryptoAmount} USD)</i> + <b>Network fee</b><i>(${feeInUSD.toFixed(
          3
        )} USD)</i> = ${totalDeposit} USD
          
${
  sellerConfirmed
    ? `Both Confirmed!!`
    : `Buyer Confirmed!! Waiting for Seller's confirmation...\n\n${warning}`
}`;

        //if both have confirmed, return no buttons + proceed with deposit address provision
        if (updatedGroupInfo.currentDeal.sellerConfirmed) {
          //Send updated deal summary message with no buttons, then send deposit details
          await ctx.telegram.editMessageReplyMarkup(
            ctx.chat.id,
            userEscrowGroup.dealSummaryMsg,
            undefined,
            {
              inline_keyboard: [],
            }
          );
          //Pin Deal summary
          await pinMessageInGroup(
            client,
            updatedGroupInfo.groupId,
            updatedGroupInfo.dealSummaryMsg
          );
          //send deposit details
          await requestDeposit(updatedGroupInfo, ctx);
        } else {
          //Otherwise wait for seller confirmation
          await ctx.telegram.editMessageText(
            ctx.chat.id,
            userEscrowGroup.dealSummaryMsg,
            undefined,
            text,
            {
              parse_mode: "HTML", // or "HTML"
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: "Confirm [Seller]",
                      callback_data: "seller-deal-confirm",
                    },
                  ],
                ],
              },
            }
          );
        }
      }
    }
  } catch (error) {
    console.log("Error in deal-confirm handler:\n", error);
  }

  console.log(`${userType} confirmed the deal`);
});

bot.command("cancel", async (ctx) => {
  try {
    const username = ctx.from.username;
    let groupId = ctx.chat.id;
    groupId = Number(groupId.toString().split("-100")[1]);
    const groupIsForEscrow = global.activeEscrows.find(
      (e) => e.groupId == groupId
    );

    if (!groupIsForEscrow) {
      return await ctx.reply("Use /clean in escrow groups only"); //if they use in non-escrow groups or private chats
    }

    let userEscrowGroup = findUserEscrow("@" + username);
    if (userEscrowGroup) {
      if (userEscrowGroup.groupId !== groupId) {
        return await ctx.reply("Use /clean in escrow groups only"); //if they use in non-escrow groups
      }
    }

    await clearGroupMessages(client, {
      id: userEscrowGroup.groupId,
      accessHash: userEscrowGroup.accessHash,
    });

    const updatedGroupInfo = Group.findOneAndUpdate(
      { groupId },
      {
        $set: {
          formFilled: false,
          waitingForDeposit: false,
          "currentDeal.token": "",
          "currentDeal.network": "",
          "currentDeal.sellerConfirmed": false,
          "currentDeal.buyerConfirmed": false,
          "currentDeal.fiatPaymentDetails": "",
          "currentDeal.cryptoAmount": 0,
          "currentDeal.paymentMethod": "",
          "currentDeal.releaseAddress": "",
          "currentDeal.refundAddress": "",
        },
      }
    );
    updateCache(userEscrowGroup, updatedGroupInfo);
    await ctx.reply(
      "Deal cancelled by @" +
        username +
        ".\nUse /restart to start over if needed."
    );
  } catch (error) {
    console.log("Error in cancel handler:\n", error);
  }
});

bot.command("restart", async (ctx) => {
  try {
    const username = ctx.from.username;
    let groupId = ctx.chat.id;
    groupId = Number(groupId.toString().split("-100")[1]);
    const groupIsForEscrow = global.activeEscrows.find(
      (e) => e.groupId == groupId
    );

    if (!groupIsForEscrow) {
      return await ctx.reply("Use /restart in escrow groups only"); //if they use in non-escrow groups or private chats
    }

    let userEscrowGroup = findUserEscrow("@" + username);
    if (userEscrowGroup) {
      if (userEscrowGroup.groupId !== groupId) {
        return await ctx.reply("Use /clean in escrow groups only"); //if they use in non-escrow groups
      }
    }

    startEscrow(
      userEscrowGroup,
      ctx,
      userEscrowGroup.currentDeal.participants,
      true
    );
  } catch (error) {
    console.log("Error in cancel handler:\n", error);
  }
});

bot.on("message", async (ctx) => {
  const text = ctx.message?.text;
  const userId = ctx.from.id;
  try {
    //For gas fee wallet input
    if (global.takingGasFeeWallets) {
      if (!global.systemData.admins.includes(userId)) return; //Don't even reply non-admins

      //Admin uses it in a group
      if (
        global.systemData.admins.includes(userId) &&
        (chat.type == "group" || chat.type == "supergroup")
      ) {
        return bot.telegram.sendMessage(
          userId,
          "Whatttt???😯\nPlease use the /set\\_gas\\_fee\\_wallet command ONLY in a private chat, here!!",
          { parse_mode: "Markdown" }
        );
      }

      if (!text) return;

      // Extract private keys using regex
      const bscMatch = text.match(/Bsc\s*=\s*(\S+)/i);
      const solMatch = text.match(/Sol\s*=\s*(\S+)/i);
      const polMatch = text.match(/Pol\s*=\s*(\S+)/i);

      if (!bscMatch && !solMatch && !polMatch) {
        return ctx.reply("No valid keys found in the message.");
      }

      // Build update object dynamically
      const update = {
        ...(bscMatch && { "gasFeeWalletPrivateKeys.bsc": bscMatch[1] }),
        ...(solMatch && { "gasFeeWalletPrivateKeys.sol": solMatch[1] }),
        ...(polMatch && { "gasFeeWalletPrivateKeys.pol": polMatch[1] }),
      };

      // Update only the System doc where admin = true
      const updatedSystem = await System.findOneAndUpdate(
        { admin: true },
        { $set: update },
        { new: true }
      );

      if (!updatedSystem) {
        return ctx.reply("⚠️Error, couldn't set wallet keys.");
      }
      global.systemData = updatedSystem;
      global.takingGasFeeWallets = false;

      ctx.reply("Keys saved✅");
    }

    //For profit wallet input
    if (global.takingProfitWallets) {
      if (!global.systemData.admins.includes(userId)) return; //Don't even reply non-admins

      //Admin uses it in a group
      if (
        global.systemData.admins.includes(userId) &&
        (chat.type == "group" || chat.type == "supergroup")
      ) {
        return bot.telegram.sendMessage(
          userId,
          "Whatttt???😯\nPlease use the /set\\_gas\\_fee\\_wallet command ONLY in a private chat, here!!",
          { parse_mode: "Markdown" }
        );
      }

      if (!text) return;

      // Extract private keys using regex
      const bscMatch = text.match(/Bsc\s*=\s*(\S+)/i);
      const solMatch = text.match(/Sol\s*=\s*(\S+)/i);
      const polMatch = text.match(/Pol\s*=\s*(\S+)/i);

      if (!bscMatch && !solMatch && !polMatch) {
        return ctx.reply("No valid keys found in the message.");
      }

      // Build update object dynamically
      const update = {
        ...(bscMatch && { "adminProfitWallets.bsc": bscMatch[1] }),
        ...(solMatch && { "adminProfitWallets.sol": solMatch[1] }),
        ...(polMatch && { "adminProfitWallets.pol": polMatch[1] }),
      };

      // Update only the System doc where admin = true
      const updatedSystem = await System.findOneAndUpdate(
        { admin: true },
        { $set: update },
        { new: true }
      );

      if (!updatedSystem) {
        return ctx.reply("⚠️Error, couldn't set profit wallets.");
      }
      global.systemData = updatedSystem;
      global.takingProfitWallets = false;

      ctx.reply("Profit wallets saved✅");
    }

    //For escrow exampleform input
    const username = ctx.from.username;
    if (username) {
      let userEscrowGroup = findUserEscrow("@" + username); //if user has an active escrow session
      if (userEscrowGroup) {
        //Check if this message was sent in the escrow group
        let groupId = ctx.chat.id; //Assume this is a group an extract its id
        groupId = Number(groupId.toString().split("-100")[1]);

        if (groupId == userEscrowGroup.groupId) {
          //ALL ESCROW GROUP USER INPUTS WILL BE HANDLED HERE
          const messageCheck = isFormMessage(text);

          if (messageCheck.isAFormMessage) {
            console.log(userEscrowGroup);
            if (userEscrowGroup.formFilled) {
              return await ctx.reply(
                "Form is already filled. Proceed with the next steps.",
                { reply_to_message_id: ctx.message.message_id }
              );
            }
            //Handle form submissions
            const { isValid } = messageCheck;
            if (!isValid) {
              //Reject invalid formats
              return await ctx.reply(
                "Wrong format❌\nUse /exampleform to see valid form formats.",
                { reply_to_message_id: ctx.message.message_id }
              );
            }

            //Process valid form data
            const formData = messageCheck.data;
            const seller = formData?.seller;
            const buyer = formData?.buyer;
            const cryptoType = formData.cryptoType;
            const cryptoAmount = formData.cryptoAmount;
            const inrAmount = formData.inrAmount;
            const paymentMethod = formData.paymentMethod;

            if (
              !seller ||
              !buyer ||
              !cryptoType ||
              !cryptoAmount ||
              !inrAmount ||
              !paymentMethod
            ) {
              //For incomplete forms
              return await ctx.reply(
                "❌Please fill all the fields in the form\nUse /exampleform to see the correct format",
                { reply_to_message_id: ctx.message.message_id }
              );
            }

            // if (cryptoAmount < 20) {
            //   return await ctx.reply(
            //     "Minimum deposit amount is *$20*.\nRe-submit the form with a higher price to proceed",
            //     {
            //       parse_mode: "Markdown",
            //       reply_to_message_id: ctx.message.message_id,
            //     }
            //   );
            // }

            const chat = ctx.chat;

            //Check if provided traders(in the form) are members of this group
            //Resolve their user ids
            let sellerId;
            let buyerId;
            try {
              const sellerData = await client.getEntity(seller);
              sellerId = sellerData.id;
              const buyerData = await client.getEntity(buyer);
              buyerId = buyerData.id;
            } catch (error) {
              return await ctx.reply(
                "❌ An inexistent username was provided in the form.\nChange and re-submit.",
                {
                  reply_to_message_id: ctx.message.message_id,
                }
              );
            }

            const sellerIsAGroupMember = await isGroupMember(ctx, sellerId);
            if (!sellerIsAGroupMember) {
              return await ctx.reply(
                `❌ ${seller} is not a member of this group.`,
                {
                  reply_to_message_id: ctx.message.message_id,
                }
              );
            }
            const buyerIsAGroupMember = await isGroupMember(ctx, buyerId);
            if (!buyerIsAGroupMember) {
              return await ctx.reply(
                `❌ ${buyer} is not a member of this group.`,
                {
                  reply_to_message_id: ctx.message.message_id,
                }
              );
            }

            const sellerMention = `[${seller}](tg://user?id=${sellerId})`;
            const buyerMention = `[${buyer}](tg://user?id=${buyerId})`;

            let message =
              sellerMention +
              " Select Deposit Network for *" +
              cryptoType +
              "*";
            message +=
              "\n\n🔷 *Note to Buyer* " +
              buyerMention +
              ": You will only be able to withdraw " +
              cryptoType +
              " on the network selected by the seller.";

            const networkSelectMsg = await ctx.reply(message, {
              parse_mode: "Markdown",
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: `${cryptoType}[BSC]`,
                      callback_data: "select-bep20",
                    },
                    {
                      text: `${cryptoType}[Polygon]`,
                      callback_data: "select-pol",
                    },
                  ],
                  [{ text: `${cryptoType}[SOL]`, callback_data: "select-sol" }],
                ],
              },
            });

            //Save fields
            const updatedGroupInfo = await Group.findOneAndUpdate(
              { groupId },
              {
                $set: {
                  networkSelectMsg: networkSelectMsg.message_id,
                  formFilled: true,
                  currentDeal: {
                    participants: [
                      { role: "Buyer", username: buyer, userId: buyerId },
                      { role: "Seller", username: seller, userId: sellerId },
                    ],
                    token: cryptoType,
                    paymentMethod,
                    fiatAmount: inrAmount,
                    cryptoAmount,
                  },
                },
              },
              { new: true }
            );
            console.log(updatedGroupInfo);
            //Update cache
            updateCache(userEscrowGroup, updatedGroupInfo);

            console.log(messageCheck.data);
          }
        }
      }
    }

    //For payment details replies
    const isARepliedMessge = ctx.message.reply_to_message;
    if (isARepliedMessge) {
      const repliedMessage = isARepliedMessge.message_id;

      //Only Process group messages
      const chat = ctx.chat;
      if (chat.type == "group" || chat.type == "supergroup") {
        //Only process escrow group messages
        const username = ctx.from.username;
        if (!username) {
          return await ctx.reply(
            "❌ Only users with usernames can use the escrowbot.\nSet your username.",
            { reply_to_message_id: ctx.message.message_id }
          );
        }

        const invoker = "@" + username.toLowerCase();
        const userEscrowGroup = findUserEscrow(invoker);
        if (userEscrowGroup) {
          const { participants, token, network, cryptoAmount, fiatAmount } =
            userEscrowGroup.currentDeal;
          const seller = participants.find((e) => e.role == "Seller");
          const buyer = participants.find((e) => e.role == "Buyer");
          const sellerMention = `<a href="tg://user?id=${seller.userId}">${seller.username}</a>`;
          const buyerMention = `<a href="tg://user?id=${buyer.userId}">${buyer.username}</a>`;

          //Determine action depending on group state
          //Check the message that was replied, to determine the action
          const buyerAddressPromptMsg = userEscrowGroup?.buyerAddressPromptMsg;
          if (
            buyerAddressPromptMsg &&
            repliedMessage == buyerAddressPromptMsg
          ) {
            //This means the buyer submitted their release address
            //Reject if seller tried to set this
            if (invoker == seller.username.toLowerCase()) {
              return await ctx.reply("❌ Only Buyer can set release address.", {
                reply_to_message_id: ctx.message.message_id,
              });
            }
            //Reject, if the release address has been submitted before
            if (userEscrowGroup.currentDeal.releaseAddress) {
              return await ctx.reply(
                "❌ Release address is already saved.\nProceed with the next steps.",
                {
                  reply_to_message_id: ctx.message.message_id,
                }
              );
            }
            //Save release address
            const updatedGroupInfo = await Group.findOneAndUpdate(
              { groupId: userEscrowGroup.groupId },
              {
                $set: {
                  "currentDeal.releaseAddress": ctx.message.text,
                },
              },
              { new: true }
            );

            //update cache
            updateCache(userEscrowGroup, updatedGroupInfo);

            await ctx.reply("Release address saved", {
              reply_to_message_id: ctx.message.message_id,
            });

            //Prompt seller for refund address
            const text = `${sellerMention} <b>[Seller]</b>, please <b>QUOTE</b> this message and reply with your <b>${token} ${network}</b> address for a <b>REFUND</b> in case of a dispute.
Please be mindful that funds <b>cannot be recovered</b> if sent to the wrong network address.`;

            const sellerAddressPromptMsg = await ctx.replyWithHTML(text);

            //Update network
            const updatedGroup = await Group.findOneAndUpdate(
              { groupId: userEscrowGroup.groupId },
              {
                $set: {
                  sellerAddressPromptMsg: sellerAddressPromptMsg.message_id,
                },
              },
              { new: true }
            );
            //update cache
            return updateCache(userEscrowGroup, updatedGroup);
          }

          const sellerAddressPromptMsg = userEscrowGroup.sellerAddressPromptMsg;
          if (
            sellerAddressPromptMsg &&
            repliedMessage == sellerAddressPromptMsg
          ) {
            //This means the seller submitted their refund address
            //Reject if bUyer tried to set this
            if (invoker == buyer.username.toLowerCase()) {
              return await ctx.reply("❌ Only Seller can set refund address.", {
                reply_to_message_id: ctx.message.message_id,
              });
            }
            //Reject, if the release address has been submitted before
            if (userEscrowGroup.currentDeal.refundAddress) {
              return await ctx.reply(
                "❌ Refund address is already saved.\nProceed with the next steps.",
                {
                  reply_to_message_id: ctx.message.message_id,
                }
              );
            }
            //Save refund address
            const updatedGroupInfo = await Group.findOneAndUpdate(
              { groupId: userEscrowGroup.groupId },
              {
                $set: {
                  "currentDeal.refundAddress": ctx.message.text,
                },
              },
              { new: true }
            );

            //update cache
            updateCache(userEscrowGroup, updatedGroupInfo);

            await ctx.reply("Refund address saved", {
              reply_to_message_id: ctx.message.message_id,
            });

            //Prompt seller for fiat details
            const text = `${sellerMention} <b>[Seller]</b>, please <b>QUOTE</b> this message and reply with your fiat payment details
Ensure your details are correct to avoid any payment issue.`;

            const sellerFiatPromptMsg = await ctx.replyWithHTML(text);

            //Update network
            const updatedGroup = await Group.findOneAndUpdate(
              { groupId: userEscrowGroup.groupId },
              {
                $set: {
                  sellerFiatPromptMsg: sellerFiatPromptMsg.message_id,
                },
              },
              { new: true }
            );
            //update cache
            return updateCache(userEscrowGroup, updatedGroup);
          }

          const sellerFiatPromptMsg = userEscrowGroup.sellerFiatPromptMsg;
          if (sellerFiatPromptMsg && repliedMessage == sellerFiatPromptMsg) {
            //This means the seller submitted their fiat details
            //Reject, if their fiat details have been submitted before
            if (userEscrowGroup.currentDeal.fiatPaymentDetails) {
              return await ctx.reply(
                "❌ Fiat details is already saved.\nProceed with the next steps.",
                {
                  reply_to_message_id: ctx.message.message_id,
                }
              );
            }
            //Save fiat address
            const updatedGroupInfo = await Group.findOneAndUpdate(
              { groupId: userEscrowGroup.groupId },
              {
                $set: {
                  "currentDeal.fiatPaymentDetails": ctx.message.text,
                },
              },
              { new: true }
            );

            //update cache
            updateCache(userEscrowGroup, updatedGroupInfo);

            await ctx.reply("Payment details saved", {
              reply_to_message_id: ctx.message.message_id,
            });

            await ctx.reply("Please wait...🟡");

            //Calculate escrow fees (0.5%)
            const escrowFee = (0.5 / 100) * cryptoAmount;
            let feeInNative = await getFeeInNative(
              network.toUpperCase(),
              token
            );
            const feeInUSD = await nativeFeeToUSD(network, feeInNative * 2); //2x due to transfer to release + transfer to admin
            console.log(cryptoAmount, feeInUSD);
            const totalDeposit = (
              Number(cryptoAmount.toFixed(3)) + Number(feeInUSD.toFixed(3))
            ).toFixed(3);

            //Send deal summary
            const text = `Both parties, please review the deal details below carefully and confirm if everything is correct.

▶️ <b>Buyer:</b> ${buyer.username}
▶️ <b>Seller:</b> ${seller.username}
▶️ <b>Token:</b> ${token}
▶️ <b>Chain:</b> ${network}
▶️ <b>Network Fee:</b> ${feeInUSD.toFixed(3)} USD
▶️ <b>Amount[${token}]:</b> ${cryptoAmount}
▶️ <b>Amount[INR]:</b> ${fiatAmount}
▶️ <b>Payment Method:</b> ${userEscrowGroup.currentDeal.paymentMethod}
▶️ <b>Total Escrow Fees:</b> ${escrowFee.toFixed(3)} USD
▶️ <b>Release Address:</b> ${userEscrowGroup.currentDeal.releaseAddress}
▶️ <b>Refund Address:</b> ${userEscrowGroup.currentDeal.refundAddress}
▶️ <b>Payment Details:</b> ${ctx.message.text}

===================================
▶️ <b>Total Cryto Deposit:</b> =  <b>Amount</b><i>(${cryptoAmount} USD)</i> + <b>Network fee</b><i>(${feeInUSD.toFixed(
              3
            )} USD)</i> = ${totalDeposit} USD
          

🚫 <b>IMPORTANT:</b> ${sellerMention}, <b>do <u>NOT</u></b> deposit any ${token}s to the addresses above.
You will receive a seperate <b>Escrow Deposit Address</b> after confirming the deal details.

🔷 <b>Note to Buyer (${buyerMention}):</b> You can only withdraw ${token} on the <b>${network}</b> network as selected by the seller.
`;

            const dealSummaryMsg = await ctx.replyWithHTML(text, {
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: "Confirm [Seller]",
                      callback_data: "seller-deal-confirm",
                    },
                    {
                      text: "Confirm [Buyer]",
                      callback_data: "buyer-deal-confirm",
                    },
                  ],
                ],
              },
            });

            //Update network
            const updatedGroup = await Group.findOneAndUpdate(
              { groupId: userEscrowGroup.groupId },
              {
                $set: {
                  dealSummaryMsg: dealSummaryMsg.message_id,
                },
              },
              { new: true }
            );
            //update cache
            return updateCache(userEscrowGroup, updatedGroup);
          }
        }
      }
    }
  } catch (error) {
    console.log("Error in general message handler.\n", error);
  }
});

bot.telegram.setMyCommands([
  { command: "start", description: "Start the escrow bot" },
]);

bot.catch((err, ctx) => {
  console.error("Unhandled error occurred", err);

  // Optionally notify the user without exposing internal error details
  if (ctx && ctx.reply) {
    ctx.reply("⚠️ An unexpected error occurred. Please try again.");
  }
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

app.get("/ping", async (req, res) => {
  res.status(200).json({ message: "Hello" });
});

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`App is listening on port ${port}`);
});

// Initial connection
connectDb();

// Reconnect if connection is lost after being established
mongoose.connection.on("disconnected", () => {
  console.warn("⚠️ MongoDB disconnected. Retrying...");
  connectDb();
});

// (async () => {
// //   // const x = await getFeeInNative("BEP20")
// //   // console.log(x)
// //   // const x = await checkEvmBalance("bsc", "0xE894F5E0e264988601E9A74CD9255c3ff5505Ed0")
// //   // console.log(x)
//   const x = await transferFunds(2.089, "usdt_bep20", "0xfd0B499d0EB8d36964dB96122cA308C1B5A93d6D", "0xceedb1c191d967b103bfb5448c9e13c1ed521f2a6da88e8c27161ef29e4bac78")
// })();
