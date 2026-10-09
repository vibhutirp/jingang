const _ = require("lodash");
const base = { retries: 3 };
const overrides = { retries: 5 };
const config = _.merge({}, base, overrides);
module.exports = config;
