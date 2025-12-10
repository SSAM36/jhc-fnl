// Council Message Renderer
// Renders rich council results in the agent chat panel

/**
 * Render a council result as HTML for display in agent messages
 *
 * @param {Object} result - Council result from runCouncil()
 * @param {Array} result.rankings - Rankings from each model
 * @param {Object} result.labelToModel - Label to model mapping
 * @param {Array} result.aggregateRankings - Calculated aggregate rankings
 * @param {Object} result.synthesis - Chairman synthesis result
 * @returns {string} HTML string
 */
export function renderCouncilMessage(result) {
  const { 
    rankings = [], 
    labelToModel = {}, 
    aggregateRankings = [], 
    synthesis = {},
    disagreementAnalysis = null,
    rankingValidation = null
  } = result || {};

  // Build rankings table with confidence scores and criteria
  const rankingsTableRows = (rankings || []).map(r => {
    const parsedRanking = r.parsedRanking || [];
    const confidenceScores = r.confidenceScores || {};
    const rankingCriteria = r.rankingCriteria;
    const isValid = r.isValid !== false;
    
    const parsedStr = parsedRanking.length > 0
      ? parsedRanking.map((label, i) => {
          const model = labelToModel[label];
          const confidence = confidenceScores[label] || 'MEDIUM';
          const confidenceBadge = getConfidenceBadge(confidence);
          return `${i + 1}. ${model?.modelName || label} ${confidenceBadge}`;
        }).join(', ')
      : 'Unable to parse';
    
    const criteriaText = rankingCriteria && rankingCriteria.mentioned && rankingCriteria.mentioned.length > 0
      ? `<div class="council-criteria">Criteria: ${rankingCriteria.mentioned.slice(0, 3).join(', ')}${rankingCriteria.mentioned.length > 3 ? '...' : ''}</div>`
      : '';
    
    const validityBadge = isValid 
      ? '<span class="council-valid-badge">✓ Valid</span>' 
      : '<span class="council-invalid-badge">✗ Invalid</span>';

    return `
      <tr class="${!isValid ? 'council-invalid-ranking' : ''}">
        <td class="council-ranker">
          ${r.modelName || 'Unknown'}
          ${validityBadge}
        </td>
        <td class="council-ranking-list">
          ${parsedStr}
          ${criteriaText}
        </td>
      </tr>
    `;
  }).join('');

  // Build aggregate rankings with confidence and weights
  const aggregateRows = (aggregateRankings || []).map((r, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
    const avgRank = typeof r.avgRank === 'number' ? r.avgRank.toFixed(2) : 'N/A';
    const avgConfidence = typeof r.avgConfidence === 'number' ? (r.avgConfidence * 100).toFixed(0) + '%' : 'N/A';
    const confidenceDist = r.confidenceDistribution || {};
    const confidenceBadge = getConfidenceBadgeFromScore(r.avgConfidence);
    
    return `
      <tr class="${i === 0 ? 'council-winner' : ''}">
        <td class="council-rank">${medal}</td>
        <td class="council-model-name">${r.modelName || 'Unknown'}</td>
        <td class="council-avg-rank">${avgRank}</td>
        <td class="council-confidence">${confidenceBadge} ${avgConfidence}</td>
        <td class="council-rankings-count">${r.rankingsCount || 0} votes</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="council-result">
      <div class="council-header">
        <span class="council-icon">🏛️</span>
        <span class="council-title">Council Results</span>
      </div>

      <div class="council-section">
        <div class="council-section-header">
          <span class="council-section-icon">📊</span>
          <span class="council-section-title">Peer Rankings</span>
        </div>
        <table class="council-rankings-table">
          <thead>
            <tr>
              <th>Ranker</th>
              <th>Their Ranking (Best → Worst)</th>
            </tr>
          </thead>
          <tbody>
            ${rankingsTableRows}
          </tbody>
        </table>
      </div>

      <div class="council-section">
        <div class="council-section-header">
          <span class="council-section-icon">🏆</span>
          <span class="council-section-title">Aggregate Scores (Weighted)</span>
        </div>
        <table class="council-aggregate-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Model</th>
              <th>Avg Score</th>
              <th>Confidence</th>
              <th>Votes</th>
            </tr>
          </thead>
          <tbody>
            ${aggregateRows}
          </tbody>
        </table>
      </div>

      ${disagreementAnalysis ? renderDisagreementAnalysis(disagreementAnalysis, labelToModel) : ''}
      
      ${rankingValidation ? renderRankingValidation(rankingValidation) : ''}

      <div class="council-section council-synthesis-section">
        <div class="council-section-header">
          <span class="council-section-icon">📝</span>
          <span class="council-section-title">Chairman's Synthesis</span>
          <span class="council-chairman-name">(${synthesis?.modelName || 'Chairman'})</span>
        </div>
        <div class="council-synthesis-content">
          ${escapeHtml(synthesis?.content || 'No synthesis available')}
        </div>
      </div>
    </div>
  `;
}

/**
 * Render a loading state for council
 *
 * @param {string} stage - Current stage being processed
 * @returns {string} HTML string
 */
export function renderCouncilLoading(stage = 'rankings') {
  const stageText = stage === 'rankings'
    ? 'Collecting rankings from models...'
    : 'Chairman is synthesizing final answer...';

  return `
    <div class="council-result council-loading">
      <div class="council-header">
        <span class="council-icon">🏛️</span>
        <span class="council-title">Consulting Council</span>
      </div>
      <div class="council-loading-content">
        <div class="council-spinner"></div>
        <span class="council-loading-text">${stageText}</span>
      </div>
    </div>
  `;
}

/**
 * Render an error state for council
 *
 * @param {string} errorMessage - Error message to display
 * @returns {string} HTML string
 */
export function renderCouncilError(errorMessage) {
  return `
    <div class="council-result council-error">
      <div class="council-header">
        <span class="council-icon">🏛️</span>
        <span class="council-title">Council Error</span>
      </div>
      <div class="council-error-content">
        <span class="council-error-icon">⚠️</span>
        <span class="council-error-text">${escapeHtml(errorMessage)}</span>
      </div>
    </div>
  `;
}

/**
 * Get confidence badge HTML
 */
function getConfidenceBadge(confidence) {
  const badges = {
    'HIGH': '<span class="council-confidence-badge high">🔵 HIGH</span>',
    'MEDIUM': '<span class="council-confidence-badge medium">🟡 MED</span>',
    'LOW': '<span class="council-confidence-badge low">🔴 LOW</span>'
  };
  return badges[confidence] || badges['MEDIUM'];
}

/**
 * Get confidence badge from score (0-1)
 */
function getConfidenceBadgeFromScore(score) {
  if (score >= 0.8) return '<span class="council-confidence-badge high">🔵</span>';
  if (score >= 0.5) return '<span class="council-confidence-badge medium">🟡</span>';
  return '<span class="council-confidence-badge low">🔴</span>';
}

/**
 * Render disagreement analysis section
 */
function renderDisagreementAnalysis(analysis, labelToModel) {
  if (!analysis || analysis.consensus === undefined) return '';
  
  const consensusPercent = (analysis.consensus * 100).toFixed(0);
  const consensusColor = analysis.consensus >= 0.7 ? 'high' : analysis.consensus >= 0.4 ? 'medium' : 'low';
  
  let disagreementsHtml = '';
  if (analysis.disagreements && analysis.disagreements.length > 0) {
    disagreementsHtml = `
      <div class="council-disagreements-list">
        <div class="council-disagreements-title">Areas of Disagreement:</div>
        ${analysis.disagreements.slice(0, 3).map(d => `
          <div class="council-disagreement-item">
            <strong>${d.modelName}</strong>: Ranked from position ${d.rankRange.min} to ${d.rankRange.max}
            <span class="council-variance">(variance: ${d.variance.toFixed(2)})</span>
          </div>
        `).join('')}
      </div>
    `;
  }
  
  const mostContestedHtml = analysis.mostContested ? `
    <div class="council-most-contested">
      <strong>Most Contested:</strong> ${analysis.mostContested.modelName}
      <span class="council-variance">(std dev: ${analysis.mostContested.stdDev.toFixed(2)})</span>
    </div>
  ` : '';
  
  return `
    <div class="council-section">
      <div class="council-section-header">
        <span class="council-section-icon">⚖️</span>
        <span class="council-section-title">Consensus Analysis</span>
      </div>
      <div class="council-consensus-content">
        <div class="council-consensus-score ${consensusColor}">
          Consensus: ${consensusPercent}%
        </div>
        ${mostContestedHtml}
        ${disagreementsHtml}
      </div>
    </div>
  `;
}

/**
 * Render ranking validation section
 */
function renderRankingValidation(validation) {
  if (!validation || validation.totalRankings === 0) return '';
  
  const validPercent = ((validation.validRankings / validation.totalRankings) * 100).toFixed(0);
  const isValid = validation.invalidRankings === 0;
  
  let invalidDetailsHtml = '';
  if (validation.invalidDetails && validation.invalidDetails.length > 0) {
    invalidDetailsHtml = `
      <div class="council-invalid-details">
        ${validation.invalidDetails.map(d => `
          <div class="council-invalid-item">
            <strong>${d.modelName}</strong>: ${d.error}
          </div>
        `).join('')}
      </div>
    `;
  }
  
  return `
    <div class="council-section">
      <div class="council-section-header">
        <span class="council-section-icon">✓</span>
        <span class="council-section-title">Ranking Validation</span>
      </div>
      <div class="council-validation-content">
        <div class="council-validation-score ${isValid ? 'valid' : 'warning'}">
          ${validation.validRankings} / ${validation.totalRankings} valid rankings (${validPercent}%)
        </div>
        ${invalidDetailsHtml}
      </div>
    </div>
  `;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
