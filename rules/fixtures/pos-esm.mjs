import { merge } from "lodash";
export function handler(req, res) {
  const settings = merge({}, req.query);
  res.json(settings);
}
