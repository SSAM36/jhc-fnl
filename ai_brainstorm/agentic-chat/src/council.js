// Council Module
// Implements the 3-stage LLM Council workflow:
// Stage 1: (Already done by agent - multiple responses exist)
// Stage 2: Each model ranks the anonymized responses
// Stage 3: Chairman synthesizes final response

import { sendChatCompletion, extractMessageContent } from './openrouter-client.js';
import { getModelStats, getAllModelStats } from './model-analytics.js';

/**
 * Stage 2: Collect rankings from each model
 * Each model evaluates and ranks the anonymized responses
 *
 * @param {string} userQuery - The original user query
 * @param {Array} responses - Array of {modelId, modelName, content}
 * @param {string} apiKey - OpenRouter API key
 * @returns {Object} {rankings, labelToModel}
 */
export async function collectRankings(userQuery, responses, apiKey) {
  // Create anonymized labels (Response A, Response B, etc.)
  const labels = responses.map((_, i) => String.fromCharCode(65 + i)); // A, B, C...

  // Create mapping from label to model
  const labelToModel = {};
  labels.forEach((label, i) => {
    labelToModel[`Response ${label}`] = {
      modelId: responses[i].modelId,
      modelName: responses[i].modelName
    };
  });

  // Build anonymized responses text
  const responsesText = responses.map((r, i) =>
    `Response ${labels[i]}:\n${r.content}`
  ).join('\n\n');

  // Build ranking prompt with confidence and criteria
  const rankingPrompt = `You are evaluating different responses to the following question:

Question: ${userQuery}

Here are the responses from different models (anonymized):

${responsesText}

Your task:
1. First, evaluate each response individually. For each response, explain:
   - What it does well (strengths)
   - What it does poorly (weaknesses)
   - What criteria you're using to evaluate (accuracy, completeness, clarity, relevance, etc.)
   - Your confidence level in this evaluation (HIGH, MEDIUM, or LOW)
2. Then, at the very end of your response, provide a final ranking with confidence scores.

IMPORTANT: Your final ranking MUST be formatted EXACTLY as follows:
- Start with the line "FINAL RANKING:" (all caps, with colon)
- Then list the responses from best to worst as a numbered list
- Each line should be: number, period, space, response label, space, confidence in parentheses
- Format: "1. Response A (HIGH)" or "2. Response B (MEDIUM)" or "3. Response C (LOW)"
- Do not add any other text or explanations in the ranking section

Example of the correct format for your ENTIRE response:

Response A provides good detail on X but misses Y. Criteria: accuracy (good), completeness (partial). Confidence: MEDIUM.
Response B is accurate but lacks depth on Z. Criteria: accuracy (excellent), depth (lacking). Confidence: HIGH.
Response C offers the most comprehensive answer. Criteria: all aspects strong. Confidence: HIGH.

FINAL RANKING:
1. Response C (HIGH)
2. Response B (HIGH)
3. Response A (MEDIUM)

Now provide your evaluation and ranking:`;

  const messages = [{ role: 'user', content: rankingPrompt }];

  // Query all models in parallel for their rankings
  const rankingPromises = responses.map(async (r) => {
    try {
      const response = await sendChatCompletion(r.modelId, messages, apiKey);
      const content = extractMessageContent(response);
      const parsed = parseRankingWithConfidence(content);
      return {
        modelId: r.modelId,
        modelName: r.modelName,
        fullRanking: content,
        parsedRanking: parsed.ranking,
        confidenceScores: parsed.confidenceScores,
        rankingCriteria: extractRankingCriteria(content),
        isValid: validateRanking(parsed.ranking, labels.length)
      };
    } catch (error) {
      console.error(`Error getting ranking from ${r.modelName}:`, error);
      return {
        modelId: r.modelId,
        modelName: r.modelName,
        fullRanking: `Error: ${error.message}`,
        parsedRanking: [],
        confidenceScores: {},
        rankingCriteria: null,
        isValid: false,
        error: error.message
      };
    }
  });

  const rankings = await Promise.all(rankingPromises);

  return { rankings, labelToModel };
}

