const { updateCache } = require('./usage_api.js');

(async () => {
  await updateCache();
})().catch(() => {});
