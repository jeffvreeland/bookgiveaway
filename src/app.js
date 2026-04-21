require('dotenv').config();

const express = require('express');
const path = require('path');
const { runMigrations } = require('./db/migrate');
const contestRoutes = require('./routes/contest');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', contestRoutes);

app.use((req, res) => res.status(404).send('Not found'));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send('Server error');
});

const PORT = process.env.PORT || 3000;

async function start() {
  await runMigrations();
  app.listen(PORT, () => console.log(`Contest server running on port ${PORT}`));
}

start().catch(err => { console.error(err); process.exit(1); });
