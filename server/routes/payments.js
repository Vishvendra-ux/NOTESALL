const router = require('express').Router();
const { handleRazorpayWebhook } = require('../controllers/paymentController');

// Verified payment gateway webhooks (signature checked inside controller via req.rawBody)
router.post('/razorpay/webhook', handleRazorpayWebhook);

module.exports = router;
