// Specialized Agent Types
// Implements Planner, Researcher, Coder, and Critic agents

import { sendChatCompletion, extractMessageContent } from './openrouter-client.js';
import { loadApiKey } from './api-key-manager.js';
import { getAgentModel } from './agent-model-manager.js';

/**
 * Planner Agent
 * Breaks down complex tasks into smaller, manageable steps
 */
export class PlannerAgent {
  constructor(modelId = null) {
    this.modelId = modelId || getAgentModel();
    this.role = 'planner';
    this.name = 'Planner';
  }

  async planTask(task, context = {}) {
    const apiKey = loadApiKey();
    if (!apiKey) {
      throw new Error('API key not configured');
    }

    const systemPrompt = `You are a Planner Agent specialized in breaking down complex tasks into clear, actionable steps.

Your role:
- Analyze complex tasks and break them into smaller, manageable sub-tasks
- Identify dependencies between steps
- Estimate effort and resources needed
- Suggest optimal execution order
- Consider potential risks and mitigation strategies

Provide structured, actionable plans that can be executed step-by-step.`;

    const userPrompt = `Task: ${task}

${context.additionalInfo ? `Additional Context: ${context.additionalInfo}` : ''}

Please create a detailed plan breaking this task into actionable steps. Include:
1. Main steps (numbered)
2. Dependencies between steps
3. Estimated effort/complexity for each step
4. Recommended execution order
5. Potential risks or challenges`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    try {
      const response = await sendChatCompletion(this.modelId, messages, apiKey);
      const content = extractMessageContent(response);
      
      return {
        agent: this.name,
        role: this.role,
        plan: content,
        steps: this.parsePlanSteps(content)
      };
    } catch (error) {
      console.error('Planner agent error:', error);
      throw error;
    }
  }

  parsePlanSteps(planText) {
    // Extract numbered steps from plan
    const stepPattern = /(\d+)\.\s+([^\n]+(?:\n(?!\d+\.)[^\n]+)*)/g;
    const steps = [];
    let match;
    
    while ((match = stepPattern.exec(planText)) !== null) {
      steps.push({
        number: parseInt(match[1]),
        description: match[2].trim()
      });
    }
    
    return steps.length > 0 ? steps : [{ number: 1, description: planText }];
  }
}

/**
 * Researcher Agent
 * Gathers information from multiple models and synthesizes findings
 */
export class ResearcherAgent {
  constructor(modelId = null) {
    this.modelId = modelId || getAgentModel();
    this.role = 'researcher';
    this.name = 'Researcher';
  }

  async researchTopic(topic, models = [], depth = 'standard') {
    const apiKey = loadApiKey();
    if (!apiKey) {
      throw new Error('API key not configured');
    }

    if (models.length === 0) {
      throw new Error('Researcher requires at least one model to query');
    }

    const systemPrompt = `You are a Researcher Agent specialized in gathering and synthesizing information from multiple sources.

Your role:
- Formulate effective research questions
- Analyze information from multiple perspectives
- Identify key insights and patterns
- Synthesize findings into coherent summaries
- Highlight areas of consensus and disagreement
- Note gaps in information or areas needing further research`;

    const researchPrompt = `Research Topic: ${topic}

Research Depth: ${depth}

Please:
1. Break down this topic into key research questions
2. Identify what information would be most valuable
3. Suggest how to approach gathering information from multiple models
4. Outline what a comprehensive research synthesis should include`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: researchPrompt }
    ];

    try {
      const response = await sendChatCompletion(this.modelId, messages, apiKey);
      const content = extractMessageContent(response);
      
      return {
        agent: this.name,
        role: this.role,
        researchPlan: content,
        questions: this.extractQuestions(content),
        modelsToQuery: models
      };
    } catch (error) {
      console.error('Researcher agent error:', error);
      throw error;
    }
  }

  async synthesizeFindings(findings, topic) {
    const apiKey = loadApiKey();
    if (!apiKey) {
      throw new Error('API key not configured');
    }

    const findingsText = findings.map((f, i) => 
      `Source ${i + 1} (${f.modelName || 'Unknown'}):\n${f.content}`
    ).join('\n\n');

    const systemPrompt = `You are a Researcher Agent specialized in synthesizing information from multiple sources.

Your role:
- Combine insights from multiple sources
- Identify common themes and patterns
- Highlight unique perspectives
- Note contradictions or areas of disagreement
- Create a comprehensive, well-organized synthesis`;

    const synthesisPrompt = `Research Topic: ${topic}

Findings from multiple sources:

${findingsText}

Please synthesize these findings into a comprehensive research summary. Include:
1. Key insights and main points
2. Areas of consensus
3. Areas of disagreement or different perspectives
4. Gaps or areas needing further research
5. Overall conclusions`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: synthesisPrompt }
    ];

    try {
      const response = await sendChatCompletion(this.modelId, messages, apiKey);
      const content = extractMessageContent(response);
      
      return {
        agent: this.name,
        role: this.role,
        synthesis: content,
        sourceCount: findings.length
      };
    } catch (error) {
      console.error('Researcher synthesis error:', error);
      throw error;
    }
  }

  extractQuestions(text) {
    const questionPattern = /\d+\.\s*([^?\n]+\?)/g;
    const questions = [];
    let match;
    
    while ((match = questionPattern.exec(text)) !== null) {
      questions.push(match[1].trim());
    }
    
    return questions;
  }
}

