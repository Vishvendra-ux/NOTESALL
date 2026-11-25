const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');

const DEFAULT_PRO_DURATION_DAYS = 365;
const MAX_PRO_DURATION_DAYS = 3650;

/**
 * Cryptographically verify Razorpay's x-razorpay-signature header against the
 * exact raw request bytes using HMAC-SHA256 and constant-time comparison.
 */
function verifyRazorpaySignature(rawBody, signature, secret) {
  if (!rawBody || !signature || !secret) return false;
  if (typeof signature !== 'string' || !/^[0-9a-f]+$/i.test(signature)) return false;

  const expectedHex = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  const expectedBuf = Buffer.from(expectedHex, 'hex');
  const providedBuf = Buffer.from(signature, 'hex');

  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

/**
 * Resolve the target NOTESX user from Razorpay payment/subscription notes or payer email.
 */
async function findUserFromWebhookPayload(payload) {
  const paymentEntity = payload?.payment?.entity || {};
  const subEntity = payload?.subscription?.entity || {};
  const notes = (paymentEntity.notes && Object.keys(paymentEntity.notes).length > 0)
    ? paymentEntity.notes
    : (subEntity.notes || {});

  if (notes.userId && mongoose.isValidObjectId(String(notes.userId).trim())) {
    const byId = await User.findById(String(notes.userId).trim());
    if (byId) return { user: byId, notes, paymentEntity, subEntity };
  }

  const candidateEmail = notes.email || paymentEntity.email || subEntity.email;
  if (candidateEmail && typeof candidateEmail === 'string') {
    const byEmail = await User.findOne({ email: candidateEmail.toLowerCase().trim() });
    if (byEmail) return { user: byEmail, notes, paymentEntity, subEntity };
  }

  return { user: null, notes, paymentEntity, subEntity };
}

/**
 * @desc    Handle verified Razorpay payment & subscription webhooks to grant/revoke Pro
 * @route   POST /api/payments/razorpay/webhook
 * @access  Public (protected via HMAC-SHA256 x-razorpay-signature)
 */
exports.handleRazorpayWebhook = async (req, res, next) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret || !webhookSecret.trim()) {
      return res.status(503).json({
        message: 'Razorpay webhook is not configured. Set RAZORPAY_WEBHOOK_SECRET on the server.'
      });
    }

    const signature = req.get('x-razorpay-signature');
    if (!verifyRazorpaySignature(req.rawBody, signature, webhookSecret.trim())) {
      return res.status(401).json({ message: 'Invalid webhook signature.' });
    }

    const event = req.body?.event;
    const payload = req.body?.payload || {};

    if (event === 'payment.captured' || event === 'subscription.charged') {
      const { user, notes, paymentEntity, subEntity } = await findUserFromWebhookPayload(payload);
      if (!user) {
        console.warn(`⚠️ Razorpay webhook (${event}): no matching NOTESX user found.`);
        return res.status(200).json({ received: true, ignored: 'user_not_found' });
      }

      const paymentId = String(paymentEntity.id || subEntity.id || '').trim();
      if (paymentId && user.lastPaymentId === paymentId) {
        return res.status(200).json({ received: true, duplicate: true });
      }

      const requestedDays = Number(notes.durationDays);
      const durationDays = Number.isFinite(requestedDays) && requestedDays >= 1 && requestedDays <= MAX_PRO_DURATION_DAYS
        ? Math.floor(requestedDays)
        : DEFAULT_PRO_DURATION_DAYS;

      const baseTime = user.isPro && user.proExpiresAt && new Date(user.proExpiresAt).getTime() > Date.now()
        ? new Date(user.proExpiresAt).getTime()
        : Date.now();

      user.isPro = true;
      user.proExpiresAt = new Date(baseTime + durationDays * 24 * 60 * 60 * 1000);
      user.proProvider = 'razorpay';
      if (paymentId) user.lastPaymentId = paymentId;
      await user.save();

      console.log(`💳 Razorpay (${event}): activated Pro for ${user.email} until ${user.proExpiresAt.toISOString()}`);
      return res.status(200).json({ received: true, activated: true, userId: user._id });
    }

    if (event === 'subscription.cancelled' || event === 'subscription.halted' || event === 'payment.refunded') {
      const { user } = await findUserFromWebhookPayload(payload);
      if (!user) {
        return res.status(200).json({ received: true, ignored: 'user_not_found' });
      }

      user.isPro = false;
      user.proExpiresAt = null;
      user.proProvider = '';
      await user.save();

      console.log(`💳 Razorpay (${event}): revoked Pro for ${user.email}`);
      return res.status(200).json({ received: true, revoked: true, userId: user._id });
    }

    return res.status(200).json({ received: true, ignored: event || 'unknown_event' });
  } catch (error) {
    next(error);
  }
};
