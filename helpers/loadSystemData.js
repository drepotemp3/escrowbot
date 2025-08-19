const System = require("../models/System");

const loadSystemData = async () => {
  try {
    const data = await System.findOne({ admin: true });
    global.systemData = data;
    console.log("System Data Loaded into cache✅")
  } catch (error) {
    console.log("Error loading system data:\n", error);
  }
};

module.exports = loadSystemData