// Self-Improving Model Selection & Recommendation System
// Learns which models perform best for specific tasks and recommends accordingly

import { getAnalytics, getBestModelForTask, getAllModelStats } from './model-analytics.js';
import { getModelPersonality, matchTaskToPersonality } from './model-personality.js';
import { getActiveModels } from './active-models.js';

const STORAGE_KEY = 'model_selection_learning';

// Initialize learning storage
function initLearning() {
  if (!localStorage.getItem(STORAGE_KEY)) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      taskModelPerformance: {},
      modelRecommendations: {},
      learningHistory: [],
      lastUpdated: Date.now()
    }));
  }
}

// Get learning data
function getLearningData() {
  initLearning();
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
}

// Save learning data
function saveLearningData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    ...data,
    lastUpdated: Date.now()
  }));
}

/**
 * Learn from task completion
 * Records which model performed best for a task type
 */
export function learnFromTask(taskType, modelId, successMetrics) {
  const learning = getLearningData();
  
  if (!learning.taskModelPerformance[taskType]) {
    learning.taskModelPerformance[taskType] = {};
  }

  if (!learning.taskModelPerformance[taskType][modelId]) {
    learning.taskModelPerformance[taskType][modelId] = {
      attempts: 0,
      successes: 0,
      avgQualityScore: 0,
      totalQualityScore: 0,
      qualityScoreCount: 0,
      avgResponseTime: 0,
      totalResponseTime: 0,
      avgCost: 0,
      totalCost: 0
    };
  }

  const stats = learning.taskModelPerformance[taskType][modelId];
  stats.attempts++;
  
  if (successMetrics.success) {
    stats.successes++;
  }
  
  if (successMetrics.qualityScore !== undefined) {
    stats.totalQualityScore += successMetrics.qualityScore;
    stats.qualityScoreCount++;
    stats.avgQualityScore = stats.totalQualityScore / stats.qualityScoreCount;
  }
  
  if (successMetrics.responseTime !== undefined) {
    stats.totalResponseTime += successMetrics.responseTime;
    stats.avgResponseTime = stats.totalResponseTime / stats.attempts;
  }
  
  if (successMetrics.cost !== undefined) {
    stats.totalCost += successMetrics.cost;
    stats.avgCost = stats.totalCost / stats.attempts;
  }

  // Record learning event
  learning.learningHistory.push({
    timestamp: Date.now(),
    taskType,
    modelId,
    successMetrics
  });

  // Keep only last 1000 learning events
  if (learning.learningHistory.length > 1000) {
    learning.learningHistory = learning.learningHistory.slice(-1000);
  }

  saveLearningData(learning);
}

/**
 * Get best model for a task type based on learning
 */
export function getRecommendedModelForTask(taskType, availableModels = null) {
  const learning = getLearningData();
  const analytics = getAnalytics();
  
  if (!availableModels) {
    availableModels = getActiveModels();
  }

  const taskPerformance = learning.taskModelPerformance[taskType];
  
  if (!taskPerformance || Object.keys(taskPerformance).length === 0) {
    // Fallback to analytics-based recommendation
    return getBestModelForTask(taskType);
  }

  // Score each available model
  const scores = availableModels.map(model => {
    const perf = taskPerformance[model.id];
    if (!perf || perf.attempts === 0) {
      return {
        model,
        score: 0,
        reason: 'No performance data for this task type'
      };
    }

    // Calculate composite score
    const successRate = perf.successes / perf.attempts;
    const qualityScore = perf.avgQualityScore / 100; // Normalize to 0-1
    const speedScore = perf.avgResponseTime > 0 
      ? Math.max(0, 1 - (perf.avgResponseTime / 30000)) // Faster is better, max 30s
      : 0.5;
    const costScore = perf.avgCost > 0
      ? Math.max(0, 1 - (perf.avgCost / 0.1)) // Lower cost is better, max $0.1
      : 0.5;

    // Weighted composite score
    const compositeScore = (
      successRate * 0.4 +
      qualityScore * 0.4 +
      speedScore * 0.1 +
      costScore * 0.1
    );

    // Confidence based on number of attempts
    const confidence = Math.min(1.0, perf.attempts / 10); // Full confidence after 10 attempts

    return {
      model,
      score: compositeScore * confidence,
      confidence,
      successRate,
      qualityScore,
      speedScore,
      costScore,
      attempts: perf.attempts,
      reason: `Success rate: ${(successRate * 100).toFixed(0)}%, Quality: ${(qualityScore * 100).toFixed(0)}%`
    };
  });

  // Sort by score
  scores.sort((a, b) => b.score - a.score);

  return scores[0] || null;
}

