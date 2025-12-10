// Model Performance Analytics
// Tracks response times, token usage, costs, quality scores, and historical performance

const STORAGE_KEY = 'model_analytics';

// Initialize analytics storage
function initAnalytics() {
  if (!localStorage.getItem(STORAGE_KEY)) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      interactions: [],
      modelStats: {},
      taskTypeStats: {},
      lastUpdated: Date.now()
    }));
  }
}

// Get all analytics data
export function getAnalytics() {
  initAnalytics();
  const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  return {
    interactions: data.interactions || [],
    modelStats: data.modelStats || {},
    taskTypeStats: data.taskTypeStats || {},
    lastUpdated: data.lastUpdated || Date.now()
  };
}

// Save analytics data
function saveAnalytics(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    ...data,
    lastUpdated: Date.now()
  }));
}

// Record an interaction
export function recordInteraction(interaction) {
  const analytics = getAnalytics();
  
  const record = {
    id: `interaction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
    modelId: interaction.modelId,
    modelName: interaction.modelName,
    taskType: interaction.taskType || 'general',
    responseTime: interaction.responseTime || 0,
    promptTokens: interaction.promptTokens || 0,
    completionTokens: interaction.completionTokens || 0,
    totalTokens: interaction.totalTokens || 0,
    cost: interaction.cost || 0,
    qualityScore: interaction.qualityScore || null,
    userRating: interaction.userRating || null,
    error: interaction.error || null,
    finishReason: interaction.finishReason || null,
    responseLength: interaction.responseLength || 0
  };
  
  analytics.interactions.push(record);
  
  // Update model statistics
  updateModelStats(analytics, record);
  
  // Update task type statistics
  updateTaskTypeStats(analytics, record);
  
  // Keep only last 1000 interactions to prevent storage bloat
  if (analytics.interactions.length > 1000) {
    analytics.interactions = analytics.interactions.slice(-1000);
  }
  
  saveAnalytics(analytics);
  return record;
}

// Update model statistics
function updateModelStats(analytics, record) {
  const modelId = record.modelId;
  if (!analytics.modelStats[modelId]) {
    analytics.modelStats[modelId] = {
      modelId,
      modelName: record.modelName,
      totalInteractions: 0,
      totalResponseTime: 0,
      totalTokens: 0,
      totalCost: 0,
      totalQualityScore: 0,
      qualityScoreCount: 0,
      totalUserRating: 0,
      userRatingCount: 0,
      errorCount: 0,
      taskTypes: {},
      lastUsed: record.timestamp
    };
  }
  
  const stats = analytics.modelStats[modelId];
  stats.totalInteractions++;
  stats.totalResponseTime += record.responseTime;
  stats.totalTokens += record.totalTokens;
  stats.totalCost += record.cost;
  stats.lastUsed = record.timestamp;
  
  if (record.qualityScore !== null) {
    stats.totalQualityScore += record.qualityScore;
    stats.qualityScoreCount++;
  }
  
  if (record.userRating !== null) {
    stats.totalUserRating += record.userRating;
    stats.userRatingCount++;
  }
  
  if (record.error) {
    stats.errorCount++;
  }
  
  // Track task type performance
  if (!stats.taskTypes[record.taskType]) {
    stats.taskTypes[record.taskType] = {
      count: 0,
      avgQualityScore: 0,
      totalQualityScore: 0,
      qualityScoreCount: 0
    };
  }
  
  const taskStats = stats.taskTypes[record.taskType];
  taskStats.count++;
  if (record.qualityScore !== null) {
    taskStats.totalQualityScore += record.qualityScore;
    taskStats.qualityScoreCount++;
    taskStats.avgQualityScore = taskStats.totalQualityScore / taskStats.qualityScoreCount;
  }
}

// Update task type statistics
function updateTaskTypeStats(analytics, record) {
  const taskType = record.taskType;
  if (!analytics.taskTypeStats[taskType]) {
    analytics.taskTypeStats[taskType] = {
      totalInteractions: 0,
      models: {},
      avgResponseTime: 0,
      totalResponseTime: 0,
      avgQualityScore: 0,
      totalQualityScore: 0,
      qualityScoreCount: 0
    };
  }
  
  const taskStats = analytics.taskTypeStats[taskType];
  taskStats.totalInteractions++;
  taskStats.totalResponseTime += record.responseTime;
  taskStats.avgResponseTime = taskStats.totalResponseTime / taskStats.totalInteractions;
  
  if (record.qualityScore !== null) {
    taskStats.totalQualityScore += record.qualityScore;
    taskStats.qualityScoreCount++;
    taskStats.avgQualityScore = taskStats.totalQualityScore / taskStats.qualityScoreCount;
  }
  
  // Track which models are used for this task type
  if (!taskStats.models[record.modelId]) {
    taskStats.models[record.modelId] = {
      modelId: record.modelId,
      modelName: record.modelName,
      count: 0,
      avgQualityScore: 0,
      totalQualityScore: 0,
      qualityScoreCount: 0
    };
  }
  
  const modelTaskStats = taskStats.models[record.modelId];
  modelTaskStats.count++;
  if (record.qualityScore !== null) {
    modelTaskStats.totalQualityScore += record.qualityScore;
    modelTaskStats.qualityScoreCount++;
    modelTaskStats.avgQualityScore = modelTaskStats.totalQualityScore / modelTaskStats.qualityScoreCount;
  }
}

// Get model statistics
export function getModelStats(modelId) {
  const analytics = getAnalytics();
  return analytics.modelStats[modelId] || null;
}

// Get all model statistics
export function getAllModelStats() {
  const analytics = getAnalytics();
  return Object.values(analytics.modelStats).map(stats => ({
    ...stats,
    avgResponseTime: stats.totalInteractions > 0 
      ? stats.totalResponseTime / stats.totalInteractions 
      : 0,
    avgQualityScore: stats.qualityScoreCount > 0
      ? stats.totalQualityScore / stats.qualityScoreCount
      : null,
    avgUserRating: stats.userRatingCount > 0
      ? stats.totalUserRating / stats.userRatingCount
      : null,
    errorRate: stats.totalInteractions > 0
      ? stats.errorCount / stats.totalInteractions
      : 0,
    avgCostPerInteraction: stats.totalInteractions > 0
      ? stats.totalCost / stats.totalInteractions
      : 0
  }));
}

// Get task type statistics
export function getTaskTypeStats(taskType) {
  const analytics = getAnalytics();
  return analytics.taskTypeStats[taskType] || null;
}

// Get best model for a task type
export function getBestModelForTask(taskType) {
  const analytics = getAnalytics();
  const taskStats = analytics.taskTypeStats[taskType];
  
  if (!taskStats || !taskStats.models) {
    return null;
  }
  
  const models = Object.values(taskStats.models);
  if (models.length === 0) {
    return null;
  }
  
  // Sort by average quality score (descending), then by count (descending)
  models.sort((a, b) => {
    if (a.qualityScoreCount === 0 && b.qualityScoreCount === 0) {
      return b.count - a.count;
    }
    if (a.qualityScoreCount === 0) return 1;
    if (b.qualityScoreCount === 0) return -1;
    const scoreDiff = b.avgQualityScore - a.avgQualityScore;
    if (Math.abs(scoreDiff) < 0.1) {
      return b.count - a.count;
    }
    return scoreDiff;
  });
  
  return models[0];
}

// Get recent interactions
export function getRecentInteractions(limit = 50) {
  const analytics = getAnalytics();
  return analytics.interactions
    .slice(-limit)
    .reverse();
}

// Get interactions for a model
export function getModelInteractions(modelId, limit = 50) {
  const analytics = getAnalytics();
  return analytics.interactions
    .filter(i => i.modelId === modelId)
    .slice(-limit)
    .reverse();
}

// Calculate quality score from response (simple heuristic)
export function calculateQualityScore(response, responseTime, error) {
  if (error) return 0;
  
  let score = 50; // Base score
  
  // Response length factor (not too short, not too long)
  const length = response.length;
  if (length > 50 && length < 2000) {
    score += 20;
  } else if (length < 20) {
    score -= 20;
  }
  
  // Response time factor (faster is better, but not suspiciously fast)
  if (responseTime > 0 && responseTime < 5000) {
    score += 10;
  } else if (responseTime > 30000) {
    score -= 10;
  }
  
  // Basic quality indicators
  if (response.includes('?') || response.includes('!')) {
    score += 5; // Shows engagement
  }
  
  if (response.split('\n').length > 1) {
    score += 5; // Structured response
  }
  
  return Math.max(0, Math.min(100, score));
}

// Clear analytics (for testing or reset)
export function clearAnalytics() {
  localStorage.removeItem(STORAGE_KEY);
  initAnalytics();
}

// Export analytics data
export function exportAnalytics() {
  return getAnalytics();
}

// Import analytics data
export function importAnalytics(data) {
  saveAnalytics(data);
}