/**
 * Stage 3: Chairman synthesizes the final response
 *
 * @param {string} userQuery - The original user query
 * @param {Array} responses - Array of {modelId, modelName, content}
 * @param {Array} rankings - Rankings from stage 2
 * @param {string} chairmanModelId - Model ID to use as chairman
 * @param {string} apiKey - OpenRouter API key
 * @returns {Object} {modelId, modelName, content}
 */
export async function synthesizeFinal(userQuery, responses, rankings, chairmanModelId, apiKey) {
  // Build stage 1 context (individual responses)
  const stage1Text = responses.map(r =>
    `Model: ${r.modelName}\nResponse: ${r.content}`
  ).join('\n\n');

  // Build stage 2 context (rankings)
  const stage2Text = rankings.map(r =>
    `Model: ${r.modelName}\nRanking: ${r.fullRanking}`
  ).join('\n\n');

  const chairmanPrompt = `You are the Chairman of an LLM Council. Multiple AI models have provided responses to a user's question, and then ranked each other's responses.

Original Question: ${userQuery}

STAGE 1 - Individual Responses:
${stage1Text}

STAGE 2 - Peer Rankings:
${stage2Text}

Your task as Chairman is to synthesize all of this information into a single, comprehensive, accurate answer to the user's original question. Consider:
- The individual responses and their insights
- The peer rankings and what they reveal about response quality
- Any patterns of agreement or disagreement

Provide a clear, well-reasoned final answer that represents the council's collective wisdom:`;

  const messages = [{ role: 'user', content: chairmanPrompt }];

  try {
    const response = await sendChatCompletion(chairmanModelId, messages, apiKey);
    const content = extractMessageContent(response);

    // Find chairman name
    const chairmanModel = responses.find(r => r.modelId === chairmanModelId);

    return {
      modelId: chairmanModelId,
      modelName: chairmanModel?.modelName || 'Chairman',
      content
    };
  } catch (error) {
    console.error('Error in chairman synthesis:', error);
    return {
      modelId: chairmanModelId,
      modelName: 'Chairman',
      content: `Error synthesizing response: ${error.message}`
    };
  }
}

/**
 * Parse the FINAL RANKING section from a model's response
 *
 * @param {string} text - Full ranking response text
 * @returns {Array} Array of response labels in ranked order
 */
export function parseRanking(text) {
  const parsed = parseRankingWithConfidence(text);
  return parsed.ranking;
}

/**
 * Parse ranking with confidence scores
 *
 * @param {string} text - Full ranking response text
 * @returns {Object} {ranking: Array, confidenceScores: Object}
 */
export function parseRankingWithConfidence(text) {
  const ranking = [];
  const confidenceScores = {};
  
  // Look for "FINAL RANKING:" section
  if (text.includes('FINAL RANKING:')) {
    const parts = text.split('FINAL RANKING:');
    if (parts.length >= 2) {
      const rankingSection = parts[1];

      // Try to extract numbered list format with confidence (e.g., "1. Response A (HIGH)")
      const numberedMatches = rankingSection.match(/\d+\.\s*Response [A-Z]\s*\(?(HIGH|MEDIUM|LOW)\)?/gi);
      if (numberedMatches) {
        numberedMatches.forEach(m => {
          const labelMatch = m.match(/Response [A-Z]/i);
          const confidenceMatch = m.match(/\((HIGH|MEDIUM|LOW)\)/i);
          if (labelMatch) {
            const label = labelMatch[0];
            ranking.push(label);
            if (confidenceMatch) {
              confidenceScores[label] = confidenceMatch[1].toUpperCase();
            } else {
              confidenceScores[label] = 'MEDIUM'; // Default
            }
          }
        });
        return { ranking, confidenceScores };
      }

      // Fallback: Try without confidence scores
      const numberedMatchesSimple = rankingSection.match(/\d+\.\s*Response [A-Z]/g);
      if (numberedMatchesSimple) {
        numberedMatchesSimple.forEach(m => {
          const match = m.match(/Response [A-Z]/);
          if (match) {
            ranking.push(match[0]);
            confidenceScores[match[0]] = 'MEDIUM'; // Default
          }
        });
        return { ranking, confidenceScores };
      }

      // Fallback: Extract all "Response X" patterns in order
      const matches = rankingSection.match(/Response [A-Z]/g);
      if (matches) {
        matches.forEach(label => {
          ranking.push(label);
          confidenceScores[label] = 'MEDIUM'; // Default
        });
        return { ranking, confidenceScores };
      }
    }
  }

  // Fallback: try to find any "Response X" patterns in order
  const matches = text.match(/Response [A-Z]/g);
  if (matches) {
    matches.forEach(label => {
      ranking.push(label);
      confidenceScores[label] = 'MEDIUM'; // Default
    });
  }
  
  return { ranking, confidenceScores };
}

