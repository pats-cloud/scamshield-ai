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
        <path d="M12 8v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        <circle cx="12" cy="16" r="0.9" fill="currentColor"/>
      </svg>
      <span class="toast-message"></span>
      <button type="button" class="toast-close" aria-label="Dismiss">×</button>
    `;
    toast.querySelector('.toast-message').textContent = message;

    const removeToast = () => {
      toast.classList.add('leaving');
      setTimeout(() => toast.remove(), 250);
    };

    toast.querySelector('.toast-close').addEventListener('click', removeToast);
    toastStack.appendChild(toast);
    setTimeout(removeToast, 7000);
  }

  /* ---------------------------------------------------------
     Results panel state machine
  --------------------------------------------------------- */
  let scanInterval = null;

  function resetResultsToIdle() {
    if (scanInterval) { clearInterval(scanInterval); scanInterval = null; }
    resultsCard.classList.remove('visible');
    resultsCard.style.display = 'none';
    resultsLoading.hidden = true;
    resultsIdle.hidden = false;
  }

  function showLoadingState() {
    resultsIdle.hidden = true;
    resultsCard.classList.remove('visible');
    resultsCard.style.display = 'none';
    resultsLoading.hidden = false;

    let stepIndex = 0;
    scanStatus.textContent = SCAN_STEPS[0];
    scanInterval = setInterval(() => {
      stepIndex = (stepIndex + 1) % SCAN_STEPS.length;
      scanStatus.textContent = SCAN_STEPS[stepIndex];
    }, 1100);
  }

  function showResultsState(result) {
    if (scanInterval) { clearInterval(scanInterval); scanInterval = null; }
    resultsIdle.hidden = true;
    resultsLoading.hidden = true;

    renderResult(result);

    resultsCard.style.display = 'grid';
    // Allow the browser to register display:flex before animating opacity/transform in.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resultsCard.classList.add('visible'));
    });
  }

  /* ---------------------------------------------------------
     Threat-tier helpers
  --------------------------------------------------------- */
  function getTier(threatLevel, riskScore) {
    const level = (threatLevel || '').toLowerCase();
    if (level.includes('critical') || level.includes('high')) return 'high';
    if (level.includes('medium') || level.includes('moderate')) return 'medium';
    if (level.includes('low')) return 'low';
    // Fall back to the numeric score if the label wasn't recognized.
    if (riskScore >= 70) return 'high';
    if (riskScore >= 35) return 'medium';
    if (riskScore >= 0) return 'low';
    return 'neutral';
  }

  const TIER_COLORS = {
    high: getCssVar('--risk-high'),
    medium: getCssVar('--risk-medium'),
    low: getCssVar('--risk-low'),
    neutral: getCssVar('--risk-neutral')
  };

  function getCssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  /* ---------------------------------------------------------
     Render a normalized result into the dashboard
  --------------------------------------------------------- */
  function renderResult(result) {
    const tier = getTier(result.threat_level, result.risk_score);
    const color = TIER_COLORS[tier] || TIER_COLORS.neutral;

    // Gauge ring
    const offset = GAUGE_CIRCUMFERENCE - (result.risk_score / 100) * GAUGE_CIRCUMFERENCE;
    gaugeFill.style.stroke = color;
    
    // Set to 0 to start
    gaugeFill.style.strokeDashoffset = String(GAUGE_CIRCUMFERENCE);
    
    // Force a browser reflow so it registers the starting position
    void gaugeFill.offsetWidth; 
    
    // Now apply the calculated offset to trigger the CSS transition
    gaugeFill.style.strokeDashoffset = String(offset);
    
    riskScoreValue.textContent = String(result.risk_score);

    // Badge
    threatLevelBadge.classList.remove('threat-high', 'threat-medium', 'threat-low', 'threat-neutral');
    threatLevelBadge.classList.add(`threat-${tier}`);
    threatLevelText.textContent = result.threat_level;

    // Shared accent color for flag cards / recommendation border
    resultsCard.style.setProperty('--tier-accent', color);

    // Scam type
    scamTypeValue.textContent = result.scam_type;

    // Flags
    flagsList.innerHTML = '';
    if (result.flags.length === 0) {
      const li = document.createElement('li');
      li.textContent = 'No specific red flags identified.';
      flagsList.appendChild(li);
    } else {
      result.flags.forEach((flag) => {
        const li = document.createElement('li');
        li.textContent = flag;
        flagsList.appendChild(li);
      });
    }

    // Recommendation
    recommendationValue.textContent = result.recommendation;
  }

  /* ---------------------------------------------------------
     Gemini prompt construction
  --------------------------------------------------------- */
  function buildRequestBody(message) {
    const systemPrompt = `You are ScamShield AI, an expert cybersecurity threat analyst specializing in detecting phishing, scams, and fraudulent messages (emails, SMS texts, DMs, etc).

Analyze the message the user provides and assess how likely it is to be a scam, phishing attempt, or fraud. Base your judgment on real cybersecurity red flags such as: urgency or pressure tactics, mismatched or suspicious links, requests for credentials or personal/financial information, spoofed or impersonated senders, grammar inconsistent with the claimed sender, unexpected attachments, too-good-to-be-true offers, and threats of account suspension or legal action.

