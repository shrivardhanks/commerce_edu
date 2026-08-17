const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const NOTES_DIR = path.join(__dirname, 'notes');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const NOTE_PRICE = 66500;

app.use(express.json());
app.use(cookieParser());
app.use(express.static(__dirname));

function isPaid(req) {
  return req.cookies && req.cookies.commerceEduPaid === 'true';
}

app.post('/api/create-order', async (req, res) => {
  try {
    const amount = Number(req.body.amount || NOTE_PRICE);

    const order = await razorpay.orders.create({
      amount,
      currency: 'INR',
      receipt: `commerce-edu-${Date.now()}`,
      notes: {
        purpose: 'Chapter Notes Access',
      },
    });

    res.json({ ok: true, order });
  } catch (error) {
    console.error('Create order failed:', error);
    res.status(500).json({ ok: false, message: 'Could not create payment order.' });
  }
});

app.post('/api/verify-payment', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ ok: false, message: 'Missing payment details.' });
    }

    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    const isValid = generatedSignature === razorpay_signature;

    if (!isValid) {
      return res.status(400).json({ ok: false, message: 'Invalid payment signature.' });
    }

    res.cookie('commerceEduPaid', 'true', {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    res.json({ ok: true, message: 'Payment verified successfully.' });
  } catch (error) {
    console.error('Payment verification failed:', error);
    res.status(500).json({ ok: false, message: 'Payment verification failed.' });
  }
});

app.get('/api/check-access', (req, res) => {
  res.json({ paid: isPaid(req) });
});

app.get('/api/config', (req, res) => {
  if (!process.env.RAZORPAY_KEY_ID) {
    return res.status(500).json({ ok: false, message: 'Razorpay key is not configured.' });
  }

  res.json({ ok: true, keyId: process.env.RAZORPAY_KEY_ID });
});

app.get('/notes/:fileName', (req, res) => {
  if (!isPaid(req)) {
    return res.status(403).send('Payment required to access this PDF.');
  }

  const fileName = path.basename(req.params.fileName);
  const filePath = path.join(NOTES_DIR, fileName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('PDF not found.');
  }

  res.sendFile(filePath);
});

app.get('/notes/:fileName/download', (req, res) => {
  if (!isPaid(req)) {
    return res.status(403).send('Payment required to download this PDF.');
  }

  const fileName = path.basename(req.params.fileName);
  const filePath = path.join(NOTES_DIR, fileName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('PDF not found.');
  }

  res.download(filePath, fileName);
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