/**
 * Extract ranking criteria from evaluation text
 *
 * @param {string} text - Full ranking response text
 * @returns {Object|null} Criteria object or null
 */
export function extractRankingCriteria(text) {
  const criteria = {
    mentioned: [],
    weights: {}
  };
  
  // Common criteria keywords
  const criteriaKeywords = [
    'accuracy', 'completeness', 'clarity', 'relevance', 'depth',
    'detail', 'precision', 'coherence', 'creativity', 'practicality',
    'technical', 'understandable', 'concise', 'thorough'
  ];
  
  const lowerText = text.toLowerCase();
  criteriaKeywords.forEach(keyword => {
    if (lowerText.includes(keyword)) {
      criteria.mentioned.push(keyword);
    }
  });
  
  // Try to extract explicit criteria mentions
  const criteriaPattern = /(?:criteria|criterion|evaluat(?:ing|ed)|consider(?:ing|ed))[:\s]+([^.]+)/gi;
  const matches = [...text.matchAll(criteriaPattern)];
  if (matches.length > 0) {
    matches.forEach(match => {
      const criteriaText = match[1].toLowerCase();
      criteriaKeywords.forEach(keyword => {
        if (criteriaText.includes(keyword) && !criteria.mentioned.includes(keyword)) {
          criteria.mentioned.push(keyword);
        }
      });
    });
  }
  
  return criteria.mentioned.length > 0 ? criteria : null;
}

/**
 * Validate ranking completeness
 *
 * @param {Array} ranking - Parsed ranking array
 * @param {number} expectedCount - Expected number of responses
 * @returns {boolean} True if ranking is valid
 */
export function validateRanking(ranking, expectedCount) {
  if (!ranking || ranking.length === 0) {
    return false;
  }
  
  // Check if all expected responses are ranked
  if (ranking.length < expectedCount) {
    return false;
  }
  
  // Check for duplicates
  const unique = new Set(ranking);
  if (unique.size !== ranking.length) {
    return false;
  }
  
  return true;
}

/**
 * Calculate aggregate rankings across all models with weighted aggregation
 *
 * @param {Array} rankings - Rankings from each model
 * @param {Object} labelToModel - Mapping from labels to model info
 * @param {Object} options - Options for weighted aggregation
 * @returns {Array} Sorted array with enhanced metrics
 */
