const Group = require("../models/Group");

const checkParticipantEligibity = async (usernames, client) => {
  // Resolve usernames → clickable ping markdown
  const userLinks = {};
  for (const username of usernames) {
    try {
      const entity = await client.getEntity(username);
      userLinks[username] = `[@${entity.username}](tg://user?id=${entity.id})`;
    } catch (err) {
      console.error(`❌ Failed to resolve ${username}:`, err.message);
      // fallback to plain username
      userLinks[username] = `@${username.replace(/^@/, "")}`;
    }
  }

  // 1. Find groups containing at least one of the requested participant
  const groups = await Group.find({
    "currentDeal.participants.username": { $in: usernames },
  });

  if (groups.length === 0) {
    return { inAGroup: false };
  }

  // 2. Track which participants are in any group
  const foundUsers = new Set();
  for (const g of groups) {
    for (const u of usernames) {
      if (g.currentDeal.participants.some((p) => p.username === u)) {
        foundUsers.add(u);
      }
    }
  }

  // 3. Check if requested participants are in the same group already
  const bothInSameGroup = groups.some((g) =>
    usernames.every((u) =>
      g.currentDeal.participants.some((p) => p.username === u)
    )
  );

  // 4. Create message with pings
  let message;
  if (bothInSameGroup) {
    const linkedNames = usernames.map((u) => userLinks[u]).join(" and ");
    message = `${linkedNames} have an unfinished deal. End the deal to use escrow again.`;
    return { inAGroup: true, message };
  }

  if (foundUsers.size > 0) {
    const linkedNames = [...foundUsers]
      .map((u) => userLinks[u])
      .join(", ");
    message = `${linkedNames} cannot use escrow yet, finish your pending deal.`;
    return { inAGroup: true, message };
  }

  return { inAGroup: false };
};

module.exports = checkParticipantEligibity
