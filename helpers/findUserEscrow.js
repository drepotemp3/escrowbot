const findUserEscrow = (username) => {
  let res = global.activeEscrows.find((group) =>
    group.currentDeal?.participants?.some(
      (p) => p.username?.toLowerCase() === username.toLowerCase()
    )
  ) || false;

  return res
};

module.exports = findUserEscrow