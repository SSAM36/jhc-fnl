// Conversation Export/Import
// Export conversations to JSON, Markdown, PDF, and shareable links

import { getAllConversations, getCurrentConversation } from './conversation-manager.js';
import { getAllAgentChats, getAgentHistory } from './conversation-manager.js';
import { getAllSessions, getCurrentSessionId } from './session-manager.js';

/**
 * Export conversation to JSON
 * @param {string} conversationId - Conversation ID to export (null for all)
 * @returns {string} JSON string
 */
export function exportConversationJSON(conversationId = null) {
  const conversations = getAllConversations();
  const sessions = getAllSessions();
  const currentSessionId = getCurrentSessionId();
  
  let data;
  
  if (conversationId) {
    const conversation = conversations.find(c => c.id === conversationId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }
    data = {
      type: 'single_conversation',
      version: '1.0',
      exportedAt: new Date().toISOString(),
      conversation
    };
  } else {
    data = {
      type: 'full_export',
      version: '1.0',
      exportedAt: new Date().toISOString(),
      sessions,
      currentSessionId,
      conversations,
      agentChats: getAllAgentChats()
    };
  }
  
  return JSON.stringify(data, null, 2);
}

/**
 * Export conversation to Markdown
 * @param {string} conversationId - Conversation ID to export
 * @returns {string} Markdown string
 */
export function exportConversationMarkdown(conversationId) {
  const conversations = getAllConversations();
  const conversation = conversations.find(c => c.id === conversationId);
  
  if (!conversation) {
    throw new Error('Conversation not found');
  }
  
  let markdown = `# Conversation: ${conversation.modelName}\n\n`;
  markdown += `**Model:** ${conversation.modelName} (${conversation.modelId})\n`;
  markdown += `**Exported:** ${new Date().toLocaleString()}\n\n`;
  markdown += `---\n\n`;
  
  conversation.history.forEach((message, index) => {
    const role = message.role === 'user' 
      ? (message.source === 'agent' ? 'Agent' : 'User')
      : conversation.modelName;
    
    markdown += `## Message ${index + 1}: ${role}\n\n`;
    markdown += `${message.content}\n\n`;
    markdown += `---\n\n`;
  });
  
  return markdown;
}

/**
 * Export all conversations to Markdown
 * @returns {string} Markdown string
 */
export function exportAllConversationsMarkdown() {
  const conversations = getAllConversations();
  const sessions = getAllSessions();
  const currentSessionId = getCurrentSessionId();
  
  let markdown = `# AI Brainstorm Export\n\n`;
  markdown += `**Exported:** ${new Date().toLocaleString()}\n`;
  markdown += `**Total Conversations:** ${conversations.length}\n\n`;
  markdown += `---\n\n`;
  
  // Group by session
  const conversationsBySession = {};
  conversations.forEach(conv => {
    // For now, just list all conversations
    const sessionId = 'default'; // TODO: Track session ID in conversations
    if (!conversationsBySession[sessionId]) {
      conversationsBySession[sessionId] = [];
    }
    conversationsBySession[sessionId].push(conv);
  });
  
  Object.entries(conversationsBySession).forEach(([sessionId, convs]) => {
    markdown += `## Session: ${sessionId}\n\n`;
    
    convs.forEach((conversation, index) => {
      markdown += `### Conversation ${index + 1}: ${conversation.modelName}\n\n`;
      markdown += `**Model:** ${conversation.modelName} (${conversation.modelId})\n\n`;
      
      conversation.history.forEach((message, msgIndex) => {
        const role = message.role === 'user' 
          ? (message.source === 'agent' ? 'Agent' : 'User')
          : conversation.modelName;
        
        markdown += `#### ${role}\n\n`;
        markdown += `${message.content}\n\n`;
      });
      
      markdown += `---\n\n`;
    });
  });
  
  return markdown;
}

/**
 * Export conversation to PDF (using browser print API)
 * @param {string} conversationId - Conversation ID to export
 */
