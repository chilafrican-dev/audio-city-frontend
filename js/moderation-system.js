/**
 * Audio City - Content Moderation System
 * Comprehensive violation detection, reporting, and moderation
 */

class ModerationSystem {
  constructor() {
    this.storageKey = 'audio_city_moderation';
    this.reportsKey = 'audio_city_reports';
    this.strikesKey = 'audio_city_strikes';
    this.hiddenContentKey = 'audio_city_hidden';
    
    // Strike thresholds
    this.STRIKE_THRESHOLDS = {
      WARNING: 1,
      MUTE: 2,
      SUSPENSION: 3,
      BAN: 4
    };
    
    // Auto-flag threshold
    this.AUTO_FLAG_THRESHOLD = 3;
    
    // Initialize storage
    this.initStorage();
  }
  
  initStorage() {
    if (!localStorage.getItem(this.reportsKey)) {
      localStorage.setItem(this.reportsKey, JSON.stringify({}));
    }
    if (!localStorage.getItem(this.strikesKey)) {
      localStorage.setItem(this.strikesKey, JSON.stringify({}));
    }
    if (!localStorage.getItem(this.hiddenContentKey)) {
      localStorage.setItem(this.hiddenContentKey, JSON.stringify({}));
    }
  }
  
  // ============================================
  // VIOLATION DETECTION
  // ============================================
  