/**
 * Get model recommendations for a task
 * Combines learning data, analytics, and personality matching
 */
export function getModelRecommendations(task, taskType = null) {
  const analytics = getAnalytics();
  const availableModels = getActiveModels();
  
  // Infer task type if not provided
  if (!taskType) {
    taskType = inferTaskType(task);
  }

  // Get recommendations from multiple sources
  const recommendations = {
    byLearning: null,
    byAnalytics: null,
    byPersonality: null,
    combined: []
  };

  // 1. Learning-based recommendation
  recommendations.byLearning = getRecommendedModelForTask(taskType, availableModels);

  // 2. Analytics-based recommendation
  const analyticsBest = getBestModelForTask(taskType);
  if (analyticsBest) {
    const model = availableModels.find(m => m.id === analyticsBest.modelId);
    if (model) {
      recommendations.byAnalytics = {
        model,
        score: analyticsBest.avgQualityScore / 100,
        reason: `Best average quality score: ${analyticsBest.avgQualityScore.toFixed(1)}`
      };
    }
  }

  // 3. Personality-based recommendation
  const personalityMatches = matchTaskToPersonality(task, availableModels);
  if (personalityMatches.length > 0) {
    recommendations.byPersonality = personalityMatches[0];
  }

  // Combine recommendations with weights
  const modelScores = new Map();

  availableModels.forEach(model => {
    let score = 0;
    const reasons = [];

    // Learning weight: 0.5
    if (recommendations.byLearning && recommendations.byLearning.model.id === model.id) {
      score += 0.5 * recommendations.byLearning.score;
      reasons.push('Learned best performer');
    }

    // Analytics weight: 0.3
    if (recommendations.byAnalytics && recommendations.byAnalytics.model.id === model.id) {
      score += 0.3 * recommendations.byAnalytics.score;
      reasons.push('Best historical quality');
    }

    // Personality weight: 0.2
    const personalityMatch = personalityMatches.find(m => m.model.id === model.id);
    if (personalityMatch) {
      score += 0.2 * personalityMatch.score;
      reasons.push('Personality match');
    }

    modelScores.set(model.id, {
      model,
      score,
      reasons
    });
  });

  // Sort by combined score
  recommendations.combined = Array.from(modelScores.values())
    .sort((a, b) => b.score - a.score)
    .map((rec, index) => ({
      ...rec,
      rank: index + 1,
      recommendation: index === 0 ? 'Recommended' : index < 3 ? 'Good alternative' : 'Consider'
    }));

  return recommendations;
}

/**
 * Infer task type from task description
 */
export function inferTaskType(task) {
  const taskLower = task.toLowerCase();
  
  const taskTypes = {
    'coding': ['code', 'program', 'function', 'algorithm', 'debug', 'implement', 'script'],
    'analysis': ['analyze', 'analysis', 'evaluate', 'examine', 'assess', 'review'],
    'creative': ['creative', 'brainstorm', 'idea', 'imagine', 'design', 'invent'],
    'explanation': ['explain', 'describe', 'what is', 'how does', 'tell me about'],
    'writing': ['write', 'draft', 'essay', 'article', 'story', 'content'],
    'research': ['research', 'find', 'investigate', 'study', 'discover'],
    'planning': ['plan', 'strategy', 'roadmap', 'outline', 'steps'],
    'question': ['?', 'question', 'ask', 'wonder']
  };

  for (const [type, keywords] of Object.entries(taskTypes)) {
    if (keywords.some(keyword => taskLower.includes(keyword))) {
      return type;
    }
  }

  return 'general';
}