export function exportConversationPDF(conversationId) {
  const markdown = exportConversationMarkdown(conversationId);
  
  // Create a temporary window with the content
  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Conversation Export</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          line-height: 1.6;
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
        }
        h1 { border-bottom: 2px solid #333; padding-bottom: 10px; }
        h2 { margin-top: 30px; color: #555; }
        pre { background: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto; }
        code { background: #f5f5f5; padding: 2px 4px; border-radius: 3px; }
        @media print {
          body { margin: 0; padding: 10px; }
        }
      </style>
    </head>
    <body>
      ${markdownToHtml(markdown)}
    </body>
    </html>
  `);
  printWindow.document.close();
  
  // Wait for content to load, then print
  setTimeout(() => {
    printWindow.print();
  }, 250);
}

/**
 * Convert markdown to HTML (simple implementation)
 */
function markdownToHtml(markdown) {
  return markdown
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^#### (.*$)/gim, '<h4>$1</h4>')
    .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/gim, '<em>$1</em>')
    .replace(/`(.*?)`/gim, '<code>$1</code>')
    .replace(/```([\s\S]*?)```/gim, '<pre><code>$1</code></pre>')
    .replace(/\n/g, '<br>');
}

/**
 * Create shareable link (base64 encoded JSON)
 * @param {string} conversationId - Conversation ID to share
 * @returns {string} Shareable URL
 */
export function createShareableLink(conversationId) {
  const json = exportConversationJSON(conversationId);
  const encoded = btoa(unescape(encodeURIComponent(json)));
  const baseUrl = window.location.origin + window.location.pathname;
  return `${baseUrl}?share=${encoded}`;
}

/**
 * Import conversation from JSON
 * @param {string} jsonString - JSON string to import
 * @returns {Object} Import result
 */
export function importConversationJSON(jsonString) {
  try {
    const data = JSON.parse(jsonString);
    
    if (data.type === 'single_conversation') {
      return {
        success: true,
        type: 'single',
        conversation: data.conversation,
        message: 'Conversation imported successfully'
      };
    } else if (data.type === 'full_export') {
      return {
        success: true,
        type: 'full',
        sessions: data.sessions || [],
        conversations: data.conversations || [],
        agentChats: data.agentChats || [],
        currentSessionId: data.currentSessionId,
        message: 'Full export imported successfully'
      };
    } else {
      return {
        success: false,
        message: 'Unknown export format'
      };
    }
  } catch (error) {
    return {
      success: false,
      message: `Import error: ${error.message}`
    };
  }
}

/**
 * Download file
 * @param {string} content - File content
 * @param {string} filename - Filename
 * @param {string} mimeType - MIME type
 */
export function downloadFile(content, filename, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export conversation with all options
 * @param {string} conversationId - Conversation ID (null for all)
 * @param {string} format - Format: 'json', 'markdown', 'pdf'
 */
export function exportConversation(conversationId = null, format = 'json') {
  try {
    let content, filename, mimeType;
    
    switch (format) {
      case 'json':
        content = exportConversationJSON(conversationId);
        filename = conversationId 
          ? `conversation-${conversationId}.json`
          : `ai-brainstorm-export-${Date.now()}.json`;
        mimeType = 'application/json';
        break;
      
      case 'markdown':
        if (conversationId) {
          content = exportConversationMarkdown(conversationId);
          filename = `conversation-${conversationId}.md`;
        } else {
          content = exportAllConversationsMarkdown();
          filename = `ai-brainstorm-export-${Date.now()}.md`;
        }
        mimeType = 'text/markdown';
        break;
      
      case 'pdf':
        if (!conversationId) {
          throw new Error('PDF export requires a specific conversation');
        }
        exportConversationPDF(conversationId);
        return; // PDF uses print dialog, no download
      
      default:
        throw new Error(`Unknown format: ${format}`);
    }
    
    downloadFile(content, filename, mimeType);
    
    return {
      success: true,
      message: `Exported to ${format}`
    };
  } catch (error) {
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * Load shared conversation from URL
 * @returns {Object|null} Conversation data or null
 */
export function loadSharedConversation() {
  const urlParams = new URLSearchParams(window.location.search);
  const shareParam = urlParams.get('share');
  
  if (!shareParam) {
    return null;
  }
  
  try {
    const decoded = decodeURIComponent(escape(atob(shareParam)));
    const result = importConversationJSON(decoded);
    return result.success ? result : null;
  } catch (error) {
    console.error('Error loading shared conversation:', error);
    return null;
  }
}

