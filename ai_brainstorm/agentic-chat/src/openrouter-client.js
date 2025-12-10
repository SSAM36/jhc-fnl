// OpenRouter API Client
// Handles all communication with OpenRouter's unified API
// Supports both client-side and proxy modes

import { config } from './config.js';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

// System message to ensure concise but complete responses
const CONCISE_COMPLETE_SYSTEM_MESSAGE = `You must provide concise but complete responses. Be brief and direct while ensuring your answer fully addresses the question. Avoid unnecessary elaboration. Aim for 2-3 sentences that are complete and self-contained.`;

// Helper to inject concise-complete instruction into messages
function ensureConciseCompleteMessages(messages) {
  // Check if there's already a system message
  const hasSystemMessage = messages.some(msg => msg.role === 'system');
  
  if (hasSystemMessage) {
    // If system message exists, prepend our instruction to it
    return messages.map(msg => {
      if (msg.role === 'system') {
        return {
          ...msg,
          content: `${CONCISE_COMPLETE_SYSTEM_MESSAGE}\n\n${msg.content}`
        };
      }
      return msg;
    });
  } else {
    // Add system message at the beginning
    return [
      { role: 'system', content: CONCISE_COMPLETE_SYSTEM_MESSAGE },
      ...messages
    ];
  }
}

// Check if response was truncated
function isTruncated(response) {
  try {
    const finishReason = response.choices?.[0]?.finish_reason;
    return finishReason === 'length';
  } catch (error) {
    return false;
  }
}

// Create a retry prompt for truncated responses
function createRetryPrompt(originalMessages) {
  // Find the last user message (might not be the last message in array)
  let lastUserIndex = -1;
  for (let i = originalMessages.length - 1; i >= 0; i--) {
    if (originalMessages[i].role === 'user') {
      lastUserIndex = i;
      break;
    }
  }
  
  if (lastUserIndex === -1) {
    // No user message found, return original
    return originalMessages;
  }
  
  // Create a new message array with enhanced concise instruction
  const retryMessages = [...originalMessages];
  const lastUserMessage = retryMessages[lastUserIndex];
  
  // Enhance the last user message with explicit concise instruction
  retryMessages[lastUserIndex] = {
    role: 'user',
    content: `${lastUserMessage.content}\n\nIMPORTANT: Provide a concise but complete answer in 2-3 sentences. Be brief but ensure your response fully addresses the question.`
  };
  
  return retryMessages;
}

// Send chat completion request to OpenRouter with automatic truncation handling
export async function sendChatCompletion(modelId, messages, apiKey, options = {}) {
  // In proxy mode, API key is not required (handled server-side)
  if (!config.useProxy && !apiKey) {
    throw new Error('API key is required');
  }

  // Ensure messages have concise-complete instruction
  let processedMessages = ensureConciseCompleteMessages(messages);
  const maxRetries = 2; // Maximum retries for truncated responses
  let retryCount = 0;

  while (retryCount <= maxRetries) {
    const requestBody = {
      model: modelId,
      messages: processedMessages,
      max_tokens: 200, // Default to 200 tokens (enough for 2-3 lines) to minimize credit usage
      ...options // Allow override via options
    };

    // Determine endpoint and headers based on mode
    const endpoint = config.useProxy 
      ? '/api/chat' 
      : `${OPENROUTER_BASE_URL}/chat/completions`;
    
    const headers = {
      'Content-Type': 'application/json'
    };
    
    // Add authorization and referer headers only in client-side mode
    if (!config.useProxy) {
      headers['Authorization'] = `Bearer ${apiKey}`;
      headers['HTTP-Referer'] = window.location.origin;
      headers['X-Title'] = 'AI Brainstorm';
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        // Handle rate limit errors in proxy mode
        if (response.status === 429 && errorData.retryAfter) {
          throw new Error(`Rate limit exceeded. Please try again in ${errorData.retryAfter} seconds.`);
        }
        
        throw new Error(errorData.error?.message || errorData.error || `API request failed: ${response.status}`);
      }

      const data = await response.json();
      
      // Check if response was truncated
      if (isTruncated(data) && retryCount < maxRetries) {
        // Retry with a more explicit concise prompt
        processedMessages = createRetryPrompt(processedMessages);
        retryCount++;
        continue; // Retry the request
      }
      
      return data;
    } catch (error) {
      // If it's not a truncation retry, throw immediately
      if (retryCount === 0 || !error.message.includes('TRUNCATED')) {
        console.error('OpenRouter API error:', error);
        throw error;
      }
      // If retry failed, throw the error
      throw error;
    }
  }
  
  // If we exhausted retries, make one final attempt and return whatever we get
  const requestBody = {
    model: modelId,
    messages: processedMessages,
    max_tokens: 200,
    ...options
  };
  
  const endpoint = config.useProxy 
    ? '/api/chat' 
    : `${OPENROUTER_BASE_URL}/chat/completions`;
  
  const headers = {
    'Content-Type': 'application/json'
  };
  
  if (!config.useProxy) {
    headers['Authorization'] = `Bearer ${apiKey}`;
    headers['HTTP-Referer'] = window.location.origin;
    headers['X-Title'] = 'AI Brainstorm';
  }
  
  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody)
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || errorData.error || `API request failed: ${response.status}`);
  }
  
  return await response.json();
}

