'use strict';

/* =========================================================
   ScamShield AI — script.js
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
  const explanationList    = document.getElementById('explanationList');
  const recommendationValue = document.getElementById('recommendationValue');

  const toastStack         = document.getElementById('toastStack');

  /* ---------------------------------------------------------
     Initialization & Local Storage for API Key
  --------------------------------------------------------- */
  const savedKey = sessionStorage.getItem('gemini_api_key');
  if (savedKey && apiKeyInput) {
    apiKeyInput.value = savedKey;
  }

  if (apiKeyInput) {
    apiKeyInput.addEventListener('input', () => {
      sessionStorage.setItem('gemini_api_key', apiKeyInput.value.trim());
    });
  }

  if (toggleKeyBtn && apiKeyInput) {
    toggleKeyBtn.addEventListener('click', () => {
      const type = apiKeyInput.getAttribute('type') === 'password' ? 'text' : 'password';
      apiKeyInput.setAttribute('type', type);
      toggleKeyBtn.textContent = type === 'password' ? 'SHOW' : 'HIDE';
    });
  }

  /* ---------------------------------------------------------
     Character Counter
  --------------------------------------------------------- */
  if (userInput && charCount) {
    userInput.addEventListener('input', () => {
      const len = userInput.value.length;
      charCount.textContent = len;
    });
  }

  /* ---------------------------------------------------------
     Demo Sampler Buttons
  --------------------------------------------------------- */
  samplerButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const sampleText = btn.getAttribute('data-sample');
      if (userInput && sampleText) {
        userInput.value = sampleText;
        if (charCount) charCount.textContent = sampleText.length;
        // Trigger subtle pulse effect
        userInput.focus();
      }
    });
  });

  /* ---------------------------------------------------------
     Toast Notifications
  --------------------------------------------------------- */
  function showToast(message) {
    if (!toastStack) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span>${escapeHtml(message)}</span><button class="toast-close">&times;</button>`;
    
    toast.querySelector('.toast-close').addEventListener('click', () => {
      toast.remove();
    });

    toastStack.appendChild(toast);
    setTimeout(() => {
      if (toast.parentElement) toast.remove();
    }, 5000);
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ---------------------------------------------------------
     UI State Management
  --------------------------------------------------------- */
  function setAnalyzing(isAnalyzing) {
    if (!analyzeBtn) return;
    analyzeBtn.disabled = isAnalyzing;
    if (isAnalyzing) {
      if (analyzeIcon) analyzeIcon.textContent = '⏳';
      if (analyzeLabel) analyzeLabel.textContent = 'ANALYZING THREAT...';
      if (resultsIdle) resultsIdle.style.display = 'none';
      if (resultsCard) resultsCard.style.display = 'none';
      if (resultsLoading) resultsLoading.style.display = 'flex';
      startScanStatusAnimation();
    } else {
      if (analyzeIcon) analyzeIcon.textContent = '⚡';
      if (analyzeLabel) analyzeLabel.textContent = 'ANALYZE THREAT';
      if (resultsLoading) resultsLoading.style.display = 'none';
      stopScanStatusAnimation();
    }
  }

  let statusInterval = null;
  const statuses = [
    "Initializing heuristics scanner...",
    "Extracting URL patterns & phone vectors...",
    "Cross-referencing global scam databases...",
    "Querying Gemini 3.6 Flash security core...",
    "Synthesizing risk assessment & mitigation protocol..."
  ];

  function startScanStatusAnimation() {
    if (!scanStatus) return;
    let idx = 0;
    scanStatus.textContent = statuses[0];
    statusInterval = setInterval(() => {
      idx = (idx + 1) % statuses.length;
      scanStatus.textContent = statuses[idx];
    }, 1200);
  }

  function stopScanStatusAnimation() {
    if (statusInterval) {
      clearInterval(statusInterval);
      statusInterval = null;
    }
  }

  function resetResultsToIdle() {
    if (resultsLoading) resultsLoading.style.display = 'none';
    if (resultsCard) resultsCard.style.display = 'none';
    if (resultsIdle) resultsIdle.style.display = 'flex';
  }

  function showResultsState(result) {
    if (resultsIdle) resultsIdle.style.display = 'none';
    if (resultsLoading) resultsLoading.style.display = 'none';
    if (resultsCard) resultsCard.style.display = 'grid';

    // Risk Score & Gauge
    const score = Math.max(0, Math.min(100, Number(result.riskScore) || 0));
    if (riskScoreValue) riskScoreValue.textContent = score;
    
    // SVG Dasharray circumference for radius 85 is ~534.07
    if (gaugeFill) {
      const circumference = 534.07;
      const offset = circumference - (score / 100) * circumference;
      gaugeFill.style.strokeDashoffset = offset;
    }

    // Threat Classification
    const tier = (result.threatLevel || 'NEUTRAL').toUpperCase();
    if (threatLevelText) threatLevelText.textContent = tier;
    if (threatLevelBadge) {
      threatLevelBadge.className = 'threat-level-badge';
      if (tier === 'HIGH') threatLevelBadge.classList.add('badge-high');
      else if (tier === 'MEDIUM') threatLevelBadge.classList.add('badge-medium');
      else if (tier === 'LOW') threatLevelBadge.classList.add('badge-low');
      else threatLevelBadge.classList.add('badge-neutral');
    }

    if (scamTypeValue) scamTypeValue.textContent = result.scamType || 'General Inquiry';

    // Red Flags List
    if (flagsList) {
      flagsList.innerHTML = '';
      const flags = Array.isArray(result.redFlags) ? result.redFlags : [];
      if (flags.length === 0) {
        flagsList.innerHTML = '<li>No specific red flags detected.</li>';
      } else {
        flags.forEach(flag => {
          const li = document.createElement('li');
          li.textContent = flag;
          flagsList.appendChild(li);
        });
      }
    }

    // Explanation List
    if (explanationList) {
      explanationList.innerHTML = '';
      const explanations = Array.isArray(result.explanation) ? result.explanation : [result.explanation || 'No explanation provided.'];
      explanations.forEach(exp => {
        const li = document.createElement('li');
        li.textContent = exp;
        explanationList.appendChild(li);
      });
    }

    // Recommendation Protocol
    if (recommendationValue) {
      recommendationValue.textContent = result.recommendedProtocol || 'Exercise caution and verify sender identity through official channels.';
    }
  }

  /* ---------------------------------------------------------
     JSON Cleaning & Normalization
  --------------------------------------------------------- */
  function stripCodeFences(text) {
    if (!text) return '';
    let cleaned = text.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/^```json/, '');
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```/, '');
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3);
    }
    return cleaned.trim();
  }

  function normalizeResult(parsed) {
    return {
      riskScore: parsed.riskScore ?? parsed.score ?? 50,
      threatLevel: parsed.threatLevel ?? parsed.level ?? 'MEDIUM',
      scamType: parsed.scamType ?? parsed.type ?? 'Unknown Threat',
      redFlags: parsed.redFlags ?? parsed.flags ?? [],
      explanation: parsed.explanation ?? parsed.reasons ?? [],
      recommendedProtocol: parsed.recommendedProtocol ?? parsed.recommendation ?? 'Proceed with extreme caution.'
    };
  }

  /* ---------------------------------------------------------
     Main Analysis Trigger (Gemini API Call)
  --------------------------------------------------------- */
  async function analyzeThreat() {
    const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
    const text = userInput ? userInput.value.trim() : '';

    if (!apiKey) {
      showToast('Please enter your Gemini API Key first.');
      if (apiKeyInput) apiKeyInput.focus();
      return;
    }

    if (!text) {
      showToast('Please enter or select message/email text to analyze.');
      if (userInput) userInput.focus();
      return;
    }

    setAnalyzing(true);

    try {
      // Correct endpoint for Gemini 3.6 Flash
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${encodeURIComponent(apiKey)}`;

      const systemPrompt = `You are ScamShield AI, an advanced cybersecurity threat intelligence system. Analyze the provided message, email, URL, or text snippet for scam indicators, phishing patterns, social engineering tactics, and fraud markers.

You MUST respond ONLY with a raw JSON object (no markdown formatting, no code blocks, no backticks). The JSON structure must match this exact format:
{
  "riskScore": <integer between 0 and 100>,
  "threatLevel": "<HIGH | MEDIUM | LOW | NEUTRAL>",
  "scamType": "<Short category like Phishing, Tech Support Scam, Crypto Fraud, etc.>",
  "redFlags": ["<Specific red flag 1>", "<Specific red flag 2>"],
  "explanation": ["<Detailed point 1>", "<Detailed point 2>"],
  "recommendedProtocol": "<Clear, actionable security advice for the user>"
}`;

      const payload = {
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: systemPrompt + "\n\nText to analyze:\n" + text
               }
            ]
          }
        ],

        generationConfig: {
        temperature: 0.3,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            riskScore: { type: 'NUMBER' },
            threatLevel: { type: 'STRING' },
            scamType: { type: 'STRING' },
            redFlags: {
              type: 'ARRAY',
              items: { type: 'STRING' }
            },
            explanation: {
              type: 'ARRAY',
              items: { type: 'STRING' }
            },
            recommendedFlags: {
              type: 'STRING'
            }
          },
          required: [
            'riskScore',
            'threatLevel',
            'scamType',
            'redFlags',
            'explanation',
            'recommendedProtocol'
          ]
        }
      }
    };
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        let errMsg = `API Error: ${response.status} ${response.statusText}`;
        try {
          const errBody = await response.json();
          if (errBody && errBody.error && errBody.error.message) {
            errMsg = errBody.error.message;
          }
        } catch (_) { /* response body wasn't JSON */ }
        throw new Error(errMsg);
      }

      const data = await response.json();

      if (data && data.promptFeedback && data.promptFeedback.blockReason) {
        throw new Error(`Gemini blocked this request (${data.promptFeedback.blockReason}). Try rephrasing.`);
      }

      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

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

  if (analyzeBtn) {
    analyzeBtn.addEventListener('click', analyzeThreat);
  }

  if (userInput) {
    userInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        analyzeThreat();
      }
    });
  }

})();
