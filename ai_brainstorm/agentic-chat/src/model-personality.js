// Model Personality Profiling
// Analyzes response patterns to build personality profiles for each model

import { getAnalytics, getModelInteractions } from './model-analytics.js';

const STORAGE_KEY = 'model_personalities';

// Initialize personality storage
function initPersonalities() {
  if (!localStorage.getItem(STORAGE_KEY)) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({}));
  }
}

// Get all personality profiles
export function getAllPersonalities() {
  initPersonalities();
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
}

// Get personality for a specific model
export function getModelPersonality(modelId) {
  const personalities = getAllPersonalities();
  return personalities[modelId] || null;
}

// Analyze response to extract personality traits
export function analyzeResponseForPersonality(response, metadata = {}) {
  const traits = {
    length: response.length,
    technical: 0,
    creative: 0,
    concise: 0,
    detailed: 0,
    structured: 0,
    conversational: 0,
    formal: 0,
    questionCount: 0,
    explanationCount: 0,
    codeBlocks: 0,
    lists: 0
  };

  // Length analysis
  if (traits.length < 100) traits.concise = 1;
  if (traits.length > 500) traits.detailed = 1;

  // Technical indicators
  const technicalKeywords = ['function', 'algorithm', 'implementation', 'optimize', 'complexity', 'API', 'framework'];
  technicalKeywords.forEach(keyword => {
    if (response.toLowerCase().includes(keyword)) traits.technical += 0.1;
  });

  // Creative indicators
  const creativeKeywords = ['creative', 'innovative', 'imagine', 'explore', 'brainstorm', 'unique', 'novel'];
  creativeKeywords.forEach(keyword => {
    if (response.toLowerCase().includes(keyword)) traits.creative += 0.1;
  });

  // Structure indicators
  if (response.includes('\n\n') || response.includes('\n-') || response.includes('\n1.')) {
    traits.structured = 1;
  }

  // Question count
  traits.questionCount = (response.match(/\?/g) || []).length;

  // Explanation indicators
  const explanationKeywords = ['because', 'since', 'therefore', 'thus', 'explain', 'reason'];
  explanationKeywords.forEach(keyword => {
    if (response.toLowerCase().includes(keyword)) traits.explanationCount += 0.1;
  });

  // Code blocks
  traits.codeBlocks = (response.match(/```/g) || []).length / 2;

  // Lists
  traits.lists = (response.match(/\n[-*]\s|\n\d+\.\s/g) || []).length;

  // Conversational vs formal
  const conversationalMarkers = ['!', '?', 'you', 'your', 'we', 'our'];
  const formalMarkers = ['therefore', 'furthermore', 'consequently', 'moreover'];
  const conversationalScore = conversationalMarkers.filter(m => 
    new RegExp(`\\b${m}\\b`, 'i').test(response)
  ).length;
  const formalScore = formalMarkers.filter(m => 
    new RegExp(`\\b${m}\\b`, 'i').test(response)
  ).length;
  
  traits.conversational = conversationalScore > formalScore ? 1 : 0;
  traits.formal = formalScore > conversationalScore ? 1 : 0;

  return traits;
}

// Update personality profile from interactions
export function updatePersonalityProfile(modelId, modelName) {
  initPersonalities();
  const analytics = getAnalytics();
  const interactions = getModelInteractions(modelId, 100); // Last 100 interactions
  
  if (interactions.length === 0) {
    return null;
  }

  // Analyze all interactions
  const traitScores = {
    technical: [],
    creative: [],
    concise: [],
    detailed: [],
    structured: [],
    conversational: [],
    formal: [],
    avgLength: [],
    avgQuestions: [],
    avgCodeBlocks: [],
    avgLists: []
  };

  interactions.forEach(interaction => {
    if (!interaction.responseLength && !interaction.content) return;
    
    const response = interaction.content || '';
    const traits = analyzeResponseForPersonality(response, interaction);
    
    traitScores.technical.push(traits.technical);
    traitScores.creative.push(traits.creative);
    traitScores.concise.push(traits.concise);
    traitScores.detailed.push(traits.detailed);
    traitScores.structured.push(traits.structured);
    traitScores.conversational.push(traits.conversational);
    traitScores.formal.push(traits.formal);
    traitScores.avgLength.push(traits.length);
    traitScores.avgQuestions.push(traits.questionCount);
    traitScores.avgCodeBlocks.push(traits.codeBlocks);
    traitScores.avgLists.push(traits.lists);
  });

  // Calculate averages
  const avg = (arr) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  const personality = {
    modelId,
    modelName,
    lastUpdated: Date.now(),
    interactionCount: interactions.length,
    traits: {
      technical: avg(traitScores.technical),
      creative: avg(traitScores.creative),
      concise: avg(traitScores.concise) > 0.5,
      detailed: avg(traitScores.detailed) > 0.5,
      structured: avg(traitScores.structured) > 0.5,
      conversational: avg(traitScores.conversational) > 0.5,
      formal: avg(traitScores.formal) > 0.5
    },
    metrics: {
      avgLength: Math.round(avg(traitScores.avgLength)),
      avgQuestions: avg(traitScores.avgQuestions),
      avgCodeBlocks: avg(traitScores.avgCodeBlocks),
      avgLists: avg(traitScores.avgLists)
    },
    personalityType: determinePersonalityType({
      technical: avg(traitScores.technical),
      creative: avg(traitScores.creative),
      concise: avg(traitScores.concise),
      detailed: avg(traitScores.detailed),
      structured: avg(traitScores.structured),
      conversational: avg(traitScores.conversational),
      formal: avg(traitScores.formal)
    })
  };

  // Save personality
  const personalities = getAllPersonalities();
  personalities[modelId] = personality;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(personalities));

  return personality;
}

// Determine personality type from traits
function determinePersonalityType(traits) {
  const types = [];

  if (traits.technical > 0.5) types.push('Technical');
  if (traits.creative > 0.5) types.push('Creative');
  if (traits.detailed && !traits.concise) types.push('Detailed');
  if (traits.concise && !traits.detailed) types.push('Concise');
  if (traits.structured) types.push('Structured');
  if (traits.conversational) types.push('Conversational');
  if (traits.formal) types.push('Formal');

  if (types.length === 0) {
    return 'Balanced';
  }

  return types.join(' / ');
}

// Get personality description
export function getPersonalityDescription(personality) {
  if (!personality) return 'No personality data available';

  const { traits, metrics, personalityType } = personality;
  const descriptions = [];

  descriptions.push(`Personality: ${personalityType}`);

  if (traits.technical > 0.5) {
    descriptions.push('Tends to provide technical, detailed explanations');
  }
  if (traits.creative > 0.5) {
    descriptions.push('Shows creative and innovative thinking');
  }
  if (traits.concise) {
    descriptions.push('Prefers concise, to-the-point responses');
  }
  if (traits.detailed) {
    descriptions.push('Provides detailed, comprehensive answers');
  }
  if (traits.structured) {
    descriptions.push('Organizes responses with clear structure');
  }
  if (traits.conversational) {
    descriptions.push('Uses conversational, friendly tone');
  }
  if (traits.formal) {
    descriptions.push('Uses formal, professional language');
  }

  descriptions.push(`Average response length: ${metrics.avgLength} characters`);
  if (metrics.avgCodeBlocks > 0.1) {
    descriptions.push('Frequently includes code examples');
  }
  if (metrics.avgLists > 0.5) {
    descriptions.push('Often uses lists to organize information');
  }

  return descriptions.join('. ') + '.';
}

// Match task to model personality
export function matchTaskToPersonality(task, availableModels) {
  const personalities = getAllPersonalities();
  const taskLower = task.toLowerCase();

  // Determine task requirements
  const taskNeeds = {
    technical: taskLower.includes('code') || taskLower.includes('algorithm') || taskLower.includes('technical'),
    creative: taskLower.includes('creative') || taskLower.includes('brainstorm') || taskLower.includes('idea'),
    detailed: taskLower.includes('explain') || taskLower.includes('detail') || taskLower.includes('comprehensive'),
    concise: taskLower.includes('brief') || taskLower.includes('quick') || taskLower.includes('summary')
  };

  // Score each model
  const scores = availableModels.map(model => {
    const personality = personalities[model.id] || null;
    if (!personality) return { model, score: 0.5, reason: 'No personality data' };

    let score = 0.5; // Base score
    const reasons = [];

    if (taskNeeds.technical && personality.traits.technical > 0.5) {
      score += 0.3;
      reasons.push('Technical expertise');
    }
    if (taskNeeds.creative && personality.traits.creative > 0.5) {
      score += 0.3;
      reasons.push('Creative thinking');
    }
    if (taskNeeds.detailed && personality.traits.detailed) {
      score += 0.2;
      reasons.push('Detailed responses');
    }
    if (taskNeeds.concise && personality.traits.concise) {
      score += 0.2;
      reasons.push('Concise style');
    }

    return {
      model,
      score: Math.min(1.0, score),
      reason: reasons.join(', ') || 'General match'
    };
  });

  // Sort by score
  scores.sort((a, b) => b.score - a.score);

  return scores;
}

// Get personality summary for display
export function getPersonalitySummary(modelId) {
  const personality = getModelPersonality(modelId);
  if (!personality) {
    return {
      type: 'Unknown',
      description: 'No personality data available. Use this model more to build a profile.',
      traits: []
    };
  }

  return {
    type: personality.personalityType,
    description: getPersonalityDescription(personality),
    traits: Object.entries(personality.traits)
      .filter(([_, value]) => typeof value === 'number' ? value > 0.3 : value)
      .map(([trait, value]) => ({
        trait,
        strength: typeof value === 'number' ? Math.round(value * 100) : (value ? 100 : 0)
      }))
  };
}

