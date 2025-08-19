// const { Api } = require("telegram");
// const Group = require("../models/Group");
// const sendInviteMessage = require("../helpers/sendInviteMessage");

// const ADMINS = ["@endurenow", "@jsornothing"];
// const BOT_USERNAME = "@escrow_tg_official_bot";

// const createGroup = async (participantsUsernames, client, ctx) => {
//   try {
//     //Get group count
//     const allGroups = await Group.find();
//     await client.connect();
//     // 1. Create the group
//     // Modify group creation to REQUIRE admin approval for joins
//     const result = await client.invoke(
//       new Api.channels.CreateChannel({
//         title: `Escrow Group ${allGroups.length + 1}`,
//         about: "Escrow group for secure transactions",
//         megagroup: true,
//         // ADD THESE CRITICAL SETTINGS:
//         join_request: true, // Requires admin approval
//         hidden_prehistory: true, // Hide message history from new members
//       })
//     );

//     const group = result.chats[0];
//     const groupId = group.id.toString();
//     console.log(`Group created with ID: ${groupId}`);
//     const parsedMemberUsernames = [BOT_USERNAME].map((e) => e.split("@")[1]);

//     // 2. Create invite link
//     const invite = await client.invoke(
//       new Api.messages.ExportChatInvite({
//         peer: group,
//         legacyRevokePermanent: true,
//       })
//     );

//     const groupLink = invite.link;
//     const groupName = `Escrow Group ${allGroups.length + 1}`;

//         // 3. Invite the admins to the group as regular users
//     await client.invoke(
//       new Api.channels.InviteToChannel({
//         channel: group,
//         users: parsedMemberUsernames, // without @
//       })
//     );

//     // 4. Promote them to admins
//     await addAdmins(group, [BOT_USERNAME], client);

//     await sendInviteMessage(
//       ctx,
//       participantsUsernames[0],
//       participantsUsernames[1],
//       groupName,
//       groupLink,
//       client
//     );
//     console.log("Sent invite msg")

//     const sellerUser = await client.getEntity(participantsUsernames[0]);
//     const buyerUser = await client.getEntity(participantsUsernames[1]);
//     //Store group in db
//     await Group.create({
//       inUse: true,
//       groupId,
//       name: groupName,
//       currentDeal: {
//         participants: [
//           {
//             role: "Seller",
//             username: participantsUsernames[0],
//             userId: sellerUser.id,
//           },
//           {
//             role: "Buyer",
//             username: participantsUsernames[1],
//             userId: buyerUser.id,
//           },
//         ],
//       },
//     });

//   } catch (error) {
//     console.error("Initialization error:", error);
//   }
// };

// async function addAdmins(group, users, client) {
//   for (const userRef of users) {
//     try {
//       const user = await client.getInputEntity(userRef);

//       await client.invoke(
//         new Api.channels.EditAdmin({
//           channel: group,
//           userId: user,
//           adminRights: new Api.ChatAdminRights({
//             changeInfo: true,
//             postMessages: true,
//             editMessages: true,
//             deleteMessages: true,
//             banUsers: true,
//             inviteUsers: true,
//             pinMessages: true,
//             addAdmins: false,
//             anonymous: false,
//             manageCall: true,
//           }),
//           rank: "Auto-Admin",
//         })
//       );
//       console.log(`Added admin: ${userRef}`);
//     } catch (error) {
//       console.error(`Failed to add admin ${userRef}:`, error);
//     }
//   }
// }

// module.exports = createGroup;

const { Api } = require("telegram");
const Group = require("../models/Group");
const sendInviteMessage = require("../helpers/sendInviteMessage");
const MultiChainWallet = require("../wallet/wallet_create");

const ADMINS = ["@endurenow", "@jsornothing"];
const BOT_USERNAME = "escrow_tg_official_bot"; // no @

const createGroup = async (
  participantsUsernames,
  client,
  ctx,
  escrowInitiatorMsg,
  joinRequestMode = false
) => {
  try {
    const allGroups = await Group.find();
    await client.connect();

    // Create group
    const result = await client.invoke(
      new Api.channels.CreateChannel({
        title: `Escrow Group ${allGroups.length + 1}`,
        about: "Escrow group for secure transactions",
        megagroup: true,
        joinRequest: joinRequestMode, // true = approval needed, false = instant join
        hiddenPrehistory: true,
      })
    );

    const group = result.chats[0];
    const groupId = group.id.toString();
    const accessHash = group.accessHash.toString()
    console.log(`✅ Group created with ID: ${groupId}`);

    // --- ADD BOT TO GROUP ---
    await client.invoke(
      new Api.channels.InviteToChannel({
        channel: group,
        users: [BOT_USERNAME],
      })
    );
    console.log(`✅ Bot invited to group`);

    // --- PROMOTE BOT TO ADMIN ---
    await addAdmins(group, [BOT_USERNAME], client);

    // --- Create invite link ---
    const invite = await client.invoke(
      new Api.messages.ExportChatInvite({
        peer: group,
        legacyRevokePermanent: true,
        requestNeeded: joinRequestMode, // ensures correct link type
      })
    );

    const groupLink = invite.link;
    const groupName = `Escrow Group ${allGroups.length + 1}`;

    // Send invite message
    const inviteMessageId = await sendInviteMessage(
      ctx,
      participantsUsernames[0],
      participantsUsernames[1],
      groupName,
      groupLink,
      client,
      null,
      null,
      false
    );

    console.log(`📨 Invite sent: ${groupLink}`);

    // Resolve participants to user IDs
    const sellerUser = await client.getEntity(participantsUsernames[0]);
    const buyerUser = await client.getEntity(participantsUsernames[1]);

    //Create wallets
    const walletCreator = new MultiChainWallet()
    const wallets = await walletCreator.generateWallets()
    // Save to DB
   let groupRef = await Group.create({
      escrowInitiatorMsg,
      escrowInviteMsg: {
        chatId: ctx.chat.id,
        messageId: inviteMessageId,
      },
      inUse: true,
      groupId,
      name: groupName,
      currentDeal: {
        participants: [
          {
            role: "Seller",
            username: participantsUsernames[0],
            userId: sellerUser.id,
          },
          {
            role: "Buyer",
            username: participantsUsernames[1],
            userId: buyerUser.id,
          },
        ],
      },
      wallets,accessHash
    });
    global.activeEscrows = [...global.activeEscrows, groupRef]
  } catch (error) {
    console.error("❌ Initialization error:", error);
  }
};

async function addAdmins(group, usernames, client) {
  for (const username of usernames) {
    try {
      const user = await client.getInputEntity(username);
      await client.invoke(
        new Api.channels.EditAdmin({
          channel: group,
          userId: user,
          adminRights: new Api.ChatAdminRights({
            changeInfo: true,
            postMessages: true,
            editMessages: true,
            deleteMessages: true,
            banUsers: true,
            inviteUsers: true,
            pinMessages: true,
            addAdmins: false,
            anonymous: false,
            manageCall: true,
          }),
          rank: "Admin",
        })
      );
      console.log(`✅ Added admin: ${username}`);
    } catch (error) {
      console.error(`❌ Failed to add admin ${username}:`, error);
    }
  }
}

module.exports = createGroup;