export function calculateAggregateRankings(rankings, labelToModel, options = {}) {
  const { useWeightedAggregation = true, useConfidenceWeighting = true } = options;
  
  // Get model statistics for weighting
  const allModelStats = useWeightedAggregation ? getAllModelStats() : [];
  const modelStatsMap = new Map(allModelStats.map(s => [s.modelId, s]));
  
  // Confidence score weights
  const confidenceWeights = {
    'HIGH': 1.0,
    'MEDIUM': 0.7,
    'LOW': 0.4
  };
  
  // Track positions for each response with weights
  const positionsByLabel = {};
  const confidenceByLabel = {};

  for (const ranking of rankings) {
    if (!ranking.isValid && ranking.parsedRanking.length === 0) {
      continue; // Skip invalid rankings
    }
    
    const parsed = ranking.parsedRanking;
    const confidenceScores = ranking.confidenceScores || {};
    
    // Calculate model weight based on historical performance
    let modelWeight = 1.0;
    if (useWeightedAggregation) {
      const stats = modelStatsMap.get(ranking.modelId);
      if (stats) {
        // Weight based on quality score and error rate
        const qualityWeight = stats.avgQualityScore ? stats.avgQualityScore / 100 : 0.5;
        const errorPenalty = stats.errorRate || 0;
        modelWeight = qualityWeight * (1 - errorPenalty);
        // Normalize to 0.5-1.5 range
        modelWeight = 0.5 + (modelWeight * 1.0);
      }
    }

    for (let position = 0; position < parsed.length; position++) {
      const label = parsed[position];
      if (!positionsByLabel[label]) {
        positionsByLabel[label] = [];
        confidenceByLabel[label] = [];
      }
      
      // Calculate effective weight
      let effectiveWeight = modelWeight;
      if (useConfidenceWeighting && confidenceScores[label]) {
        const confidenceWeight = confidenceWeights[confidenceScores[label]] || 0.7;
        effectiveWeight *= confidenceWeight;
      }
      
      positionsByLabel[label].push({
        position: position + 1,
        weight: effectiveWeight
      });
      confidenceByLabel[label].push(confidenceScores[label] || 'MEDIUM');
    }
  }

  // Calculate weighted average position for each model
  const aggregate = [];
  for (const [label, weightedPositions] of Object.entries(positionsByLabel)) {
    if (weightedPositions.length > 0 && labelToModel[label]) {
      const totalWeight = weightedPositions.reduce((sum, wp) => sum + wp.weight, 0);
      const weightedSum = weightedPositions.reduce((sum, wp) => sum + (wp.position * wp.weight), 0);
      const avgRank = totalWeight > 0 ? weightedSum / totalWeight : 0;
      
      // Calculate confidence distribution
      const confidences = confidenceByLabel[label] || [];
      const confidenceDist = {
        HIGH: confidences.filter(c => c === 'HIGH').length,
        MEDIUM: confidences.filter(c => c === 'MEDIUM').length,
        LOW: confidences.filter(c => c === 'LOW').length
      };
      
      // Calculate average confidence
      const avgConfidence = confidences.length > 0
        ? (confidenceDist.HIGH * 1.0 + confidenceDist.MEDIUM * 0.7 + confidenceDist.LOW * 0.4) / confidences.length
        : 0.7;
      
      aggregate.push({
        label,
        modelId: labelToModel[label].modelId,
        modelName: labelToModel[label].modelName,
        avgRank: Math.round(avgRank * 100) / 100,
        rankingsCount: weightedPositions.length,
        avgConfidence: Math.round(avgConfidence * 100) / 100,
        confidenceDistribution: confidenceDist,
        totalWeight: Math.round(totalWeight * 100) / 100
      });
    }
  }

  // Sort by weighted average rank (lower is better)
  aggregate.sort((a, b) => a.avgRank - b.avgRank);

  return aggregate;
}

/**
 * Analyze disagreements between rankings
 *
 * @param {Array} rankings - Rankings from each model
 * @param {Object} labelToModel - Mapping from labels to model info
 * @returns {Object} Disagreement analysis
 */