/**
 * Get model comparison for a task
 * Shows which models are best for different aspects
 */
export function getModelComparisonForTask(task, taskType = null) {
  if (!taskType) {
    taskType = inferTaskType(task);
  }

  const recommendations = getModelRecommendations(task, taskType);
  const allStats = getAllModelStats();
  const availableModels = getActiveModels();

  const comparison = availableModels.map(model => {
    const stats = allStats.find(s => s.modelId === model.id);
    const recommendation = recommendations.combined.find(r => r.model.id === model.id);
    const personality = getModelPersonality(model.id);

    return {
      model,
      recommendation: recommendation || { rank: 999, recommendation: 'Not recommended' },
      stats: stats ? {
        avgQualityScore: stats.avgQualityScore,
        avgResponseTime: stats.avgResponseTime,
        errorRate: stats.errorRate,
        totalInteractions: stats.totalInteractions
      } : null,
      personality: personality ? {
        type: personality.personalityType,
        traits: personality.traits
      } : null,
      taskPerformance: getTaskPerformanceForModel(model.id, taskType)
    };
  });

  return {
    task,
    taskType,
    comparison,
    bestOverall: recommendations.combined[0] || null,
    bestByCategory: {
      quality: comparison.sort((a, b) => 
        (b.stats?.avgQualityScore || 0) - (a.stats?.avgQualityScore || 0)
      )[0],
      speed: comparison.sort((a, b) => 
        (a.stats?.avgResponseTime || Infinity) - (b.stats?.avgResponseTime || Infinity)
      )[0],
      reliability: comparison.sort((a, b) => 
        (a.stats?.errorRate || 1) - (b.stats?.errorRate || 1)
      )[0]
    }
  };
}

/**
 * Get task performance for a specific model
 */
function getTaskPerformanceForModel(modelId, taskType) {
  const learning = getLearningData();
  const taskPerf = learning.taskModelPerformance[taskType];
  
  if (!taskPerf || !taskPerf[modelId]) {
    return null;
  }

  const perf = taskPerf[modelId];
  return {
    attempts: perf.attempts,
    successRate: perf.successes / perf.attempts,
    avgQualityScore: perf.avgQualityScore,
    avgResponseTime: perf.avgResponseTime,
    avgCost: perf.avgCost
  };
}

/**
 * Get learning insights
 * Shows what the system has learned
 */
export function getLearningInsights() {
  const learning = getLearningData();
  const taskPerformance = learning.taskModelPerformance;

  const insights = {
    totalTasksLearned: Object.keys(taskPerformance).length,
    totalLearningEvents: learning.learningHistory.length,
    topTasks: [],
    modelSpecializations: {}
  };

  // Find top tasks by learning activity
  const taskActivity = Object.entries(taskPerformance).map(([taskType, models]) => ({
    taskType,
    totalAttempts: Object.values(models).reduce((sum, m) => sum + m.attempts, 0),
    modelCount: Object.keys(models).length
  }));

  insights.topTasks = taskActivity
    .sort((a, b) => b.totalAttempts - a.totalAttempts)
    .slice(0, 10);

  // Find model specializations
  const modelSpecializations = {};
  Object.entries(taskPerformance).forEach(([taskType, models]) => {
    Object.entries(models).forEach(([modelId, perf]) => {
      if (!modelSpecializations[modelId]) {
        modelSpecializations[modelId] = [];
      }
      if (perf.attempts >= 3 && perf.successes / perf.attempts >= 0.7) {
        modelSpecializations[modelId].push({
          taskType,
          successRate: perf.successes / perf.attempts,
          avgQualityScore: perf.avgQualityScore
        });
      }
    });
  });

  insights.modelSpecializations = modelSpecializations;

  return insights;
}

/**
 * Clear learning data (for reset/testing)
 */
export function clearLearningData() {
  localStorage.removeItem(STORAGE_KEY);
  initLearning();
}

