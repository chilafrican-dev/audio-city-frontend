/**
 * Audio City - Moderation UI Components
 * UI elements for reporting, moderation actions, and status messages
 */

class ModerationUI {
  constructor(moderationSystem) {
    this.moderation = moderationSystem || window.moderationSystem;
  }
  
  // ============================================
  // REPORTING UI
  // ============================================
  
  /**
   * Show report modal
   * @param {string} contentId - Content ID
   * @param {string} contentType - Content type
   * @param {Function} onReport - Callback when reported
   */
  showReportModal(contentId, contentType, onReport) {
    const reporterId = localStorage.getItem('user_id');
    if (!reporterId) {
      this.showMessage('Please sign in to report content.', 'error');
      return;
    }
    
    const modal = document.createElement('div');
    modal.className = 'moderation-modal';
    modal.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.8);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      backdrop-filter: blur(10px);
    `;
    
    const reasons = this.moderation.getReportReasons();
    let selectedReason = '';
    
    modal.innerHTML = `
      <div class="moderation-modal-content" style="
        background: var(--bg-card, #1a1a28);
        border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
        border-radius: 20px;
        padding: 32px;
        max-width: 500px;
        width: 90%;
        max-height: 90vh;
        overflow-y: auto;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      ">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
          <h2 style="font-size: 24px; font-weight: 700; color: var(--text, #fff);">
            Report Content
          </h2>
          <button class="close-moderation-modal" style="
            background: none;
            border: none;
            color: var(--text, #fff);
            font-size: 28px;
            cursor: pointer;
            padding: 0;
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            transition: background 0.2s;
          ">×</button>
        </div>
        
        <p style="color: var(--muted, #a0a0b8); margin-bottom: 24px; line-height: 1.6;">
          Why are you reporting this content? This helps us keep Audio City safe.
        </p>
        
        <div class="report-reasons" style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px;">
          ${reasons.map(reason => `
            <label style="
              display: flex;
              align-items: center;
              gap: 12px;
              padding: 16px;
              background: var(--glass, rgba(255, 255, 255, 0.05));
              border: 2px solid var(--border, rgba(255, 255, 255, 0.1));
              border-radius: 12px;
              cursor: pointer;
              transition: all 0.2s;
            " class="report-reason-option">
              <input type="radio" name="reportReason" value="${reason.value}" style="
                width: 20px;
                height: 20px;
                cursor: pointer;
              ">
              <span style="font-size: 20px;">${reason.icon}</span>
              <span style="color: var(--text, #fff); font-weight: 500;">${reason.label}</span>
            </label>
          `).join('')}
        </div>
        
        <div style="display: flex; gap: 12px;">
          <button class="cancel-report" style="
            flex: 1;
            padding: 14px 24px;
            background: var(--glass, rgba(255, 255, 255, 0.05));
            border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
            border-radius: 12px;
            color: var(--text, #fff);
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
          ">Cancel</button>
          <button class="submit-report" style="
            flex: 1;
            padding: 14px 24px;
            background: linear-gradient(135deg, var(--accent, #8b5cf6), var(--accent-light, #a78bfa));
            border: none;
            border-radius: 12px;
            color: white;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            opacity: 0.5;
          " disabled>Report</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Style reason options on hover
    const reasonOptions = modal.querySelectorAll('.report-reason-option');
    reasonOptions.forEach(option => {
      option.addEventListener('mouseenter', () => {
        option.style.borderColor = 'var(--accent, #8b5cf6)';
        option.style.background = 'rgba(139, 92, 246, 0.1)';
      });
      option.addEventListener('mouseleave', () => {
        if (option.querySelector('input:checked')) {
          option.style.borderColor = 'var(--accent, #8b5cf6)';
          option.style.background = 'rgba(139, 92, 246, 0.1)';
        } else {
          option.style.borderColor = 'var(--border, rgba(255, 255, 255, 0.1))';
          option.style.background = 'var(--glass, rgba(255, 255, 255, 0.05))';
        }
      });
      
      const radio = option.querySelector('input[type="radio"]');
      radio.addEventListener('change', (e) => {
        if (e.target.checked) {
          selectedReason = e.target.value;
          const submitBtn = modal.querySelector('.submit-report');
          submitBtn.disabled = false;
          submitBtn.style.opacity = '1';
          
          // Update selected option style
          reasonOptions.forEach(opt => {
            if (opt !== option) {
              opt.style.borderColor = 'var(--border, rgba(255, 255, 255, 0.1))';
              opt.style.background = 'var(--glass, rgba(255, 255, 255, 0.05))';
            }
          });
          option.style.borderColor = 'var(--accent, #8b5cf6)';
          option.style.background = 'rgba(139, 92, 246, 0.1)';
        }
      });
    });
    
    // Close modal
    const closeBtn = modal.querySelector('.close-moderation-modal');
    const cancelBtn = modal.querySelector('.cancel-report');
    const closeModal = () => {
      modal.remove();
    };
    
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
    
    // Submit report
    const submitBtn = modal.querySelector('.submit-report');
    submitBtn.addEventListener('click', () => {
      if (!selectedReason) {
        this.showMessage('Please select a reason for reporting.', 'error');
        return;
      }
      
      const result = this.moderation.reportContent(contentId, contentType, selectedReason, reporterId);
      
      if (result.success) {
        this.showMessage(result.message, 'success');
        if (onReport) onReport(result);
        closeModal();
      } else {
        this.showMessage(result.message, 'error');
      }
    });
  }
  
  // ============================================
  // CONTENT STATUS MESSAGES
  // ============================================
  
  /**
   * Create "Content under review" message
   * @param {string} reason - Reason for review
   * @returns {HTMLElement} Message element
   */
  createReviewMessage(reason = 'This content is under review.') {
    const message = document.createElement('div');
    message.className = 'content-review-message';
    message.style.cssText = `
      padding: 16px;
      background: rgba(255, 193, 7, 0.1);
      border: 1px solid rgba(255, 193, 7, 0.3);
      border-radius: 12px;
      color: #ffc107;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 16px 0;
    `;
    message.innerHTML = `
      <span style="font-size: 20px;">⏳</span>
      <span>${reason}</span>
    `;
    return message;
  }
  
  /**
   * Create "Content hidden" message
   * @param {string} reason - Reason for hiding
   * @returns {HTMLElement} Message element
   */
  createHiddenMessage(reason = 'This content has been hidden due to a violation of our community guidelines.') {
    const message = document.createElement('div');
    message.className = 'content-hidden-message';
    message.style.cssText = `
      padding: 16px;
      background: rgba(244, 67, 54, 0.1);
      border: 1px solid rgba(244, 67, 54, 0.3);
      border-radius: 12px;
      color: #f44336;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 16px 0;
    `;
    message.innerHTML = `
      <span style="font-size: 20px;">🚫</span>
      <span>${reason}</span>
    `;
    return message;
  }
  
  /**
   * Create user status message (muted, suspended, banned)
   * @param {Object} status - User strike status
   * @returns {HTMLElement|null} Message element or null
   */
  createUserStatusMessage(status) {
    if (status.status === 'active') return null;
    
    const messages = {
      warned: {
        icon: '⚠️',
        color: '#ff9800',
        bg: 'rgba(255, 152, 0, 0.1)',
        border: 'rgba(255, 152, 0, 0.3)',
        text: 'You have received a warning. Please review our community guidelines.'
      },
      muted: {
        icon: '🔇',
        color: '#ff9800',
        bg: 'rgba(255, 152, 0, 0.1)',
        border: 'rgba(255, 152, 0, 0.3)',
        text: status.lastAction?.message || 'You are currently muted and cannot post or comment.'
      },
      suspended: {
        icon: '⏸️',
        color: '#f44336',
        bg: 'rgba(244, 67, 54, 0.1)',
        border: 'rgba(244, 67, 54, 0.3)',
        text: status.lastAction?.message || 'Your account is suspended.'
      },
      banned: {
        icon: '🚫',
        color: '#f44336',
        bg: 'rgba(244, 67, 54, 0.1)',
        border: 'rgba(244, 67, 54, 0.3)',
        text: 'Your account has been permanently banned.'
      }
    };
    
    const config = messages[status.status];
    if (!config) return null;
    
    const message = document.createElement('div');
    message.className = 'user-status-message';
    message.style.cssText = `
      position: fixed;
      top: 80px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 9999;
      padding: 16px 24px;
      background: ${config.bg};
      border: 1px solid ${config.border};
      border-radius: 12px;
      color: ${config.color};
      font-size: 14px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 12px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      max-width: 90%;
      text-align: center;
    `;
    message.innerHTML = `
      <span style="font-size: 20px;">${config.icon}</span>
      <span>${config.text}</span>
    `;
    
    return message;
  }
  
  // ============================================
  // REPORT BUTTON
  // ============================================
  
  /**
   * Create report button
   * @param {string} contentId - Content ID
   * @param {string} contentType - Content type
   * @returns {HTMLElement} Button element
   */
  createReportButton(contentId, contentType) {
    const button = document.createElement('button');
    button.className = 'report-button';
    button.setAttribute('data-content-id', contentId);
    button.setAttribute('data-content-type', contentType);
    button.style.cssText = `
      background: none;
      border: none;
      color: var(--muted, #a0a0b8);
      font-size: 14px;
      cursor: pointer;
      padding: 8px 12px;
      border-radius: 8px;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 6px;
    `;
    button.innerHTML = `
      <span>🚩</span>
      <span>Report</span>
    `;
    
    button.addEventListener('mouseenter', () => {
      button.style.background = 'rgba(244, 67, 54, 0.1)';
      button.style.color = '#f44336';
    });
    
    button.addEventListener('mouseleave', () => {
      button.style.background = 'none';
      button.style.color = 'var(--muted, #a0a0b8)';
    });
    
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showReportModal(contentId, contentType);
    });
    
    return button;
  }
  
  // ============================================
  // UTILITY MESSAGES
  // ============================================
  
  /**
   * Show temporary message
   * @param {string} text - Message text
   * @param {string} type - Message type (success, error, warning, info)
   * @param {number} duration - Duration in ms
   */
  showMessage(text, type = 'info', duration = 3000) {
    const colors = {
      success: { bg: 'rgba(34, 197, 94, 0.1)', border: 'rgba(34, 197, 94, 0.3)', color: '#22c55e', icon: '✅' },
      error: { bg: 'rgba(244, 67, 54, 0.1)', border: 'rgba(244, 67, 54, 0.3)', color: '#f44336', icon: '❌' },
      warning: { bg: 'rgba(255, 193, 7, 0.1)', border: 'rgba(255, 193, 7, 0.3)', color: '#ffc107', icon: '⚠️' },
      info: { bg: 'rgba(59, 130, 246, 0.1)', border: 'rgba(59, 130, 246, 0.3)', color: '#3b82f6', icon: 'ℹ️' }
    };
    
    const config = colors[type] || colors.info;
    
    const message = document.createElement('div');
    message.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10001;
      padding: 16px 24px;
      background: ${config.bg};
      border: 1px solid ${config.border};
      border-radius: 12px;
      color: ${config.color};
      font-size: 14px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 12px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      animation: slideInRight 0.3s ease;
    `;
    message.innerHTML = `
      <span style="font-size: 20px;">${config.icon}</span>
      <span>${text}</span>
    `;
    
    // Add animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideInRight {
        from {
          transform: translateX(100%);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(message);
    
    setTimeout(() => {
      message.style.animation = 'slideInRight 0.3s ease reverse';
      setTimeout(() => message.remove(), 300);
    }, duration);
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ModerationUI;
}

// Global instance
window.ModerationUI = ModerationUI;
window.moderationUI = new ModerationUI(window.moderationSystem);




