/**
 * Coder Agent
 * Specialized for code-related tasks
 */
export class CoderAgent {
  constructor(modelId = null) {
    this.modelId = modelId || getAgentModel();
    this.role = 'coder';
    this.name = 'Coder';
  }

  async codeTask(requirement, language = 'auto', context = {}) {
    const apiKey = loadApiKey();
    if (!apiKey) {
      throw new Error('API key not configured');
    }

    const systemPrompt = `You are a Coder Agent specialized in writing, reviewing, and debugging code.

Your role:
- Write clean, efficient, well-documented code
- Follow best practices and coding standards
- Consider edge cases and error handling
- Write testable, maintainable code
- Provide clear explanations of your code
- Suggest optimizations and improvements`;

    const codePrompt = `Coding Requirement: ${requirement}

${language !== 'auto' ? `Preferred Language: ${language}` : 'Language: Auto-detect based on requirement'}

${context.existingCode ? `Existing Code Context:\n${context.existingCode}` : ''}
${context.specificRequirements ? `Specific Requirements:\n${context.specificRequirements}` : ''}

Please:
1. Analyze the requirement
2. Write the code solution
3. Explain your approach
4. Note any assumptions or considerations
5. Suggest testing strategies`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: codePrompt }
    ];

    try {
      const response = await sendChatCompletion(this.modelId, messages, apiKey);
      const content = extractMessageContent(response);
      
      return {
        agent: this.name,
        role: this.role,
        code: content,
        codeBlocks: this.extractCodeBlocks(content),
        language: this.detectLanguage(content)
      };
    } catch (error) {
      console.error('Coder agent error:', error);
      throw error;
    }
  }

  async reviewCode(code, language = 'auto') {
    const apiKey = loadApiKey();
    if (!apiKey) {
      throw new Error('API key not configured');
    }

    const systemPrompt = `You are a Coder Agent specialized in code review.

Your role:
- Review code for correctness, efficiency, and best practices
- Identify bugs, potential issues, and security concerns
- Suggest improvements and optimizations
- Check code style and documentation
- Provide constructive, actionable feedback`;

    const reviewPrompt = `Please review the following code:

\`\`\`${language !== 'auto' ? language : ''}
${code}
\`\`\`

Provide a comprehensive code review including:
1. Overall assessment
2. Bugs or issues found
3. Code quality and best practices
4. Performance considerations
5. Security concerns
6. Suggestions for improvement`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: reviewPrompt }
    ];

    try {
      const response = await sendChatCompletion(this.modelId, messages, apiKey);
      const content = extractMessageContent(response);
      
      return {
        agent: this.name,
        role: this.role,
        review: content,
        issues: this.extractIssues(content),
        suggestions: this.extractSuggestions(content)
      };
    } catch (error) {
      console.error('Code review error:', error);
      throw error;
    }
  }

  extractCodeBlocks(text) {
    const codeBlockPattern = /```(?:\w+)?\n([\s\S]*?)```/g;
    const blocks = [];
    let match;
    
    while ((match = codeBlockPattern.exec(text)) !== null) {
      blocks.push(match[1].trim());
    }
    
    return blocks;
  }

  detectLanguage(text) {
    const languagePatterns = {
      'javascript': /(function|const|let|var|=>|\.js)/i,
      'python': /(def |import |print\(|\.py)/i,
      'java': /(public class|import java|\.java)/i,
      'cpp': /(#include|using namespace|std::|\.cpp)/i,
      'html': /(<html|<div|<body|<!DOCTYPE)/i,
      'css': /({|}|@media|\.css)/i
    };
    
    for (const [lang, pattern] of Object.entries(languagePatterns)) {
      if (pattern.test(text)) {
        return lang;
      }
    }
    
    return 'unknown';
  }

  extractIssues(text) {
    const issuePattern = /(?:bug|issue|problem|error|concern)[:]\s*([^\n]+)/gi;
    const issues = [];
    let match;
    
    while ((match = issuePattern.exec(text)) !== null) {
      issues.push(match[1].trim());
    }
    
    return issues;
  }

  extractSuggestions(text) {
    const suggestionPattern = /(?:suggest|recommend|improve|optimize)[:]\s*([^\n]+)/gi;
    const suggestions = [];
    let match;
    
    while ((match = suggestionPattern.exec(text)) !== null) {
      suggestions.push(match[1].trim());
    }
    
    return suggestions;
  }
}

/**
 * Critic Agent
 * Evaluates and critiques responses, code, and solutions
 */
export class CriticAgent {
  constructor(modelId = null) {
    this.modelId = modelId || getAgentModel();
    this.role = 'critic';
    this.name = 'Critic';
  }

  async critique(content, criteria = {}) {
    const apiKey = loadApiKey();
    if (!apiKey) {
      throw new Error('API key not configured');
    }

    const systemPrompt = `You are a Critic Agent specialized in evaluating and critiquing content.

Your role:
- Provide honest, constructive criticism
- Evaluate based on multiple criteria (accuracy, clarity, completeness, etc.)
- Identify strengths and weaknesses
- Suggest specific improvements
- Be thorough but fair in your assessment`;

    const criteriaList = Object.entries(criteria)
      .map(([key, value]) => `- ${key}: ${value}`)
      .join('\n');

    const critiquePrompt = `Please critique the following content:

${content}

${criteriaList ? `Evaluation Criteria:\n${criteriaList}` : 'Use standard evaluation criteria: accuracy, clarity, completeness, relevance, and quality.'}

Provide a comprehensive critique including:
1. Overall assessment
2. Strengths identified
3. Weaknesses or areas for improvement
4. Specific suggestions
5. Score/rating (if applicable)`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: critiquePrompt }
    ];

    try {
      const response = await sendChatCompletion(this.modelId, messages, apiKey);
      const content = extractMessageContent(response);
      
      return {
        agent: this.name,
        role: this.role,
        critique: content,
        strengths: this.extractStrengths(content),
        weaknesses: this.extractWeaknesses(content),
        score: this.extractScore(content)
      };
    } catch (error) {
      console.error('Critic agent error:', error);
      throw error;
    }
  }

  extractStrengths(text) {
    const strengthPattern = /(?:strength|good|excellent|strong|well)[:]\s*([^\n]+)/gi;
    const strengths = [];
    let match;
    
    while ((match = strengthPattern.exec(text)) !== null) {
      strengths.push(match[1].trim());
    }
    
    return strengths;
  }

  extractWeaknesses(text) {
    const weaknessPattern = /(?:weakness|improve|issue|problem|concern)[:]\s*([^\n]+)/gi;
    const weaknesses = [];
    let match;
    
    while ((match = weaknessPattern.exec(text)) !== null) {
      weaknesses.push(match[1].trim());
    }
    
    return weaknesses;
  }

  extractScore(text) {
    const scorePattern = /(?:score|rating|grade)[:]\s*(\d+(?:\.\d+)?)\s*(?:\/|\s*out of\s*)?(\d+)?/i;
    const match = text.match(scorePattern);
    
    if (match) {
      return {
        value: parseFloat(match[1]),
        max: match[2] ? parseFloat(match[2]) : 100
      };
    }
    
    return null;
  }
}

/**
 * Agent Factory
 * Creates specialized agents
 */
export function createAgent(agentType, modelId = null) {
  switch (agentType.toLowerCase()) {
    case 'planner':
      return new PlannerAgent(modelId);
    case 'researcher':
      return new ResearcherAgent(modelId);
    case 'coder':
      return new CoderAgent(modelId);
    case 'critic':
      return new CriticAgent(modelId);
    default:
      throw new Error(`Unknown agent type: ${agentType}`);
  }
}

/**
 * Get available agent types
 */
export function getAvailableAgentTypes() {
  return ['planner', 'researcher', 'coder', 'critic'];
}

