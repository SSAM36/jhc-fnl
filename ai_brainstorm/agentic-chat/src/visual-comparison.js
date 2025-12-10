// Visual Model Comparison Tools
// Side-by-side diff view, similarity scores, heatmaps, etc.

/**
 * Calculate similarity score between two responses
 * @param {string} response1 - First response
 * @param {string} response2 - Second response
 * @returns {Object} Similarity metrics
 */
export function calculateSimilarity(response1, response2) {
  if (!response1 || !response2) {
    return {
      score: 0,
      jaccard: 0,
      cosine: 0,
      levenshtein: 0,
      commonWords: 0,
      uniqueWords1: 0,
      uniqueWords2: 0
    };
  }

  // Tokenize responses
  const tokens1 = tokenize(response1);
  const tokens2 = tokenize(response2);

  // Jaccard similarity (intersection over union)
  const set1 = new Set(tokens1);
  const set2 = new Set(tokens2);
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  const jaccard = union.size > 0 ? intersection.size / union.size : 0;

  // Cosine similarity (simplified - using word frequency)
  const freq1 = getWordFrequency(tokens1);
  const freq2 = getWordFrequency(tokens2);
  const cosine = calculateCosineSimilarity(freq1, freq2);

  // Levenshtein distance (normalized)
  const maxLen = Math.max(response1.length, response2.length);
  const levenshtein = maxLen > 0 
    ? 1 - (levenshteinDistance(response1, response2) / maxLen)
    : 0;

  // Common and unique words
  const commonWords = intersection.size;
  const uniqueWords1 = set1.size - intersection.size;
  const uniqueWords2 = set2.size - intersection.size;

  // Combined similarity score (weighted average)
  const score = (jaccard * 0.4 + cosine * 0.4 + levenshtein * 0.2);

  return {
    score: Math.round(score * 100) / 100,
    jaccard: Math.round(jaccard * 100) / 100,
    cosine: Math.round(cosine * 100) / 100,
    levenshtein: Math.round(levenshtein * 100) / 100,
    commonWords,
    uniqueWords1,
    uniqueWords2,
    totalWords1: tokens1.length,
    totalWords2: tokens2.length
  };
}

/**
 * Tokenize text into words
 */
function tokenize(text) {
  return text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 0);
}

/**
 * Get word frequency map
 */
function getWordFrequency(tokens) {
  const freq = {};
  tokens.forEach(token => {
    freq[token] = (freq[token] || 0) + 1;
  });
  return freq;
}

/**
 * Calculate cosine similarity
 */
function calculateCosineSimilarity(freq1, freq2) {
  const allWords = new Set([...Object.keys(freq1), ...Object.keys(freq2)]);
  
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  allWords.forEach(word => {
    const val1 = freq1[word] || 0;
    const val2 = freq2[word] || 0;
    dotProduct += val1 * val2;
    norm1 += val1 * val1;
    norm2 += val2 * val2;
  });

  const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
  return denominator > 0 ? dotProduct / denominator : 0;
}

/**
 * Calculate Levenshtein distance
 */
function levenshteinDistance(str1, str2) {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + 1
        );
      }
    }
  }

  return matrix[len1][len2];
}

/**
 * Generate diff between two responses
 * @param {string} response1 - First response
 * @param {string} response2 - Second response
 * @returns {Array} Diff segments
 */
export function generateDiff(response1, response2) {
  const lines1 = response1.split('\n');
  const lines2 = response2.split('\n');
  
  const diff = [];
  const maxLen = Math.max(lines1.length, lines2.length);

  for (let i = 0; i < maxLen; i++) {
    const line1 = lines1[i] || '';
    const line2 = lines2[i] || '';

    if (line1 === line2) {
      diff.push({ type: 'unchanged', line1, line2, index: i });
    } else if (!line1) {
      diff.push({ type: 'added', line1: '', line2, index: i });
    } else if (!line2) {
      diff.push({ type: 'removed', line1, line2: '', index: i });
    } else {
      // Lines differ - find word-level differences
      const wordDiff = generateWordDiff(line1, line2);
      diff.push({ type: 'modified', line1, line2, wordDiff, index: i });
    }
  }

  return diff;
}

/**
 * Generate word-level diff for a line
 */
function generateWordDiff(line1, line2) {
  const words1 = line1.split(/(\s+)/);
  const words2 = line2.split(/(\s+)/);
  
  const diff = [];
  const maxLen = Math.max(words1.length, words2.length);

  for (let i = 0; i < maxLen; i++) {
    const word1 = words1[i] || '';
    const word2 = words2[i] || '';

    if (word1 === word2) {
      diff.push({ type: 'unchanged', word: word1 });
    } else if (!word1) {
      diff.push({ type: 'added', word: word2 });
    } else if (!word2) {
      diff.push({ type: 'removed', word: word1 });
    } else {
      diff.push({ type: 'removed', word: word1 });
      diff.push({ type: 'added', word: word2 });
    }
  }

  return diff;
}

/**
 * Create similarity matrix for multiple responses
 * @param {Array} responses - Array of {modelName, content}
 * @returns {Object} Similarity matrix
 */
export function createSimilarityMatrix(responses) {
  const matrix = [];
  const modelNames = responses.map(r => r.modelName);

  for (let i = 0; i < responses.length; i++) {
    const row = [];
    for (let j = 0; j < responses.length; j++) {
      if (i === j) {
        row.push({ score: 1.0, similarity: calculateSimilarity(responses[i].content, responses[j].content) });
      } else {
        const similarity = calculateSimilarity(responses[i].content, responses[j].content);
        row.push({ score: similarity.score, similarity });
      }
    }
    matrix.push(row);
  }

  return {
    matrix,
    modelNames,
    avgSimilarity: calculateAverageSimilarity(matrix)
  };
}

