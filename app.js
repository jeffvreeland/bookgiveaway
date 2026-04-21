require('dotenv').config();

const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');

const { runMigrations } = require('./db/migrate');
const { requireAuth } = require('./middleware/auth');
const partnerTracking = require('./middleware/partnerTracking');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const partnersRoutes = require('./routes/partners');
const coursesRoutes = require('./routes/courses');
const checkoutRoutes = require('./routes/checkout');
const webhookRoutes = require('./routes/webhooks');
const apiRoutes = require('./routes/api');
const downloadsRoutes = require('./routes/downloads');
const certificateRoutes = require('./routes/certificate');
const referralRoutes = require('./routes/referral');
const contestRoutes = require('./routes/contest');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Webhooks MUST be mounted before express.json() so Stripe gets the raw body
app.use('/webhooks', webhookRoutes);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Phase 9.2 — partner click tracking (runs on every request, ignores non-?ref= hits)
app.use(partnerTracking);

app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/admin/partners', partnersRoutes);
app.use('/courses', coursesRoutes);
app.use('/checkout', checkoutRoutes);
app.use('/api', apiRoutes);
app.use('/downloads', downloadsRoutes);
app.use('/certificate', certificateRoutes);
app.use('/r', referralRoutes);

// Contest subdomain — book.workjeff.com serves the giveaway landing page
app.use((req, res, next) => {
  if (req.hostname === 'book.workjeff.com') {
    return contestRoutes(req, res, next);
  }
  next();
});

// Root and dashboard both send students to the course
app.get('/', requireAuth, (req, res) => res.redirect('/courses'));
app.get('/dashboard', requireAuth, (req, res) => res.redirect('/courses'));

// 404
app.use((req, res) => {
  res.status(404).render('error', { message: 'Page not found.', user: req.user || null });
});

// 500
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { message: 'Internal server error.', user: req.user || null });
});

const PORT = process.env.PORT || 3000;

async function start() {
  await runMigrations();
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

module.exports = app;