  /**
   * Detect violations in text content
   * @param {string} text - Content to check
   * @param {string} type - Type of content (comment, post, bio)
   * @returns {Array} Array of violation objects
   */
  detectViolations(text, type = 'comment') {
    if (!text || typeof text !== 'string') return [];
    
    const violations = [];
    const lowerText = text.toLowerCase();
    
    // Profanity patterns
    const profanityPatterns = [
      /\b(fuck|shit|damn|bitch|asshole|piss|hell|bastard|crap)\b/i,
      /\b(nigga|nigger|fag|faggot|retard|slut|whore)\b/i,
      /\b(motherfucker|motherfucking|fucking)\b/i
    ];
    
    // Hate speech patterns
    const hateSpeechPatterns = [
      /\b(kill|murder|die|death|suicide|harm)\s+(yourself|your|you|them|him|her)\b/i,
      /\b(hate|violence|attack|destroy)\s+(.*?)\s+(group|people|race|religion|community)\b/i,
      /\b(you should|go|just)\s+(kill|die|off yourself)\b/i
    ];
    
    // Spam patterns
    const spamPatterns = [
      /(click here|buy now|free money|make money|get rich|guaranteed|100% free|limited time)/i,
      /(www\.|http:\/\/|https:\/\/).{0,10}(bit\.ly|tinyurl|short\.link|t\.co)/i,
      /([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i, // Email addresses
      /(\d{10,})/g, // Long number sequences
      /(call|text|whatsapp|telegram)\s+(\+?\d{10,})/i
    ];
    
    // Harassment patterns
    const harassmentPatterns = [
      /\b(stupid|idiot|moron|dumb|retarded)\s+(you|your|u)\b/i,
      /\b(shut up|fuck off|go away|kill yourself)\b/i
    ];
    
    // Check profanity
    profanityPatterns.forEach(pattern => {
      if (pattern.test(lowerText)) {
        violations.push({
          type: 'profanity',
          severity: 'high',
          message: 'Content contains inappropriate language.',
          action: 'hide'
        });
      }
    });
    
    // Check hate speech
    hateSpeechPatterns.forEach(pattern => {
      if (pattern.test(lowerText)) {
        violations.push({
          type: 'hate_speech',
          severity: 'critical',
          message: 'Content contains hate speech or violent language.',
          action: 'hide'
        });
      }
    });
    
    // Check spam
    spamPatterns.forEach(pattern => {
      if (pattern.test(lowerText)) {
        violations.push({
          type: 'spam',
          severity: 'medium',
          message: 'Content appears to be spam.',
          action: 'flag'
        });
      }
    });
    
    // Check harassment
    harassmentPatterns.forEach(pattern => {
      if (pattern.test(lowerText)) {
        violations.push({
          type: 'harassment',
          severity: 'high',
          message: 'Content contains harassing language.',
          action: 'hide'
        });
      }
    });
    
    // Check for excessive repetition (spam indicator)
    const words = lowerText.split(/\s+/).filter(w => w.length > 2);
    const wordCounts = {};
    words.forEach(word => {
      wordCounts[word] = (wordCounts[word] || 0) + 1;
    });
    const maxRepetition = Math.max(...Object.values(wordCounts), 0);
    if (maxRepetition > 5 && words.length < 30) {
      violations.push({
        type: 'spam',
        severity: 'medium',
        message: 'Content appears repetitive and may be spam.',
        action: 'flag'
      });
    }
    
    // Check content length (too short might be spam)
    if (type === 'comment' && text.trim().length < 3) {
      violations.push({
        type: 'invalid',
        severity: 'low',
        message: 'Content is too short.',
        action: 'none'
      });
    }
    
    // Check for excessive caps (spam indicator)
    const capsRatio = (text.match(/[A-Z]/g) || []).length / text.length;
    if (capsRatio > 0.7 && text.length > 10) {
      violations.push({
        type: 'spam',
        severity: 'low',
        message: 'Excessive use of capital letters.',
        action: 'flag'
      });
    }
    
    return violations;
  }
  
  /**
   * Check if content is spam based on frequency
   * @param {string} userId - User ID
   * @param {string} contentId - Content ID
   * @param {string} type - Content type
   * @returns {boolean} True if spam
   */
  isSpamByFrequency(userId, contentId, type) {
    const now = Date.now();
    const timeWindow = 5 * 60 * 1000; // 5 minutes
    const maxPosts = 5; // Max posts per time window
    
    const recentPosts = this.getRecentPosts(userId, timeWindow);
    
    if (recentPosts.length >= maxPosts) {
      return true;
    }
    
    // Check for duplicate content
    const contentHash = this.hashContent(contentId);
    const duplicates = recentPosts.filter(p => p.hash === contentHash);
    if (duplicates.length >= 2) {
      return true;
    }
    
    return false;
  }
  
  getRecentPosts(userId, timeWindow) {
    // In production, this would query a database
    // For now, we'll track in localStorage
    const key = `recent_posts_${userId}`;
    const recent = JSON.parse(localStorage.getItem(key) || '[]');
    const now = Date.now();
    
    // Filter out old posts
    const filtered = recent.filter(p => (now - p.timestamp) < timeWindow);
    localStorage.setItem(key, JSON.stringify(filtered));
    
    return filtered;
  }
  
  recordPost(userId, contentId, content) {
    const key = `recent_posts_${userId}`;
    const recent = JSON.parse(localStorage.getItem(key) || '[]');
    const now = Date.now();
    
    recent.push({
      contentId,
      hash: this.hashContent(content),
      timestamp: now
    });
    
    // Keep only last 20 posts
    if (recent.length > 20) {
      recent.shift();
    }
    
    localStorage.setItem(key, JSON.stringify(recent));
  }
  
  hashContent(content) {
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString();
  }
  
  // ============================================
  // REPORTING SYSTEM
  // ============================================
  
  /**
   * Report content
   * @param {string} contentId - Content ID
   * @param {string} contentType - Type (comment, post, bio, track)
   * @param {string} reason - Report reason
   * @param {string} reporterId - User ID of reporter
   * @returns {Object} Report result
   */
  reportContent(contentId, contentType, reason, reporterId) {
    const reports = this.getReports();
    const reportKey = `${contentType}_${contentId}`;
    
    if (!reports[reportKey]) {
      reports[reportKey] = {
        contentId,
        contentType,
        reports: [],
        count: 0,
        createdAt: Date.now(),
        status: 'pending'
      };
    }
    
    // Check if user already reported
    const existingReport = reports[reportKey].reports.find(r => r.reporterId === reporterId);
    if (existingReport) {
      return {
        success: false,
        message: 'You have already reported this content.'
      };
    }
    
    // Add report
    reports[reportKey].reports.push({
      reporterId,
      reason,
      timestamp: Date.now()
    });
    
    reports[reportKey].count = reports[reportKey].reports.length;
    
    // Auto-flag if threshold reached
    if (reports[reportKey].count >= this.AUTO_FLAG_THRESHOLD) {
      reports[reportKey].status = 'flagged';
      this.hideContent(contentId, contentType, 'auto-flagged');
      
      return {
        success: true,
        message: 'Content has been reported and automatically flagged for review.',
        autoFlagged: true
      };
    }
    
    this.saveReports(reports);
    
    return {
      success: true,
      message: 'Content reported successfully. It will be reviewed.',
      count: reports[reportKey].count
    };
  }
  
  getReports() {
    return JSON.parse(localStorage.getItem(this.reportsKey) || '{}');
  }
  
  saveReports(reports) {
    localStorage.setItem(this.reportsKey, JSON.stringify(reports));
  }
  
  getReportReasons() {
    return [
      { value: 'spam', label: 'Spam', icon: '🚫' },
      { value: 'harassment', label: 'Harassment', icon: '😠' },
      { value: 'hate_speech', label: 'Hate Speech', icon: '💔' },
      { value: 'inappropriate', label: 'Inappropriate Content', icon: '⚠️' },
      { value: 'copyright', label: 'Copyright Violation', icon: '©️' },
      { value: 'fake', label: 'Fake/Misleading', icon: '🎭' },
      { value: 'other', label: 'Other', icon: '📝' }
    ];
  }
  
  // ============================================
  // SOFT MODERATION
  // ============================================
  
  /**
   * Hide content (soft delete)
   * @param {string} contentId - Content ID
   * @param {string} contentType - Content type
   * @param {string} reason - Reason for hiding
   */
  hideContent(contentId, contentType, reason = 'violation') {
    const hidden = this.getHiddenContent();
    const key = `${contentType}_${contentId}`;
    
    hidden[key] = {
      contentId,
      contentType,
      reason,
      hiddenAt: Date.now(),
      status: 'hidden'
    };
    
    this.saveHiddenContent(hidden);
  }
  
  /**
   * Unhide content
   * @param {string} contentId - Content ID
   * @param {string} contentType - Content type
   */
  unhideContent(contentId, contentType) {
    const hidden = this.getHiddenContent();
    const key = `${contentType}_${contentId}`;
    
    if (hidden[key]) {
      hidden[key].status = 'restored';
      hidden[key].restoredAt = Date.now();
      this.saveHiddenContent(hidden);
    }
  }
  
  /**
   * Check if content is hidden
   * @param {string} contentId - Content ID
   * @param {string} contentType - Content type
   * @returns {boolean} True if hidden
   */
  isContentHidden(contentId, contentType) {
    const hidden = this.getHiddenContent();
    const key = `${contentType}_${contentId}`;
    return hidden[key] && hidden[key].status === 'hidden';
  }
  
  getHiddenContent() {
    return JSON.parse(localStorage.getItem(this.hiddenContentKey) || '{}');
  }
  
  saveHiddenContent(hidden) {
    localStorage.setItem(this.hiddenContentKey, JSON.stringify(hidden));
  }
  
  // ============================================
  // USER STRIKE SYSTEM
  // ============================================
  
  /**
   * Add strike to user
   * @param {string} userId - User ID
   * @param {string} reason - Strike reason
   * @param {string} severity - Strike severity (low, medium, high, critical)
   * @returns {Object} Strike result with action taken
   */
  addStrike(userId, reason, severity = 'medium') {
    const strikes = this.getStrikes();
    
    if (!strikes[userId]) {
      strikes[userId] = {
        userId,
        strikes: [],
        totalStrikes: 0,
        status: 'active',
        createdAt: Date.now()
      };
    }
    
    // Calculate strike weight based on severity
    const strikeWeight = {
      low: 0.5,
      medium: 1,
      high: 1.5,
      critical: 2
    };
    
    const weight = strikeWeight[severity] || 1;
    
    strikes[userId].strikes.push({
      reason,
      severity,
      weight,
      timestamp: Date.now()
    });
    
    strikes[userId].totalStrikes += weight;
    
    // Determine action based on total strikes
    const action = this.determineAction(strikes[userId].totalStrikes);
    strikes[userId].status = action.status;
    strikes[userId].lastAction = action;
    strikes[userId].lastActionAt = Date.now();
    
    this.saveStrikes(strikes);
    
    return {
      success: true,
      strikes: strikes[userId].totalStrikes,
      action: action,
      message: this.getActionMessage(action)
    };
  }
  
  determineAction(totalStrikes) {
    if (totalStrikes >= this.STRIKE_THRESHOLDS.BAN) {
      return {
        type: 'ban',
        status: 'banned',
        duration: null, // Permanent
        message: 'Account has been permanently banned.'
      };
    } else if (totalStrikes >= this.STRIKE_THRESHOLDS.SUSPENSION) {
      return {
        type: 'suspension',
        status: 'suspended',
        duration: 7 * 24 * 60 * 60 * 1000, // 7 days
        message: 'Account has been suspended for 7 days.'
      };
    } else if (totalStrikes >= this.STRIKE_THRESHOLDS.MUTE) {
      return {
        type: 'mute',
        status: 'muted',
        duration: 3 * 24 * 60 * 60 * 1000, // 3 days
        message: 'Account has been muted for 3 days.'
      };
    } else if (totalStrikes >= this.STRIKE_THRESHOLDS.WARNING) {
      return {
        type: 'warning',
        status: 'warned',
        duration: null,
        message: 'You have received a warning. Please review our community guidelines.'
      };
    }
    
    return {
      type: 'none',
      status: 'active',
      duration: null,
      message: 'No action taken.'
    };
  }
  
  getActionMessage(action) {
    return action.message || 'No action taken.';
  }
  
  /**
   * Check if user can perform action
   * @param {string} userId - User ID
   * @param {string} action - Action to check (post, comment, upload)
   * @returns {Object} Check result
   */
  canUserPerformAction(userId, action) {
    const strikes = this.getStrikes();
    const userStrikes = strikes[userId];
    
    if (!userStrikes || userStrikes.status === 'active') {
      return { allowed: true };
    }
    
    const status = userStrikes.status;
    const lastAction = userStrikes.lastAction;
    
    // Check if suspension/mute has expired
    if (lastAction && lastAction.duration) {
      const elapsed = Date.now() - userStrikes.lastActionAt;
      if (elapsed >= lastAction.duration) {
        // Restore user
        userStrikes.status = 'active';
        userStrikes.lastAction = null;
        this.saveStrikes(strikes);
        return { allowed: true };
      }
    }
    
    // Banned users cannot perform any action
    if (status === 'banned') {
      return {
        allowed: false,
        reason: 'banned',
        message: 'Your account has been permanently banned.'
      };
    }
    
    // Suspended users cannot perform any action
    if (status === 'suspended') {
      const remaining = Math.ceil((lastAction.duration - (Date.now() - userStrikes.lastActionAt)) / (24 * 60 * 60 * 1000));
      return {
        allowed: false,
        reason: 'suspended',
        message: `Your account is suspended. ${remaining} day(s) remaining.`
      };
    }
    
    // Muted users cannot comment or post
    if (status === 'muted' && (action === 'comment' || action === 'post')) {
      const remaining = Math.ceil((lastAction.duration - (Date.now() - userStrikes.lastActionAt)) / (24 * 60 * 60 * 1000));
      return {
        allowed: false,
        reason: 'muted',
        message: `You are muted. ${remaining} day(s) remaining.`
      };
    }
    
    return { allowed: true };
  }
  
  getStrikes() {
    return JSON.parse(localStorage.getItem(this.strikesKey) || '{}');
  }
  
  saveStrikes(strikes) {
    localStorage.setItem(this.strikesKey, JSON.stringify(strikes));
  }
  
  /**
   * Get user strike status
   * @param {string} userId - User ID
   * @returns {Object} User strike information
   */
  getUserStrikeStatus(userId) {
    const strikes = this.getStrikes();
    const userStrikes = strikes[userId];
    
    if (!userStrikes) {
      return {
        totalStrikes: 0,
        status: 'active',
        canPost: true,
        canComment: true,
        canUpload: true
      };
    }
    
    const canPost = this.canUserPerformAction(userId, 'post').allowed;
    const canComment = this.canUserPerformAction(userId, 'comment').allowed;
    const canUpload = this.canUserPerformAction(userId, 'upload').allowed;
    
    return {
      totalStrikes: userStrikes.totalStrikes,
      status: userStrikes.status,
      lastAction: userStrikes.lastAction,
      canPost,
      canComment,
      canUpload
    };
  }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ModerationSystem;
}

// Global instance
window.ModerationSystem = ModerationSystem;
window.moderationSystem = new ModerationSystem();
