/**
 * Calculate average similarity across all pairs
 */
function calculateAverageSimilarity(matrix) {
  let sum = 0;
  let count = 0;

  for (let i = 0; i < matrix.length; i++) {
    for (let j = i + 1; j < matrix.length; j++) {
      sum += matrix[i][j].score;
      count++;
    }
  }

  return count > 0 ? sum / count : 0;
}

/**
 * Generate quality heatmap data
 * @param {Array} responses - Array of {modelName, content, qualityScore}
 * @returns {Object} Heatmap data
 */
export function generateQualityHeatmap(responses) {
  const heatmap = {
    models: responses.map(r => r.modelName),
    metrics: {
      length: [],
      quality: [],
      structure: [],
      technical: [],
      clarity: []
    }
  };

  responses.forEach(response => {
    const content = response.content || '';
    
    // Length score (normalized)
    const length = content.length;
    const lengthScore = Math.min(1.0, length / 1000); // Max at 1000 chars
    heatmap.metrics.length.push(lengthScore);

    // Quality score (from response or calculated)
    const quality = response.qualityScore || calculateQualityScore(content);
    heatmap.metrics.quality.push(quality / 100);

    // Structure score (based on formatting)
    const structure = calculateStructureScore(content);
    heatmap.metrics.structure.push(structure);

    // Technical score
    const technical = calculateTechnicalScore(content);
    heatmap.metrics.technical.push(technical);

    // Clarity score
    const clarity = calculateClarityScore(content);
    heatmap.metrics.clarity.push(clarity);
  });

  return heatmap;
}

/**
 * Calculate quality score (simple heuristic)
 */
function calculateQualityScore(content) {
  let score = 50;

  if (content.length > 50 && content.length < 2000) score += 20;
  if (content.includes('\n\n')) score += 10; // Structured
  if (content.match(/\d+\./)) score += 10; // Numbered list
  if (!content.match(/error|failed|unable/i)) score += 10; // No error words

  return Math.min(100, Math.max(0, score));
}

/**
 * Calculate structure score
 */
function calculateStructureScore(content) {
  let score = 0;

  if (content.includes('\n\n')) score += 0.3; // Paragraphs
  if (content.match(/\n[-*]\s/)) score += 0.2; // Bullet points
  if (content.match(/\n\d+\.\s/)) score += 0.2; // Numbered list
  if (content.match(/```/)) score += 0.2; // Code blocks
  if (content.match(/#{1,6}\s/)) score += 0.1; // Headers

  return Math.min(1.0, score);
}

/**
 * Calculate technical score
 */
function calculateTechnicalScore(content) {
  const technicalKeywords = [
    'function', 'algorithm', 'implementation', 'optimize', 'complexity',
    'API', 'framework', 'library', 'module', 'class', 'method', 'variable'
  ];

  const lowerContent = content.toLowerCase();
  const matches = technicalKeywords.filter(kw => lowerContent.includes(kw)).length;
  
  return Math.min(1.0, matches / 5); // Max score with 5+ keywords
}

/**
 * Calculate clarity score
 */
function calculateClarityScore(content) {
  let score = 0.5;

  // Sentence length (shorter is clearer, but not too short)
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
  if (sentences.length > 0) {
    const avgLength = sentences.reduce((sum, s) => sum + s.length, 0) / sentences.length;
    if (avgLength > 20 && avgLength < 100) score += 0.2;
  }

  // Common words (more common = clearer)
  const commonWords = ['the', 'is', 'are', 'and', 'or', 'but', 'this', 'that', 'with'];
  const words = content.toLowerCase().split(/\s+/);
  const commonCount = words.filter(w => commonWords.includes(w)).length;
  if (commonCount / words.length > 0.1) score += 0.2;

  // Question marks (asking questions can indicate clarity)
  if (content.includes('?')) score += 0.1;

  return Math.min(1.0, score);
}

/**
 * Render diff view HTML
 * @param {Array} diff - Diff segments from generateDiff
 * @param {string} model1Name - First model name
 * @param {string} model2Name - Second model name
 * @returns {string} HTML string
 */
export function renderDiffView(diff, model1Name, model2Name) {
  const diffHtml = diff.map(segment => {
    switch (segment.type) {
      case 'unchanged':
        return `<div class="diff-line unchanged">
          <span class="diff-line-num">${segment.index + 1}</span>
          <span class="diff-content">${escapeHtml(segment.line1)}</span>
        </div>`;
      
      case 'added':
        return `<div class="diff-line added">
          <span class="diff-line-num">${segment.index + 1}</span>
          <span class="diff-content">${escapeHtml(segment.line2)}</span>
        </div>`;
      
      case 'removed':
        return `<div class="diff-line removed">
          <span class="diff-line-num">${segment.index + 1}</span>
          <span class="diff-content">${escapeHtml(segment.line1)}</span>
        </div>`;
      
      case 'modified':
        return `<div class="diff-line modified">
          <span class="diff-line-num">${segment.index + 1}</span>
          <div class="diff-modified-content">
            <div class="diff-removed-line">${escapeHtml(segment.line1)}</div>
            <div class="diff-added-line">${escapeHtml(segment.line2)}</div>
          </div>
        </div>`;
      
      default:
        return '';
    }
  }).join('');

  return `
    <div class="diff-view">
      <div class="diff-header">
        <div class="diff-model-name">${escapeHtml(model1Name)}</div>
        <div class="diff-vs">vs</div>
        <div class="diff-model-name">${escapeHtml(model2Name)}</div>
      </div>
      <div class="diff-content">
        ${diffHtml}
      </div>
    </div>
  `;
}

/**
 * Escape HTML
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

