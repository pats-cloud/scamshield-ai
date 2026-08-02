'use strict';

/* =========================================================
   ScamShield AI — script.js
   100% client-side (Option 1). Talks directly to Gemini.
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
  const explanationList    = document.getElementById('explanationList'); // NEW DOM element
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

First National Bank Security Team`,

    amazon:
`Hello,

Your recent Amazon order #702-1938224-5563141 could not be shipped because your payment method was declined.

To avoid cancellation of your order, please update your billing information within 12 hours by clicking the link below:

http://amaz0n-billing-support.net/update-payment`,

    legit:
`Hi Sarah,

Just confirming our appointment tomorrow (Tuesday) at 2:30 PM at Bright Smile Dental. Please remember to bring your insurance card if it's been updated since your last visit.

If you need to reschedule, just call the office directly at the number on our website.

See you then!
Front Desk, Bright Smile Dental`
  };

  /* ---------------------------------------------------------
     API key: persist to sessionStorage only
  --------------------------------------------------------- */
  try {
    const savedKey = sessionStorage.getItem(SESSION_KEY_STORAGE);
    if (savedKey) apiKeyInput.value = savedKey;
  } catch (_) {}

  apiKeyInput.addEventListener('input', () => {
    try {
      sessionStorage.setItem(SESSION_KEY_STORAGE, apiKeyInput.value);
    } catch (_) {}
  });

  toggleKeyBtn.addEventListener('click', () => {
    const isPassword = apiKeyInput.type === 'password';
    apiKeyInput.type = isPassword ? 'text' : 'password';
    toggleKeyBtn.textContent = isPassword ? '[ - ]' : '[ O ]';
    toggleKeyBtn.setAttribute('aria-pressed', String(isPassword));
  });

  /* ---------------------------------------------------------
     Textarea character counter
  --------------------------------------------------------- */
  function updateCharCount() {
    const n = userInput.value.length;
    charCount.textContent = `${n.toLocaleString()} CHARS`;
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
      <span class="toast-message">${message}</span>
      <button type="button" class="toast-close" aria-label="Dismiss">×</button>
    `;
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

    resultsCard.style.display = 'flex';
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
    if (level.includes('low') || level.includes('safe')) return 'low';
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

    const offset = GAUGE_CIRCUMFERENCE - (result.risk_score / 100) * GAUGE_CIRCUMFERENCE;
    gaugeFill.style.stroke = color;
    gaugeFill.style.strokeDashoffset = String(GAUGE_CIRCUMFERENCE);
    void gaugeFill.offsetWidth; 
    gaugeFill.style.strokeDashoffset = String(offset);
    
    riskScoreValue.textContent = String(result.risk_score);

    threatLevelBadge.className = `threat-level-badge threat-${tier}`;
    threatLevelText.textContent = result.threat_level;
    resultsCard.style.setProperty('--tier-accent', color);
    scamTypeValue.textContent = result.scam_type;

    // Render Red Flags
    flagsList.innerHTML = '';
    if (result.flags.length === 0) {
      flagsList.innerHTML = '<li>No specific red flags identified.</li>';
    } else {
      result.flags.forEach((flag) => {
        const li = document.createElement('li');
        li.textContent = flag;
        flagsList.appendChild(li);
      });
    }

    // Render AI Reasoning (The new section you added)
    explanationList.innerHTML = '';
    if (result.explanation.length === 0) {
      explanationList.innerHTML = '<li>No specific reasoning provided.</li>';
    } else {
      result.explanation.forEach((exp) => {
        const li = document.createElement('li');
        li.textContent = exp;
        explanationList.appendChild(li);
      });
    }

    recommendationValue.textContent = result.recommendation;
  }

  /* ---------------------------------------------------------
     Gemini prompt construction
  --------------------------------------------------------- */
  function buildRequestBody(message) {
    const systemPrompt = `You are ScamShield AI, an expert cybersecurity threat analyst.
Analyze the message and assess how likely it is to be a scam. Base your judgment on real cybersecurity red flags.
If the message looks legitimate, assign a low risk_score and say so plainly.

Respond with ONLY a raw JSON object matching exactly this shape:
{
  "risk_score": 0-100 integer,
  "threat_level": one of "Safe", "Low", "Medium", "High", "Critical",
  "scam_type": short label for the type of scam, or "Not a Scam",
  "flags": array of short strings, specific suspicious indicators found (empty if none),
  "explanation": array of short strings, explaining the step-by-step logic/reasoning of why this decision was made,
  "recommendation": one or two sentences of clear, actionable advice
}`;

    return {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: `Analyze the following message:\n\n"""\n${message}\n"""` }] }],
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
            explanation: { type: 'ARRAY', items: { type: 'STRING' } }, // New property added!
            recommendation: { type: 'STRING' }
          },
          required: ['risk_score', 'threat_level', 'scam_type', 'flags', 'explanation', 'recommendation']
        }
      }
    };
  }

  function stripCodeFences(raw) {
    if (!raw) return '';
    return raw.replace(/^```[a-zA-Z]*\s*/, '').replace(/```\s*$/, '').trim();
  }

  function normalizeResult(obj) {
    const rawScore = Number(obj && obj.risk_score);
    const risk_score = Number.isFinite(rawScore) ? Math.max(0, Math.min(100, Math.round(rawScore))) : 0;
    const threat_level = (obj && obj.threat_level) ? obj.threat_level.trim() : 'Unknown';
    const scam_type = (obj && obj.scam_type) ? obj.scam_type.trim() : 'Unclassified';
    
    const flags = (obj && Array.isArray(obj.flags)) ? obj.flags.map(f => String(f).trim()) : [];
    
    // Process new explanation array
    const explanation = (obj && Array.isArray(obj.explanation)) ? obj.explanation.map(e => String(e).trim()) : ["Analysis completed."];
    
    const recommendation = (obj && obj.recommendation) ? obj.recommendation.trim() : 'No specific recommendation returned.';

    return { risk_score, threat_level, scam_type, flags, explanation, recommendation };
  }

  function setAnalyzing(isAnalyzing) {
    analyzeBtn.disabled = isAnalyzing;
    analyzeLabel.textContent = isAnalyzing ? 'ANALYZING…' : 'START ANALYSIS';
    analyzeIcon.classList.toggle('spin', isAnalyzing);
  }

  /* ---------------------------------------------------------
     Main analyze flow (Direct API Call)
  --------------------------------------------------------- */
  async function analyzeThreat() {
    const apiKey = apiKeyInput.value.trim();
    const message = userInput.value.trim();

    if (!apiKey) {
      showToast('Please enter your Gemini API key first.');
      apiKeyInput.focus();
      return;
    }
    if (!message) {
      showToast('Please paste a message to analyze.');
      userInput.focus();
      return;
    }

    setAnalyzing(true);
    showLoadingState();

    // Option 1 Endpoint: Direct to Google
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
     
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildRequestBody(message))
      });

      if (!response.ok) {
        let errMsg = `API request failed (HTTP ${response.status}).`;
        try {
          const errBody = await response.json();
          if (errBody?.error?.message) errMsg = errBody.error.message;
        } catch (_) {}
        throw new Error(errMsg);
      }

      const data = await response.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) throw new Error('API returned an empty response.');

      const cleanText = stripCodeFences(rawText);
      const parsed = JSON.parse(cleanText);

      const result = normalizeResult(parsed);
      showResultsState(result);

    } catch (err) {
      resetResultsToIdle();
      showToast((err && err.message) ? err.message : 'Something went wrong.');
    } finally {
      setAnalyzing(false);
    }
  }

  analyzeBtn.addEventListener('click', analyzeThreat);

})();