// Extract message content from OpenRouter response
export function extractMessageContent(response) {
  try {
    return response.choices[0]?.message?.content || '';
  } catch (error) {
    console.error('Failed to extract message content:', error);
    return '';
  }
}

// Send streaming chat completion request to OpenRouter with automatic truncation handling
export async function sendStreamingChatCompletion(modelId, messages, apiKey, onChunk, options = {}) {
  // In proxy mode, API key is not required (handled server-side)
  if (!config.useProxy && !apiKey) {
    throw new Error('API key is required');
  }

  // Ensure messages have concise-complete instruction
  let processedMessages = ensureConciseCompleteMessages(messages);
  const maxRetries = 2; // Maximum retries for truncated responses
  let retryCount = 0;

  while (retryCount <= maxRetries) {
    const requestBody = {
      model: modelId,
      messages: processedMessages,
      stream: true,
      max_tokens: 200, // Default to 200 tokens (enough for 2-3 lines) to minimize credit usage
      ...options // Allow override via options
    };

    // Determine endpoint and headers based on mode
    const endpoint = config.useProxy 
      ? '/api/chat' 
      : `${OPENROUTER_BASE_URL}/chat/completions`;
    
    const headers = {
      'Content-Type': 'application/json'
    };
    
    // Add authorization and referer headers only in client-side mode
    if (!config.useProxy) {
      headers['Authorization'] = `Bearer ${apiKey}`;
      headers['HTTP-Referer'] = window.location.origin;
      headers['X-Title'] = 'AI Brainstorm';
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        // Handle rate limit errors in proxy mode
        if (response.status === 429 && errorData.retryAfter) {
          throw new Error(`Rate limit exceeded. Please try again in ${errorData.retryAfter} seconds.`);
        }
        
        throw new Error(errorData.error?.message || errorData.error || `API request failed: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let wasTruncated = false;
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine || trimmedLine === 'data: [DONE]') continue;
          
          if (trimmedLine.startsWith('data: ')) {
            try {
              const jsonStr = trimmedLine.slice(6);
              const data = JSON.parse(jsonStr);
              const content = data.choices[0]?.delta?.content;
              
              // Check for truncation in streaming response
              const finishReason = data.choices[0]?.finish_reason;
              if (finishReason === 'length') {
                wasTruncated = true;
              }
              
              if (content) {
                fullContent += content;
                onChunk(content);
              }
            } catch (error) {
              console.error('Error parsing streaming chunk:', error);
            }
          }
        }
      }
      
      // If truncated and we haven't exhausted retries, retry with non-streaming to get complete response
      if (wasTruncated && retryCount < maxRetries) {
        processedMessages = createRetryPrompt(processedMessages);
        retryCount++;
        
        // Fall back to non-streaming for retry to ensure complete response
        const retryOptions = { ...options };
        delete retryOptions.stream; // Remove stream option for retry
        
        const retryResponse = await sendChatCompletion(modelId, processedMessages, apiKey, retryOptions);
        const retryContent = extractMessageContent(retryResponse);
        
        // Send the complete retry response to ensure caller gets full content
        // The retry response is complete and concise, so we send it entirely
        // Caller's accumulation will handle it (may result in partial + complete, but complete is better than truncated)
        if (retryContent && retryContent.trim()) {
          // Check if retry content starts with what we already sent
          if (retryContent.startsWith(fullContent.trim())) {
            // Retry is continuation - send only the new part
            const newContent = retryContent.slice(fullContent.trim().length);
            if (newContent.trim()) {
              onChunk(newContent);
            }
          } else {
            // Retry is a different/better response - send it completely
            // This ensures the caller gets the complete, concise response
            onChunk(retryContent);
          }
        }
        
        return; // Return after successful retry
      }
      
      // If we got here, either it wasn't truncated or we've exhausted retries
      return;
    } catch (error) {
      // If it's not a truncation retry, throw immediately
      if (retryCount === 0 || !error.message.includes('TRUNCATED')) {
        console.error('OpenRouter streaming API error:', error);
        throw error;
      }
      // If retry failed, throw the error
      throw error;
    }
  }
}
