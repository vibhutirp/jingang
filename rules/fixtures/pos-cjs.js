const _ = require("lodash");
const express = require("express");
const app = express();
const defaults = { theme: "light" };
app.post("/profile", (req, res) => {
  const settings = _.merge({}, defaults, req.body);
  res.json(settings);
});
