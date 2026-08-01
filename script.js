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
