require('dotenv').config();

const app = require('./app');
const { getStatusSnapshot } = require('./services/statusService');

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
  // Show an initial status summary so developers know the DB state.
  getStatusSnapshot().then((status) => {
    console.table(status);
  }).catch((err) => {
    console.error('Unable to fetch status snapshot', err);
  });
});
