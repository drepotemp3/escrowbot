const updateCache = (userEscrowGroup, updatedGroupInfo) => {
  let previousActiveEscrows = global.activeEscrows;
  previousActiveEscrows = previousActiveEscrows.filter(
    (e) => e.groupId !== userEscrowGroup.groupId
  );
  const updatedActiveEscrows = [...previousActiveEscrows, updatedGroupInfo];
  global.activeEscrows = updatedActiveEscrows;
};
module.exports = updateCache;
