'use strict';

/* =========================================================
   ScamShield AI — script.js
   100% client-side. Talks directly to the Gemini REST API.
========================================================= */

(function () {

  /* ---------------------------------------------------------
     DOM references
  --------------------------------------------------------- */
  const apiKeyInput        = document.getElementById('apiKeyInput');
  const toggleKeyBtn       = document.getElementById('toggleKeyVisibility');

  const userInput          = document.getElementById('userInput');
  const charCount          = document.getElementById('charCount');
  const samplerButtons     = document.querySelectorAll('.sampler-btn');

  const analyzeBtn         = document.getElementById('analyzeBtn');
  const analyzeIcon        = analyzeBtn.querySelector('.btn-icon');
  const analyzeLabel       = analyzeBtn.querySelector('.btn-label');

  const resultsIdle        = document.getElementById('resultsIdle');
  const resultsLoading     = document.getElementById('resultsLoading');
  const scanStatus         = document.getElementById('scanStatus');
  const resultsCard        = document.getElementById('resultsCard');

  const gaugeFill          = document.getElementById('gaugeFill');
  const riskScoreValue     = document.getElementById('riskScoreValue');

  const threatLevelBadge   = document.getElementById('threatLevelBadge');
  const threatLevelText    = document.getElementById('threatLevelText');

  const scamTypeValue      = document.getElementById('scamTypeValue');
  const flagsList          = document.getElementById('flagsList');
  const recommendationValue = document.getElementById('recommendationValue');

  const toastStack         = document.getElementById('toastStack');

  /* ---------------------------------------------------------
     Constants
  --------------------------------------------------------- */
  const GAUGE_RADIUS = 85;
  const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;
  gaugeFill.style.strokeDasharray = String(GAUGE_CIRCUMFERENCE);
  gaugeFill.style.strokeDashoffset = String(GAUGE_CIRCUMFERENCE);

  const SCAN_STEPS = [
    'Parsing message structure…',
    'Scanning for urgency & pressure tactics…',
    'Checking links & sender authenticity…',
    'Cross-referencing known scam patterns…',
    'Compiling threat report…'
  ];

  const SESSION_KEY_STORAGE = 'scamshield_gemini_key';

  const SAMPLES = {
    bank:
`Subject: URGENT - Account Suspension Notice

Dear Valued Customer,

We have detected unusual activity on your First National Bank account ending in 4482. Your account will be SUSPENDED within 24 hours unless you verify your identity immediately.

Click here to confirm your details: hxxp://fnb-secure-verify.com/login

Failure to act will result in permanent account closure and may affect your credit standing.

First National Bank Security Team
Do not reply to this automated message.`,

    amazon:
`Hello,

Your recent Amazon order #702-1938224-5563141 could not be shipped because your payment method was declined.

To avoid cancellation of your order, please update your billing information within 12 hours by clicking the link below:

http://amaz0n-billing-support.net/update-payment

Thank you for shopping with us.

Amazon Customer Service`,

    legit:
`Hi Sarah,

Just confirming our appointment tomorrow (Tuesday) at 2:30 PM at Bright Smile Dental. Please remember to bring your insurance card if it's been updated since your last visit.

If you need to reschedule, just call the office directly at the number on our website — we're open until 5pm today.

See you then!
Front Desk, Bright Smile Dental`
  };

  /* ---------------------------------------------------------
     API key: persist to sessionStorage only
  --------------------------------------------------------- */
  try {
    const savedKey = sessionStorage.getItem(SESSION_KEY_STORAGE);
    if (savedKey) apiKeyInput.value = savedKey;
  } catch (_) { /* sessionStorage unavailable — non-fatal */ }

  apiKeyInput.addEventListener('input', () => {
    try {
      sessionStorage.setItem(SESSION_KEY_STORAGE, apiKeyInput.value);
    } catch (_) { /* ignore storage errors */ }
  });

  toggleKeyBtn.addEventListener('click', () => {
    const isPassword = apiKeyInput.type === 'password';
    apiKeyInput.type = isPassword ? 'text' : 'password';
    toggleKeyBtn.setAttribute('aria-pressed', String(isPassword));
    toggleKeyBtn.setAttribute('aria-label', isPassword ? 'Hide API key' : 'Show API key');
  });

  /* ---------------------------------------------------------
     Textarea character counter
  --------------------------------------------------------- */
  function updateCharCount() {
    const n = userInput.value.length;
    charCount.textContent = `${n.toLocaleString()} character${n === 1 ? '' : 's'}`;
  }
  userInput.addEventListener('input', updateCharCount);
  updateCharCount();

  /* ---------------------------------------------------------
     Demo sampler buttons
  --------------------------------------------------------- */
  samplerButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-sample');
      if (!SAMPLES[key]) return;
      userInput.value = SAMPLES[key];
      updateCharCount();
      userInput.focus();
      resetResultsToIdle();
    });
  });

  /* ---------------------------------------------------------
     Toasts
  --------------------------------------------------------- */
  function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <svg class="toast-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/>
        <path d="M12 8v5" stroke="currentColor"
