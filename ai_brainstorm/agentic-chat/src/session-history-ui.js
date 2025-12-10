// Session History UI
// Manages the session history panel on the left side

// Format timestamp for display
function formatTimestamp(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  
  const date = new Date(timestamp);
  return date.toLocaleDateString();
}

// Renders the session history list
export function renderSessionList(sessions, currentSessionId, onSessionSelect, onDeleteSession, onConversationSelect) {
  const sessionList = document.getElementById('session-list');
  sessionList.innerHTML = '';
  
  if (sessions.length === 0) {
    sessionList.innerHTML = '<div style="padding: 20px; text-align: center; color: #666; font-size: 12px;">No sessions yet</div>';
    return;
  }
  
  sessions.forEach(session => {
    const sessionItem = document.createElement('div');
    sessionItem.className = `session-item ${session.id === currentSessionId ? 'active' : ''}`;
    
    const sessionName = document.createElement('div');
    sessionName.className = 'session-name';
    sessionName.textContent = session.name;
    
    const sessionTime = document.createElement('div');
    sessionTime.className = 'session-time';
    sessionTime.textContent = formatTimestamp(session.lastModified);
    
    const sessionActions = document.createElement('div');
    sessionActions.className = 'session-actions';
    
    const viewBtn = document.createElement('button');
    viewBtn.className = 'view-conversation-btn';
    viewBtn.textContent = '📋';
    viewBtn.title = 'View conversation';
    viewBtn.onclick = (e) => {
      e.stopPropagation();
      onConversationSelect(session.id);
    };
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-session-btn';
    deleteBtn.textContent = 'Delete';
    deleteBtn.onclick = (e) => {
      e.stopPropagation(); // Prevent session selection
      onDeleteSession(session.id);
    };
    
    sessionActions.appendChild(viewBtn);
    sessionActions.appendChild(deleteBtn);
    
    sessionItem.appendChild(sessionName);
    sessionItem.appendChild(sessionTime);
    sessionItem.appendChild(sessionActions);
    
    // Click to select session
    sessionItem.onclick = () => {
      if (session.id !== currentSessionId) {
        onSessionSelect(session.id);
      }
    };
    
    sessionList.appendChild(sessionItem);
  });
}

// Displays conversation details in the dropdown
export function displayConversationDetails(sessionName, messages) {
  const detailsSection = document.getElementById('conversation-details-section');
  const conversationTitle = document.getElementById('conversation-title');
  const messagesList = document.getElementById('conversation-messages-list');
  
  // Set title
  conversationTitle.textContent = sessionName;
  
  // Clear previous messages
  messagesList.innerHTML = '';
  
  if (!messages || messages.length === 0) {
    messagesList.innerHTML = '<div style="padding: 12px; text-align: center; color: #64748b; font-size: 12px;">No messages in this conversation</div>';
    detailsSection.classList.add('active');
    return;
  }
  
  // Render all messages
  messages.forEach(msg => {
    const messageItem = document.createElement('div');
    messageItem.className = `conversation-message-item ${msg.role}`;
    
    const roleLabel = document.createElement('div');
    roleLabel.className = 'message-role';
    roleLabel.textContent = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);
    
    const content = document.createElement('div');
    content.className = 'message-content';
    content.textContent = msg.content.substring(0, 500); // Limit to 500 chars
    
    if (msg.content.length > 500) {
      content.textContent += '...';
    }
    
    messageItem.appendChild(roleLabel);
    messageItem.appendChild(content);
    messagesList.appendChild(messageItem);
  });
  
  // Show the details section
  detailsSection.classList.add('active');
  
  // Hide sessions section
  document.querySelector('.sessions-section').style.display = 'none';
}

// Hide conversation details and show sessions list
export function hideConversationDetails() {
  const detailsSection = document.getElementById('conversation-details-section');
  detailsSection.classList.remove('active');
  document.querySelector('.sessions-section').style.display = 'block';
}

// Display conversation on right panel alongside left panel
export function displayConversationOnRightPanel(messages) {
  const rightSection = document.getElementById('right-conversation-section');
  const rightMessages = document.getElementById('right-conversation-messages');
  
  if (!messages || messages.length === 0) {
    rightSection.style.display = 'none';
    return;
  }
  
  rightMessages.innerHTML = '';
  
  messages.forEach(msg => {
    const messageItem = document.createElement('div');
    messageItem.className = `right-conversation-message ${msg.role}`;
    
    const roleLabel = document.createElement('div');
    roleLabel.className = 'msg-role';
    roleLabel.textContent = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);
    
    const content = document.createElement('div');
    content.className = 'message-content';
    content.textContent = msg.content.substring(0, 300); // Limit to 300 chars
    
    if (msg.content.length > 300) {
      content.textContent += '...';
    }
    
    messageItem.appendChild(roleLabel);
    messageItem.appendChild(content);
    rightMessages.appendChild(messageItem);
  });
  
  rightSection.style.display = 'block';
}

// Shows confirmation dialog for session deletion
export function showDeleteConfirmation(sessionName) {
  return confirm(`Delete session "${sessionName}"? This cannot be undone.`);
}

// Highlights current session
export function highlightCurrentSession(sessionId) {
  const sessionItems = document.querySelectorAll('.session-item');
  sessionItems.forEach(item => {
    item.classList.remove('active');
  });
  
  // Find and highlight the current session
  sessionItems.forEach(item => {
    const sessionName = item.querySelector('.session-name');
    if (sessionName && item.dataset.sessionId === sessionId) {
      item.classList.add('active');
    }
  });
}