If the message looks like a normal, safe, legitimate communication with no meaningful red flags, assign a low risk_score and say so plainly.

Respond with ONLY a raw JSON object — no markdown, no code fences, no commentary before or after — matching exactly this shape:
{
  "risk_score": 0-100 integer, where 100 means certainly a scam,
  "threat_level": one of "Low", "Medium", "High", "Critical",
  "scam_type": short label for the type of scam, or "Not a Scam" if it looks legitimate,
  "flags": array of short strings, each one specific suspicious indicator found (empty array if none),
  "recommendation": one or two sentences of clear, actionable advice for the recipient
}`;

    return {
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: `Analyze the following message:\n\n"""\n${message}\n"""` }]
        }
      ],
      generationConfig: {
        temperature: 0.3,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            risk_score: { type: 'NUMBER' },
            threat_level: { type: 'STRING' },
            scam_type: { type: 'STRING' },
            flags: { type: 'ARRAY', items: { type: 'STRING' } },
            recommendation: { type: 'STRING' }
          },
          required: ['risk_score', 'threat_level', 'scam_type', 'flags', 'recommendation']
        }
      }
    };
  }

  /* ---------------------------------------------------------
     Strip \`\`\`json ... \`\`\` (or \`\`\` ... \`\`\`) fences, defensively
  --------------------------------------------------------- */
  function stripCodeFences(raw) {
    if (!raw) return '';
    let text = raw.trim();
    text = text.replace(/^```[a-zA-Z]*\s*/, '');
    text = text.replace(/```\s*$/, '');
    return text.trim();
  }

  /* ---------------------------------------------------------
     Normalize whatever Gemini returned into safe values
  --------------------------------------------------------- */
  function normalizeResult(obj) {
    const rawScore = Number(obj && obj.risk_score);
    const risk_score = Number.isFinite(rawScore) ? Math.max(0, Math.min(100, Math.round(rawScore))) : 0;

    const threat_level = (obj && typeof obj.threat_level === 'string' && obj.threat_level.trim())
      ? obj.threat_level.trim()
      : 'Unknown';

    const scam_type = (obj && typeof obj.scam_type === 'string' && obj.scam_type.trim())
      ? obj.scam_type.trim()
      : 'Unclassified';

    const flags = (obj && Array.isArray(obj.flags))
      ? obj.flags.filter((f) => typeof f === 'string' && f.trim()).map((f) => f.trim())
      : [];

    const recommendation = (obj && typeof obj.recommendation === 'string' && obj.recommendation.trim())
      ? obj.recommendation.trim()
      : 'No specific recommendation was returned. When in doubt, avoid clicking links or sharing personal information, and verify the sender through an independent, trusted channel.';

    return { risk_score, threat_level, scam_type, flags, recommendation };
  }

  /* ---------------------------------------------------------
     Analyze button state helpers
  --------------------------------------------------------- */
  function setAnalyzing(isAnalyzing) {
    analyzeBtn.disabled = isAnalyzing;
    analyzeLabel.textContent = isAnalyzing ? 'Analyzing…' : 'Analyze Threat';
    analyzeIcon.classList.toggle('spin', isAnalyzing);
  }

  /* ---------------------------------------------------------
     Main analyze flow
  --------------------------------------------------------- */
  async function analyzeThreat() {
    const apiKey = apiKeyInput.value.trim();
    const message = userInput.value.trim();

    if (!apiKey) {
      showToast('Add your Gemini API key above before running a scan.');
      apiKeyInput.focus();
      return;
    }
    if (!message) {
      showToast('Paste a message to analyze first.');
      userInput.focus();
      return;
    }

    setAnalyzing(true);
    showLoadingState();

const endpoint = `const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;`;
     
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildRequestBody(message))
      });

      if (!response.ok) {
        let errMsg = `Gemini API request failed (HTTP ${response.status}).`;
        try {
          const errBody = await response.json();
          if (errBody && errBody.error && errBody.error.message) {
            errMsg = errBody.error.message;
          }
        } catch (_) { /* response body wasn't JSON — keep default message */ }
        throw new Error(errMsg);
      }

      const data = await response.json();

      if (data && data.promptFeedback && data.promptFeedback.blockReason) {
        throw new Error(`Gemini blocked this request (${data.promptFeedback.blockReason}). Try rephrasing the message.`);
      }

      const rawText = data &&
        data.candidates &&
        data.candidates[0] &&
        data.candidates[0].content &&
        data.candidates[0].content.parts &&
        data.candidates[0].content.parts[0] &&
        data.candidates[0].content.parts[0].text;

      if (!rawText) {
        throw new Error('Gemini returned an empty response. Please try again.');
      }

      const cleanText = stripCodeFences(rawText);

      let parsed;
      try {
        parsed = JSON.parse(cleanText);
      } catch (parseErr) {
        throw new Error('Gemini returned a response that could not be read as JSON. Please try again.');
      }

      const result = normalizeResult(parsed);
      showResultsState(result);

    } catch (err) {
      resetResultsToIdle();
      const message = (err && err.message) ? err.message : 'Something went wrong while contacting Gemini.';
      showToast(message);
    } finally {
      setAnalyzing(false);
    }
  }

  analyzeBtn.addEventListener('click', analyzeThreat);

})();
