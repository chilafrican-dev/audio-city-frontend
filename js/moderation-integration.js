/**
 * Audio City - Moderation Integration
 * Integrates moderation system with comments, posts, and bios
 */

class ModerationIntegration {
  constructor(moderationSystem, moderationUI) {
    this.moderation = moderationSystem || window.moderationSystem;
    this.ui = moderationUI || window.moderationUI;
    this.init();
  }
  
  init() {
    // Check user status on page load
    this.checkUserStatus();
    
    // Monitor form submissions
    this.monitorFormSubmissions();
    
    // Add report buttons to existing content
    this.addReportButtons();
    
    // Check for hidden content
    this.checkHiddenContent();
  }
  
  // ============================================
  // USER STATUS CHECK
  // ============================================
  
  checkUserStatus() {
    const userId = localStorage.getItem('user_id');
    if (!userId) return;
    
    const status = this.moderation.getUserStrikeStatus(userId);
    
    if (status.status !== 'active') {
      const message = this.ui.createUserStatusMessage(status);
      if (message) {
        document.body.appendChild(message);
        
        // Remove after 10 seconds
        setTimeout(() => {
          message.style.opacity = '0';
          message.style.transition = 'opacity 0.3s';
          setTimeout(() => message.remove(), 300);
        }, 10000);
      }
    }
  }
  
  // ============================================
  // FORM MONITORING
  // ============================================
  
  monitorFormSubmissions() {
    // Monitor all forms
    document.addEventListener('submit', (e) => {
      const form = e.target;
      const userId = localStorage.getItem('user_id');
      
      if (!userId) return;
      
      // Check if user can perform action
      const action = this.getActionFromForm(form);
      if (action) {
        const canPerform = this.moderation.canUserPerformAction(userId, action);
        
        if (!canPerform.allowed) {
          e.preventDefault();
          e.stopPropagation();
          this.ui.showMessage(canPerform.message, 'error');
          return false;
        }
      }
      
      // Check for violations in form data
      const violations = this.checkFormViolations(form);
      if (violations.length > 0) {
        const critical = violations.filter(v => v.severity === 'critical' || v.severity === 'high');
        
        if (critical.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          this.ui.showMessage(critical[0].message, 'error');
          return false;
        }
        
        // Show warning for medium/low violations
        const warning = violations.find(v => v.severity === 'medium' || v.severity === 'low');
        if (warning) {
          const proceed = confirm(`${warning.message}\n\nDo you want to continue?`);
          if (!proceed) {
            e.preventDefault();
            e.stopPropagation();
            return false;
          }
        }
      }
    });
  }
  
  getActionFromForm(form) {
    // Determine action type from form
    if (form.id === 'uploadForm' || form.querySelector('input[type="file"]')) {
      return 'upload';
    }
    
    if (form.querySelector('textarea[placeholder*="comment" i]') || 
        form.querySelector('textarea[placeholder*="reply" i]')) {
      return 'comment';
    }
    
    if (form.querySelector('textarea[placeholder*="post" i]') ||
        form.querySelector('input[name*="post" i]')) {
      return 'post';
    }
    
    return null;
  }
  
  checkFormViolations(form) {
    const violations = [];
    
    // Check all text inputs and textareas
    const textInputs = form.querySelectorAll('input[type="text"], textarea');
    textInputs.forEach(input => {
      const value = input.value.trim();
      if (!value) return;
      
      // Determine content type
      let contentType = 'comment';
      if (input.name && input.name.includes('bio')) {
        contentType = 'bio';
      } else if (input.name && input.name.includes('post')) {
        contentType = 'post';
      }
      
      const detected = this.moderation.detectViolations(value, contentType);
      violations.push(...detected);
    });
    
    return violations;
  }
  
  // ============================================
  // REPORT BUTTONS
  // ============================================
  
  addReportButtons() {
    // Add report buttons to comments
    this.addReportButtonsToComments();
    
    // Add report buttons to posts
    this.addReportButtonsToPosts();
    
    // Add report buttons to profiles
    this.addReportButtonsToProfiles();
  }
  
  addReportButtonsToComments() {
    // Find comment containers
    const commentSelectors = [
      '.comment',
      '.comment-item',
      '[data-comment-id]',
      '.comment-container'
    ];
    
    commentSelectors.forEach(selector => {
      const comments = document.querySelectorAll(selector);
      comments.forEach(comment => {
        if (comment.querySelector('.report-button')) return; // Already has button
        
        const commentId = comment.getAttribute('data-comment-id') || 
                          comment.getAttribute('id') || 
                          `comment_${Date.now()}_${Math.random()}`;
        
        const actionsContainer = comment.querySelector('.comment-actions') || 
                                 comment.querySelector('.actions') ||
                                 this.createActionsContainer(comment);
        
        const reportBtn = this.ui.createReportButton(commentId, 'comment');
        actionsContainer.appendChild(reportBtn);
      });
    });
  }
  
  addReportButtonsToPosts() {
    const postSelectors = [
      '.post',
      '.post-card',
      '[data-post-id]',
      '.post-container'
    ];
    
    postSelectors.forEach(selector => {
      const posts = document.querySelectorAll(selector);
      posts.forEach(post => {
        if (post.querySelector('.report-button')) return;
        
        const postId = post.getAttribute('data-post-id') || 
                       post.getAttribute('id') || 
                       `post_${Date.now()}_${Math.random()}`;
        
        const actionsContainer = post.querySelector('.post-actions') || 
                                 post.querySelector('.actions') ||
                                 this.createActionsContainer(post);
        
        const reportBtn = this.ui.createReportButton(postId, 'post');
        actionsContainer.appendChild(reportBtn);
      });
    });
  }
  
