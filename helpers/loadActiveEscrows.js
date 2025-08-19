const Group = require("../models/Group");

const loadActiveEscrows = async () => {
  try {
    const activeEscrows = await Group.find({ inUse: true });
    if (activeEscrows.length > 0) {
      //Store in memory for easy access
      global.activeEscrows = activeEscrows;
      console.log("Active escrows loaded into cache✅")
    }
  } catch (error) {
    console.log("Error loading active escrows:\n", error);
  }
};
module.exports = loadActiveEscrows;