export function analyzeDisagreements(rankings, labelToModel) {
  const validRankings = rankings.filter(r => r.isValid && r.parsedRanking.length > 0);
  
  if (validRankings.length < 2) {
    return {
      consensus: 1.0,
      disagreements: [],
      mostContested: null
    };
  }
  
  // Build position matrix: label -> [positions from each ranker]
  const positionMatrix = {};
  const labels = Object.keys(labelToModel);
  
  labels.forEach(label => {
    positionMatrix[label] = [];
  });
  
  validRankings.forEach(ranking => {
    ranking.parsedRanking.forEach((label, index) => {
      if (positionMatrix[label]) {
        positionMatrix[label].push(index + 1);
      }
    });
  });
  
  // Calculate variance for each response (higher variance = more disagreement)
  const variances = {};
  labels.forEach(label => {
    const positions = positionMatrix[label];
    if (positions.length === 0) return;
    
    const mean = positions.reduce((a, b) => a + b, 0) / positions.length;
    const variance = positions.reduce((sum, pos) => sum + Math.pow(pos - mean, 2), 0) / positions.length;
    variances[label] = {
      mean,
      variance,
      stdDev: Math.sqrt(variance),
      positions
    };
  });
  
  // Find most contested response
  const mostContested = Object.entries(variances)
    .sort((a, b) => b[1].variance - a[1].variance)[0];
  
  // Calculate overall consensus (lower variance = higher consensus)
  const totalVariance = Object.values(variances).reduce((sum, v) => sum + v.variance, 0);
  const maxPossibleVariance = Math.pow(labels.length, 2) / 12; // Theoretical max for uniform distribution
  const consensus = Math.max(0, 1 - (totalVariance / (maxPossibleVariance * labels.length)));
  
  // Find specific disagreements (where models rank same response very differently)
  const disagreements = Object.entries(variances)
    .filter(([label, stats]) => stats.stdDev > 1.0) // Significant disagreement
    .map(([label, stats]) => ({
      label,
      modelName: labelToModel[label]?.modelName || label,
      variance: stats.variance,
      stdDev: stats.stdDev,
      positions: stats.positions,
      rankRange: {
        min: Math.min(...stats.positions),
        max: Math.max(...stats.positions)
      }
    }))
    .sort((a, b) => b.variance - a.variance);
  
  return {
    consensus: Math.round(consensus * 100) / 100,
    disagreements,
    mostContested: mostContested ? {
      label: mostContested[0],
      modelName: labelToModel[mostContested[0]]?.modelName || mostContested[0],
      variance: mostContested[1].variance,
      stdDev: mostContested[1].stdDev
    } : null,
    positionMatrix
  };
}

/**
 * Run the full council process (stages 2 and 3)
 * Stage 1 (collecting responses) is already done by the agent
 *
 * @param {string} userQuery - The original user query
 * @param {Array} responses - Array of {modelId, modelName, content}
 * @param {string} apiKey - OpenRouter API key
 * @param {string} chairmanModelId - Optional chairman model ID (defaults to first model)
 * @param {Object} options - Options for council process
 * @returns {Object} Enhanced council result with all analytics
 */
export async function runCouncil(userQuery, responses, apiKey, chairmanModelId = null, options = {}) {
  // Validate we have enough responses
  if (responses.length < 2) {
    throw new Error('Council requires at least 2 responses');
  }

  // Validate rankings completeness
  const invalidRankings = [];
  const validRankings = [];

  // Default chairman to first model
  const chairman = chairmanModelId || responses[0].modelId;

  // Stage 2: Collect rankings
  const { rankings, labelToModel } = await collectRankings(userQuery, responses, apiKey);

  // Separate valid and invalid rankings
  rankings.forEach(ranking => {
    if (ranking.isValid) {
      validRankings.push(ranking);
    } else {
      invalidRankings.push(ranking);
    }
  });

  // Warn if too many invalid rankings
  if (invalidRankings.length > 0 && invalidRankings.length >= rankings.length / 2) {
    console.warn(`Warning: ${invalidRankings.length} out of ${rankings.length} rankings are invalid`);
  }

  // Calculate aggregate rankings with weighted aggregation
  const aggregateRankings = calculateAggregateRankings(
    validRankings.length > 0 ? validRankings : rankings,
    labelToModel,
    options
  );

  // Analyze disagreements
  const disagreementAnalysis = analyzeDisagreements(validRankings.length > 0 ? validRankings : rankings, labelToModel);

  // Stage 3: Chairman synthesis (enhanced with disagreement info)
  const synthesis = await synthesizeFinal(userQuery, responses, rankings, chairman, apiKey);

  return {
    rankings,
    labelToModel,
    aggregateRankings,
    synthesis,
    disagreementAnalysis,
    rankingValidation: {
      totalRankings: rankings.length,
      validRankings: validRankings.length,
      invalidRankings: invalidRankings.length,
      invalidDetails: invalidRankings.map(r => ({
        modelName: r.modelName,
        error: r.error || 'Incomplete ranking'
      }))
    }
  };
}