  addReportButtonsToProfiles() {
    const profileSelectors = [
      '.profile-header',
      '.profile-container',
      '[data-profile-id]'
    ];
    
    profileSelectors.forEach(selector => {
      const profiles = document.querySelectorAll(selector);
      profiles.forEach(profile => {
        if (profile.querySelector('.report-button')) return;
        
        const profileId = profile.getAttribute('data-profile-id') || 
                          profile.getAttribute('data-user-id') ||
                          `profile_${Date.now()}_${Math.random()}`;
        
        const actionsContainer = profile.querySelector('.profile-actions') || 
                                 this.createActionsContainer(profile);
        
        const reportBtn = this.ui.createReportButton(profileId, 'bio');
        actionsContainer.appendChild(reportBtn);
      });
    });
  }
  
  createActionsContainer(parent) {
    const container = document.createElement('div');
    container.className = 'moderation-actions';
    container.style.cssText = `
      display: flex;
      gap: 8px;
      align-items: center;
      margin-top: 8px;
    `;
    parent.appendChild(container);
    return container;
  }
  
  // ============================================
  // HIDDEN CONTENT
  // ============================================
  
  checkHiddenContent() {
    // Check comments
    document.querySelectorAll('[data-comment-id]').forEach(comment => {
      const commentId = comment.getAttribute('data-comment-id');
      if (this.moderation.isContentHidden(commentId, 'comment')) {
        this.hideContentElement(comment, 'comment');
      }
    });
    
    // Check posts
    document.querySelectorAll('[data-post-id]').forEach(post => {
      const postId = post.getAttribute('data-post-id');
      if (this.moderation.isContentHidden(postId, 'post')) {
        this.hideContentElement(post, 'post');
      }
    });
  }
  
  hideContentElement(element, contentType) {
    // Replace content with hidden message
    const originalContent = element.innerHTML;
    element.setAttribute('data-original-content', originalContent);
    
    const hiddenMessage = this.ui.createHiddenMessage(
      'This content has been hidden due to a violation of our community guidelines.'
    );
    
    element.innerHTML = '';
    element.appendChild(hiddenMessage);
    element.style.opacity = '0.6';
  }
  
  // ============================================
  // REAL-TIME VIOLATION CHECKING
  // ============================================
  
  /**
   * Add real-time violation checking to input/textarea
   * @param {HTMLElement} input - Input element
   * @param {string} contentType - Content type
   */
  addRealTimeChecking(input, contentType = 'comment') {
    if (!input) return;
    
    const warningContainer = document.createElement('div');
    warningContainer.className = 'violation-warning';
    warningContainer.style.cssText = `
      margin-top: 8px;
      padding: 12px;
      background: rgba(244, 67, 54, 0.1);
      border: 1px solid rgba(244, 67, 54, 0.3);
      border-radius: 8px;
      color: #f44336;
      font-size: 13px;
      display: none;
    `;
    
    input.parentNode.insertBefore(warningContainer, input.nextSibling);
    
    input.addEventListener('input', () => {
      const value = input.value.trim();
      if (!value) {
        warningContainer.style.display = 'none';
        return;
      }
      
      const violations = this.moderation.detectViolations(value, contentType);
      const critical = violations.filter(v => v.severity === 'critical' || v.severity === 'high');
      
      if (critical.length > 0) {
        warningContainer.textContent = `⚠️ ${critical[0].message}`;
        warningContainer.style.display = 'block';
        input.style.borderColor = '#f44336';
      } else {
        warningContainer.style.display = 'none';
        input.style.borderColor = '';
      }
    });
  }
  
  // ============================================
  // CONTENT SUBMISSION WRAPPER
  // ============================================
  
  /**
   * Wrap content submission with moderation checks
   * @param {Function} submitFunction - Original submit function
   * @param {string} content - Content text
   * @param {string} contentType - Content type
   * @param {string} userId - User ID
   * @returns {Promise} Submission result
   */
  async submitWithModeration(submitFunction, content, contentType, userId) {
    // Check user status
    const canPerform = this.moderation.canUserPerformAction(userId, contentType);
    if (!canPerform.allowed) {
      throw new Error(canPerform.message);
    }
    
    // Check for violations
    const violations = this.moderation.detectViolations(content, contentType);
    const critical = violations.filter(v => v.severity === 'critical' || v.severity === 'high');
    
    if (critical.length > 0) {
      throw new Error(critical[0].message);
    }
    
    // Check spam frequency
    const contentId = `${contentType}_${Date.now()}_${Math.random()}`;
    if (this.moderation.isSpamByFrequency(userId, contentId, contentType)) {
      throw new Error('You are posting too frequently. Please wait a few minutes.');
    }
    
    // Record post
    this.moderation.recordPost(userId, contentId, content);
    
    // Submit content
    const result = await submitFunction();
    
    // Auto-hide if medium violations detected
    const mediumViolations = violations.filter(v => v.severity === 'medium');
    if (mediumViolations.length > 0 && violations[0].action === 'hide') {
      this.moderation.hideContent(contentId, contentType, 'auto-detected violation');
    }
    
    return result;
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ModerationIntegration;
}

// Global instance
window.ModerationIntegration = ModerationIntegration;

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.moderationIntegration = new ModerationIntegration(
      window.moderationSystem,
      window.moderationUI
    );
  });
} else {
  window.moderationIntegration = new ModerationIntegration(
    window.moderationSystem,
    window.moderationUI
  );
}



























