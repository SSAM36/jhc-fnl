// Model-to-Model Communication
// Allows models to query each other directly and build communication chains

import { sendChatCompletion, extractMessageContent } from './openrouter-client.js';
import { loadApiKey } from './api-key-manager.js';

/**
 * Model-to-Model Communication System
 * Enables models to query each other, request verification, clarification, etc.
 */
export class ModelCommunication {
  constructor() {
    this.communicationHistory = [];
  }

  /**
   * Have one model query another model
   * @param {string} queryingModelId - Model asking the question
   * @param {string} targetModelId - Model being queried
   * @param {string} query - The question/request
   * @param {string} context - Context about what to verify/check
   * @param {string} apiKey - API key
   * @returns {Object} Communication result
   */
  async queryModel(queryingModelId, targetModelId, query, context = '', apiKey = null) {
    if (!apiKey) {
      apiKey = loadApiKey();
    }
    if (!apiKey) {
      throw new Error('API key not configured');
    }

    const systemPrompt = `You are being queried by another AI model. Another model has a question or needs your input on something.

${context ? `Context: ${context}` : ''}

Please provide a helpful, accurate response to the other model's query.`;

    const userPrompt = `Another AI model is asking you:

${query}

${context ? `\nContext: ${context}` : ''}

Please respond helpfully and accurately.`;

    try {
      const response = await sendChatCompletion(targetModelId, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ], apiKey);

      const content = extractMessageContent(response);

      const communication = {
        id: `comm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        queryingModelId,
        targetModelId,
        query,
        context,
        response: content,
        type: 'query'
      };

      this.communicationHistory.push(communication);
      return communication;
    } catch (error) {
      console.error('Model communication error:', error);
      throw error;
    }
  }

  /**
   * Request verification from another model
   * @param {string} requestingModelId - Model requesting verification
   * @param {string} verifyingModelId - Model doing the verification
   * @param {string} content - Content to verify
   * @param {string} verificationType - Type of verification (accuracy, code, logic, etc.)
   * @param {string} apiKey - API key
   * @returns {Object} Verification result
   */
  async requestVerification(requestingModelId, verifyingModelId, content, verificationType = 'accuracy', apiKey = null) {
    if (!apiKey) {
      apiKey = loadApiKey();
    }
    if (!apiKey) {
      throw new Error('API key not configured');
    }

    const verificationPrompts = {
      accuracy: 'Please verify the accuracy of the following content. Check for factual errors, inconsistencies, or incorrect information.',
      code: 'Please review this code for correctness, bugs, and best practices. Check for syntax errors, logic errors, and potential issues.',
      logic: 'Please verify the logical reasoning in the following content. Check for logical fallacies, inconsistencies, or flawed arguments.',
      completeness: 'Please check if the following content is complete and covers all necessary aspects. Identify any gaps or missing information.'
    };

    const systemPrompt = `You are being asked to verify content from another AI model. Your role is to carefully check the content for ${verificationType}.

${verificationPrompts[verificationType] || verificationPrompts.accuracy}

Provide:
1. Overall assessment (accurate/inaccurate, correct/incorrect, etc.)
2. Specific issues found (if any)
3. Suggestions for improvement (if needed)
4. Confidence level in your verification`;

    const userPrompt = `Please verify the following content for ${verificationType}:

${content}

Provide your verification assessment.`;

    try {
      const response = await sendChatCompletion(verifyingModelId, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ], apiKey);

      const content = extractMessageContent(response);

      const communication = {
        id: `comm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        requestingModelId,
        verifyingModelId,
        content,
        verificationType,
        verification: content,
        type: 'verification'
      };

      this.communicationHistory.push(communication);
      return communication;
    } catch (error) {
      console.error('Verification error:', error);
      throw error;
    }
  }

  /**
   * Request clarification from another model
   * @param {string} requestingModelId - Model requesting clarification
   * @param {string} clarifyingModelId - Model providing clarification
   * @param {string} unclearContent - Content that needs clarification
   * @param {string} question - Specific question about the content
   * @param {string} apiKey - API key
   * @returns {Object} Clarification result
   */
  async requestClarification(requestingModelId, clarifyingModelId, unclearContent, question, apiKey = null) {
    if (!apiKey) {
      apiKey = loadApiKey();
    }
    if (!apiKey) {
      throw new Error('API key not configured');
    }

    const systemPrompt = `Another AI model is asking for clarification about content. Please provide a clear, helpful explanation.`;

    const userPrompt = `Another model has a question about the following content:

${unclearContent}

Question: ${question}

Please provide clarification.`;

    try {
      const response = await sendChatCompletion(clarifyingModelId, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ], apiKey);

      const content = extractMessageContent(response);

      const communication = {
        id: `comm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        requestingModelId,
        clarifyingModelId,
        unclearContent,
        question,
        clarification: content,
        type: 'clarification'
      };

      this.communicationHistory.push(communication);
      return communication;
    } catch (error) {
      console.error('Clarification error:', error);
      throw error;
    }
  }

  /**
   * Build a communication chain (model A -> model B -> model C)
   * @param {Array} chain - Array of {modelId, action, content}
   * @param {string} apiKey - API key
   * @returns {Array} Chain of communications
   */
  async buildCommunicationChain(chain, apiKey = null) {
    if (!apiKey) {
      apiKey = loadApiKey();
    }
    if (!apiKey) {
      throw new Error('API key not configured');
    }

    const results = [];
    let previousResponse = null;

    for (let i = 0; i < chain.length; i++) {
      const step = chain[i];
      const { modelId, action, content, query } = step;

      let result;
      const context = previousResponse ? `Previous step result: ${previousResponse.response || previousResponse}` : '';

      switch (action) {
        case 'query':
          result = await this.queryModel(
            i > 0 ? chain[i - 1].modelId : modelId,
            modelId,
            query || content,
            context,
            apiKey
          );
          break;
        case 'verify':
          result = await this.requestVerification(
            i > 0 ? chain[i - 1].modelId : modelId,
            modelId,
            content || previousResponse?.response,
            step.verificationType || 'accuracy',
            apiKey
          );
          break;
        case 'clarify':
          result = await this.requestClarification(
            i > 0 ? chain[i - 1].modelId : modelId,
            modelId,
            content || previousResponse?.response,
            step.question || 'Can you clarify this?',
            apiKey
          );
          break;
        default:
          throw new Error(`Unknown action: ${action}`);
      }

      results.push(result);
      previousResponse = result;
    }

    return results;
  }

  /**
   * Get communication history
   */
  getHistory() {
    return [...this.communicationHistory];
  }

  /**
   * Clear communication history
   */
  clearHistory() {
    this.communicationHistory = [];
  }
}

// Consensus Voting System
export class ConsensusVoting {
  constructor() {
    this.votes = [];
    this.discussions = [];
  }

  /**
   * Collect votes from multiple models
   * @param {Array} models - Array of {modelId, modelName}
   * @param {string} question - Question to vote on
   * @param {Array} options - Voting options
   * @param {string} apiKey - API key
   * @returns {Object} Voting results
   */
  async collectVotes(models, question, options, apiKey = null) {
    if (!apiKey) {
      apiKey = loadApiKey();
    }
    if (!apiKey) {
      throw new Error('API key not configured');
    }

    const systemPrompt = `You are participating in a democratic voting process with other AI models.

Question: ${question}

Options:
${options.map((opt, i) => `${i + 1}. ${opt}`).join('\n')}

Please:
1. Consider each option carefully
2. Vote for the option you think is best
3. Provide a brief explanation for your vote
4. Indicate your confidence level (HIGH, MEDIUM, LOW)

Format your response as:
VOTE: [option number]
CONFIDENCE: [HIGH/MEDIUM/LOW]
REASON: [your explanation]`;

    const userPrompt = `Please vote on the following question:

${question}

Options:
${options.map((opt, i) => `${i + 1}. ${opt}`).join('\n')}

Provide your vote, confidence, and reasoning.`;

    const votePromises = models.map(async (model) => {
      try {
        const response = await sendChatCompletion(model.modelId, [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ], apiKey);

        const content = extractMessageContent(response);
        const parsed = this.parseVote(content, options);

        return {
          modelId: model.modelId,
          modelName: model.modelName,
          vote: parsed.vote,
          option: parsed.option,
          confidence: parsed.confidence,
          reason: parsed.reason,
          rawResponse: content
        };
      } catch (error) {
        console.error(`Error getting vote from ${model.modelName}:`, error);
        return {
          modelId: model.modelId,
          modelName: model.modelName,
          vote: null,
          error: error.message
        };
      }
    });

    const votes = await Promise.all(votePromises);
    this.votes.push({
      id: `vote_${Date.now()}`,
      timestamp: Date.now(),
      question,
      options,
      votes
    });

    return this.calculateResults(question, options, votes);
  }

  /**
   * Parse vote from model response
   */
  parseVote(text, options) {
    const voteMatch = text.match(/VOTE:\s*(\d+)/i);
    const confidenceMatch = text.match(/CONFIDENCE:\s*(HIGH|MEDIUM|LOW)/i);
    const reasonMatch = text.match(/REASON:\s*([^\n]+(?:\n(?!VOTE|CONFIDENCE)[^\n]+)*)/i);

    let vote = null;
    let option = null;

    if (voteMatch) {
      vote = parseInt(voteMatch[1]) - 1;
      if (vote >= 0 && vote < options.length) {
        option = options[vote];
      }
    } else {
      // Fallback: try to find option number in text
      for (let i = 0; i < options.length; i++) {
        if (text.includes(`option ${i + 1}`) || text.includes(`option${i + 1}`)) {
          vote = i;
          option = options[i];
          break;
        }
      }
    }

    return {
      vote,
      option,
      confidence: confidenceMatch ? confidenceMatch[1].toUpperCase() : 'MEDIUM',
      reason: reasonMatch ? reasonMatch[1].trim() : 'No reason provided'
    };
  }

  /**
   * Calculate voting results with weighted aggregation
   */
  calculateResults(question, options, votes) {
    const optionCounts = {};
    const optionWeights = {};
    const confidenceWeights = { HIGH: 1.0, MEDIUM: 0.7, LOW: 0.4 };

    options.forEach(opt => {
      optionCounts[opt] = 0;
      optionWeights[opt] = 0;
    });

    votes.forEach(vote => {
      if (vote.vote !== null && vote.option) {
        optionCounts[vote.option]++;
        const weight = confidenceWeights[vote.confidence] || 0.7;
        optionWeights[vote.option] += weight;
      }
    });

    // Find winner
    const winner = Object.entries(optionWeights)
      .sort((a, b) => b[1] - a[1])[0];

    const consensus = winner[1] / votes.filter(v => v.vote !== null).length;

    return {
      question,
      options,
      votes,
      results: {
        optionCounts,
        optionWeights,
        winner: winner[0],
        winnerWeight: winner[1],
        consensus: Math.round(consensus * 100) / 100,
        totalVotes: votes.filter(v => v.vote !== null).length
      }
    };
  }

  /**
   * Iterative consensus building - models can change votes after discussion
   */
  async buildConsensus(models, question, options, maxRounds = 3, apiKey = null) {
    if (!apiKey) {
      apiKey = loadApiKey();
    }
    if (!apiKey) {
      throw new Error('API key not configured');
    }

    let currentVotes = null;
    let round = 0;

    while (round < maxRounds) {
      // Collect votes
      if (round === 0) {
        currentVotes = await this.collectVotes(models, question, options, apiKey);
      } else {
        // Show previous round results and allow vote changes
        const previousResults = currentVotes.results;
        const discussionPrompt = `Previous voting round results:
Winner: ${previousResults.winner} (${previousResults.winnerWeight.toFixed(2)} weighted votes)
Consensus: ${(previousResults.consensus * 100).toFixed(0)}%

Other models' votes and reasons:
${currentVotes.votes.map(v => 
  `- ${v.modelName}: Voted for ${v.option} (${v.confidence} confidence) - ${v.reason}`
).join('\n')}

You can change your vote based on the discussion. Provide your updated vote.`;

        currentVotes = await this.collectVotes(models, question, options, apiKey);
      }

      // Check if consensus reached (80%+ agreement)
      if (currentVotes.results.consensus >= 0.8) {
        break;
      }

      round++;
    }

    return {
      finalResults: currentVotes,
      rounds: round + 1,
      consensusReached: currentVotes.results.consensus >= 0.8
    };
  }

  /**
   * Get voting history
   */
  getHistory() {
    return [...this.votes];
  }
}

