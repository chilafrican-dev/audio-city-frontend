/**
 * Clean Mastering JavaScript - Async Job Pattern
 * 
 * This file handles:
 * 1. Submitting mastering jobs via POST /api/quick-master
 * 2. Polling /api/master-status/:jobId until completion
 * 3. Updating UI and playing/downloading WAV only when ready
 * 
 * NO legacy .wav access outside polling - all access is safe and validated.
 * 
 * IMPORTANT: Disable Rocket Loader temporarily to avoid caching issues.
 * Test with hard refresh (Cmd+Shift+R / Ctrl+Shift+R) and check console logs.
 */

// 🔥 VERIFICATION: If you see this in console, mastering.js is loaded
console.log("🔥🔥🔥 ACTIVE FILE CONFIRMED - mastering.js v20241230-4 loaded 🔥🔥🔥");
console.log("🔥🔥🔥 NO .wav ACCESS IN THIS FILE - ALL FIXED 🔥🔥🔥");

(function() {
  'use strict';

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    console.log('🎛️ Mastering module initialized');
    
    // Get UI elements
    const masterBtn = document.getElementById('masterBtn');
    const statusBar = document.getElementById('statusBar');
    const statusText = document.getElementById('statusText');
    const downloadSection = document.querySelector('.download-section');
    const downloadReady = document.getElementById('downloadReady');
    const downloadWav = document.getElementById('downloadWav');
    const downloadMp3 = document.getElementById('downloadMp3');
    
    // Meter elements
    const inputLufs = document.getElementById('inputLufs');
    const outputLufs = document.getElementById('outputLufs');
    const lufsDisplay = document.getElementById('lufsDisplay');
    const peakDisplay = document.getElementById('peakDisplay');
    const gainDisplay = document.getElementById('gainDisplay');
    const peakBar = document.getElementById('peakBar');

    // Validate required elements exist
    if (!masterBtn || !statusBar || !statusText) {
      console.error('❌ Required mastering UI elements not found');
      return;
    }

    // Get API URL from global scope (defined in mastering.html)
    const API = window.API || 'https://api.audiocity-ug.com/api';
    
    // Get global state variables (defined in mastering.html)
    const getState = () => ({
      currentFile: window.currentFile,
      selectedPreset: window.selectedPreset || 'kidandali',
      audioContext: window.audioContext,
      masteredBuffer: window.masteredBuffer,
      playbackMode: window.playbackMode || 'after',
      downloadUrls: window.downloadUrls || { audioFile: null, mp3: null }, // Use 'audioFile' instead of 'wav'
      isPlaying: window.isPlaying,
      stopPlayback: window.stopPlayback,
      drawWaveform: window.drawWaveform,
      loadUsageStats: window.loadUsageStats
    });

    // Set state helper
    const setState = (updates) => {
      if (updates.currentFile !== undefined) window.currentFile = updates.currentFile;
      if (updates.selectedPreset !== undefined) window.selectedPreset = updates.selectedPreset;
      if (updates.masteredBuffer !== undefined) window.masteredBuffer = updates.masteredBuffer;
      if (updates.downloadUrls !== undefined) window.downloadUrls = updates.downloadUrls;
    };

    /**
     * Submit mastering job
     */
    async function submitMasteringJob() {
      const state = getState();
      
      // Check multiple sources for the file
      let fileToUse = state.currentFile;
      if (!fileToUse) {
        // Fallback: check the audioInput element directly
        const audioInput = document.getElementById('audioInput');
        if (audioInput && audioInput.files && audioInput.files[0]) {
          fileToUse = audioInput.files[0];
          // Update state for next time
          window.currentFile = fileToUse;
        }
      }
      
      if (!fileToUse) {
        alert('Please upload an audio file first');
        return null;
      }

      // Stop playback if playing
      if (state.isPlaying && state.stopPlayback) {
        state.stopPlayback();
      }

      // Update UI - change Master button to show processing message
      masterBtn.disabled = true;
      masterBtn.classList.add('processing');
      
      const masterBtnIcon = document.getElementById('masterBtnIcon');
      const masterBtnText = document.getElementById('masterBtnText');
      const masterBtnPercentage = document.getElementById('masterBtnPercentage');
      
      if (masterBtnIcon) masterBtnIcon.textContent = '⏳';
      if (masterBtnText) masterBtnText.textContent = 'BAMBI GUMIKIRIZAKO..... PLEASE WAIT....';
      if (masterBtnPercentage) {
        masterBtnPercentage.style.display = 'block';
        masterBtnPercentage.textContent = '0%';
      }
      
      statusBar.className = 'status-bar processing';
      const statusIcon = document.getElementById('statusIcon');
      if (statusIcon) statusIcon.textContent = '⏳';
      statusText.innerHTML = '<span>Processing...</span>';
      
      // Hide download section while processing
      if (downloadSection) downloadSection.classList.remove('show');
      if (downloadReady) downloadReady.classList.remove('show');

      try {
        const formData = new FormData();
        formData.append('audio', fileToUse);
        formData.append('preset', state.selectedPreset);

        console.log('📤 Submitting mastering job...', {
          file: fileToUse.name,
          preset: state.selectedPreset
        });

        const response = await fetch(`${API}/quick-master`, {
          method: 'POST',
          body: formData
        });

        const data = await response.json();
        console.log('✅ Mastering response:', data);

        // Check if this is a synchronous completion (immediate result)
        if (data.success && data.status === 'completed') {
          // Handle immediate completion - no polling needed
          console.log('✅ Mastering completed immediately (synchronous)');
          
          // Get current state first
          const state = getState();
          
          // Update download URLs
          setState({ 
            downloadUrls: {
              audioFile: data.audioUrl,
              mp3: data.mp3
            }
          });
          
          // Play mastered audio
          if (data.audioUrl && typeof playMasteredAudio === 'function') {
            playMasteredAudio(data.audioUrl);
          }
          
          // Update UI with completion message
          statusBar.className = 'status-bar completed';
          const statusIcon2 = document.getElementById('statusIcon');
          if (statusIcon2) statusIcon2.textContent = '✅';
          statusText.innerHTML = '✅ MASTERING DONE EJOY DONATE PLEASE';
          
          // Hide progress percentage
          const progressPercentage2 = document.getElementById('progressPercentage');
          if (progressPercentage2) progressPercentage2.style.display = 'none';
          
          // Show download section and enable buttons
          if (downloadSection) downloadSection.classList.add('show');
          if (downloadReady) downloadReady.classList.add('show');
          if (downloadWav) downloadWav.disabled = false;
          if (downloadMp3) downloadMp3.disabled = false;
          
          // Update meters if available
          if (data.input && data.input.lufs !== undefined && inputLufs) {
            inputLufs.textContent = `${data.input.lufs.toFixed(1)}`;
          }
          if (data.output && data.output.lufs !== undefined) {
            if (outputLufs) outputLufs.textContent = `${data.output.lufs.toFixed(1)}`;
            if (lufsDisplay) lufsDisplay.textContent = `${data.output.lufs.toFixed(1)} LUFS`;
          }
          if (data.output && data.output.truePeak !== undefined) {
            if (peakDisplay) peakDisplay.textContent = `${data.output.truePeak.toFixed(1)} dB`;
            if (peakBar) {
              const peakPercent = Math.min(100, Math.max(0, (data.output.truePeak + 10) * 10));
              peakBar.style.width = `${peakPercent}%`;
            }
          }
          if (data.gain !== undefined && gainDisplay) {
            gainDisplay.textContent = `${data.gain > 0 ? '+' : ''}${data.gain.toFixed(1)} dB`;
          }
          
          masterBtn.disabled = false;
          masterBtn.classList.remove('processing');
          const masterBtnIconSync = document.getElementById('masterBtnIcon');
          const masterBtnTextSync = document.getElementById('masterBtnText');
          const masterBtnPercentageSync = document.getElementById('masterBtnPercentage');
          if (masterBtnIconSync) masterBtnIconSync.textContent = '🎛️';
          if (masterBtnTextSync) masterBtnTextSync.textContent = 'Master Track';
          if (masterBtnPercentageSync) masterBtnPercentageSync.style.display = 'none';
          
          // Reload usage stats
          if (state.loadUsageStats) {
            setTimeout(() => state.loadUsageStats(), 500);
          }
          
          return null; // No job ID for synchronous completion
        }
        
        // Async job pattern - requires polling
        // Server returns 'progressId', but we check for 'jobId' for compatibility
        const jobId = data.jobId || data.progressId;
        
        if (!data.success || !jobId) {
          throw new Error(data.error || data.message || 'Mastering request failed');
        }

        // Reset polling counters
        consecutive503Count = 0;
        
        // Start polling
        pollMasteringJob(jobId, 0);
        return jobId;

      } catch (err) {
        console.error('❌ Mastering submission error:', err);
        statusBar.className = 'status-bar error';
        statusText.textContent = `❌ ${err.message || 'Mastering failed'}`;
        masterBtn.disabled = false;
        masterBtn.classList.remove('processing');
        const masterBtnIconErr = document.getElementById('masterBtnIcon');
        const masterBtnTextErr = document.getElementById('masterBtnText');
        const masterBtnPercentageErr = document.getElementById('masterBtnPercentage');
        if (masterBtnIconErr) masterBtnIconErr.textContent = '🎛️';
        if (masterBtnTextErr) masterBtnTextErr.textContent = 'Master Track';
        if (masterBtnPercentageErr) masterBtnPercentageErr.style.display = 'none';
        alert(`❌ Mastering failed: ${err.message}`);
        return null;
      }
    }

    // Track polling state
    let consecutive503Count = 0;
    const MAX_RETRIES = 60; // Max 60 retries (3 minutes at 3s intervals)
    const MAX_503_RETRIES = 20; // Max 20 consecutive 503s (1 minute)

    /**
     * Poll mastering job status until completion
     */
    async function pollMasteringJob(jobId, retryCount = 0) {
      if (!jobId) {
        console.error('❌ No jobId provided for polling');
        return;
      }

      // Check retry limits
      if (retryCount >= MAX_RETRIES) {
        console.error('❌ Max retries reached, stopping polling');
        statusBar.className = 'status-bar error';
        statusText.textContent = '❌ Request timeout - mastering service is taking too long. Please try again.';
        masterBtn.disabled = false;
        masterBtn.classList.remove('processing');
        const masterBtnIconTimeout = document.getElementById('masterBtnIcon');
        const masterBtnTextTimeout = document.getElementById('masterBtnText');
        const masterBtnPercentageTimeout = document.getElementById('masterBtnPercentage');
        if (masterBtnIconTimeout) masterBtnIconTimeout.textContent = '🎛️';
        if (masterBtnTextTimeout) masterBtnTextTimeout.textContent = 'Master Track';
        if (masterBtnPercentageTimeout) masterBtnPercentageTimeout.style.display = 'none';
        consecutive503Count = 0;
        return;
      }

      if (consecutive503Count >= MAX_503_RETRIES) {
        console.error('❌ Too many consecutive 503 errors, stopping polling');
        statusBar.className = 'status-bar error';
        statusText.textContent = '❌ Mastering service is currently unavailable. Please try again later.';
        masterBtn.disabled = false;
        masterBtn.classList.remove('processing');
        const masterBtnIcon503 = document.getElementById('masterBtnIcon');
        const masterBtnText503 = document.getElementById('masterBtnText');
        const masterBtnPercentage503 = document.getElementById('masterBtnPercentage');
        if (masterBtnIcon503) masterBtnIcon503.textContent = '🎛️';
        if (masterBtnText503) masterBtnText503.textContent = 'Master Track';
        if (masterBtnPercentage503) masterBtnPercentage503.style.display = 'none';
        consecutive503Count = 0;
        return;
      }

      try {
        console.log(`🔄 Polling job status: ${jobId} (attempt ${retryCount + 1}/${MAX_RETRIES})`);
        
        // Update progress percentage on Master button
        const masterBtnPercentagePoll = document.getElementById('masterBtnPercentage');
        if (masterBtnPercentagePoll) {
          // Calculate progress: 20% base + 70% based on retries (up to 90%)
          const progress = Math.min(90, 20 + Math.floor((retryCount / MAX_RETRIES) * 70));
          masterBtnPercentagePoll.textContent = `${progress}%`;
        }
        
        const res = await fetch(`${API}/master-status/${jobId}`);
        
        // Handle 503 errors gracefully - continue polling
        if (res.status === 503) {
          consecutive503Count++;
          const errorData = await res.json().catch(() => ({}));
          console.warn(`⚠️ Mastering service temporarily unavailable (503), will retry... (${consecutive503Count}/${MAX_503_RETRIES})`);
          
          // Calculate delay with exponential backoff (3s, 5s, 7s, etc., max 10s)
          const delay = Math.min(3000 + (consecutive503Count * 2000), 10000);
          
          // If the response says to retry, continue polling
          if (errorData.retry || errorData.status === 'processing') {
            statusBar.className = 'status-bar warning';
            statusText.textContent = `⚠️ Service temporarily unavailable. Retrying... (${consecutive503Count}/${MAX_503_RETRIES})`;
            // Continue polling after delay
            setTimeout(() => pollMasteringJob(jobId, retryCount + 1), delay);
            return;
          }
          
          // Otherwise, show error but allow retry
          statusBar.className = 'status-bar warning';
          statusText.textContent = `⚠️ Mastering service temporarily unavailable. Retrying... (${consecutive503Count}/${MAX_503_RETRIES})`;
          setTimeout(() => pollMasteringJob(jobId, retryCount + 1), delay);
          return;
        }
        
        // Reset 503 counter on successful response
        consecutive503Count = 0;
        
        if (!res.ok) {
          throw new Error(`Status check failed: ${res.status}`);
        }

        const status = await res.json();
        console.log('📊 Job status:', status);

        // Job completed successfully
        if (status.status === 'completed') {
          const baseUrl = API.replace('/api', '');
          
          // Get audio URL safely - NO direct .wav access
          let audioUrl = null;
          
          // Try multiple property names
          if (status.audioUrl) {
            audioUrl = status.audioUrl.startsWith('http') ? status.audioUrl : `${baseUrl}${status.audioUrl}`;
          } else if (status.downloadUrl) {
            audioUrl = status.downloadUrl.startsWith('http') ? status.downloadUrl : `${baseUrl}${status.downloadUrl}`;
          } else if (status.fileUrl) {
            audioUrl = status.fileUrl.startsWith('http') ? status.fileUrl : `${baseUrl}${status.fileUrl}`;
          } else if (status && typeof status === 'object') {
            // Last resort: check for audio file using bracket notation (NO .wav access)
            // Try common property names - completely avoid 'wav' property
            const audioValue = status['audioFile'] || status['audioUrl'] || status['fileUrl'] || 
                             status['downloadUrl'] || status['url'] || null;
            // DO NOT check for 'wav' property at all - use only safe property names
            if (audioValue) {
              audioUrl = audioValue.startsWith('http') ? audioValue : `${baseUrl}${audioValue}`;
            }
          }

          if (!audioUrl) {
            throw new Error('No audio URL found in completed job status');
          }

          // Update download URLs - use bracket notation to avoid .wav access
          const state = getState();
          const newDownloadUrls = { ...(state.downloadUrls || {}) };
          newDownloadUrls['audioFile'] = audioUrl; // Use 'audioFile' property name, NOT 'wav'
          
          if (status.mp3) {
            newDownloadUrls.mp3 = status.mp3.startsWith('http') ? status.mp3 : `${baseUrl}${status.mp3}`;
          }
          
          setState({ downloadUrls: newDownloadUrls });

          // Update meters if available
          if (status.input && status.input.lufs !== undefined && inputLufs) {
            inputLufs.textContent = `${status.input.lufs.toFixed(1)}`;
          }
          if (status.output && status.output.lufs !== undefined) {
            if (outputLufs) outputLufs.textContent = `${status.output.lufs.toFixed(1)}`;
            if (lufsDisplay) lufsDisplay.textContent = `${status.output.lufs.toFixed(1)} LUFS`;
          }
          if (status.output && status.output.truePeak !== undefined) {
            if (peakDisplay) peakDisplay.textContent = `${status.output.truePeak.toFixed(1)} dB`;
            if (peakBar) {
              const peakPercent = Math.min(100, Math.max(0, (status.output.truePeak + 10) * 10));
              peakBar.style.width = `${peakPercent}%`;
            }
          }
          if (status.gain !== undefined && gainDisplay) {
            gainDisplay.textContent = `${status.gain > 0 ? '+' : ''}${status.gain.toFixed(1)} dB`;
          }

          // Play mastered audio
          playMasteredAudio(audioUrl);

          // Update UI with completion message
          statusBar.className = 'status-bar completed';
          const statusIcon = document.getElementById('statusIcon');
          if (statusIcon) statusIcon.textContent = '✅';
          statusText.innerHTML = '✅ MASTERING DONE EJOY DONATE PLEASE';
          
          // Hide progress percentage
          const progressPercentage = document.getElementById('progressPercentage');
          if (progressPercentage) progressPercentage.style.display = 'none';
          
          // Show download section and enable buttons
          if (downloadSection) downloadSection.classList.add('show');
          if (downloadReady) downloadReady.classList.add('show');
          if (downloadWav) downloadWav.disabled = false;
          if (downloadMp3) downloadMp3.disabled = false;

          // Reload usage stats
          if (state.loadUsageStats) {
            setTimeout(() => state.loadUsageStats(), 500);
          }

          masterBtn.disabled = false;
          masterBtn.classList.remove('processing');
          const masterBtnIconComplete = document.getElementById('masterBtnIcon');
          const masterBtnTextComplete = document.getElementById('masterBtnText');
          const masterBtnPercentageComplete = document.getElementById('masterBtnPercentage');
          if (masterBtnIconComplete) masterBtnIconComplete.textContent = '🎛️';
          if (masterBtnTextComplete) masterBtnTextComplete.textContent = 'Master Track';
          if (masterBtnPercentageComplete) masterBtnPercentageComplete.style.display = 'none';
          
          console.log('✅ Mastering completed successfully');
          return;
        }

        // Job failed
        if (status.status === 'failed') {
          statusBar.className = 'status-bar error';
          statusText.textContent = `❌ ${status.error || 'Mastering failed'}`;
          masterBtn.disabled = false;
          masterBtn.classList.remove('processing');
          const masterBtnIconFailed = document.getElementById('masterBtnIcon');
          const masterBtnTextFailed = document.getElementById('masterBtnText');
          const masterBtnPercentageFailed = document.getElementById('masterBtnPercentage');
          if (masterBtnIconFailed) masterBtnIconFailed.textContent = '🎛️';
          if (masterBtnTextFailed) masterBtnTextFailed.textContent = 'Master Track';
          if (masterBtnPercentageFailed) masterBtnPercentageFailed.style.display = 'none';
          alert(`❌ Mastering failed: ${status.error || 'Unknown error'}`);
          return;
        }

        // Still processing
        statusText.innerHTML = '<span class="typing-animation">BAMBI GUMIKIRIZAKO..... PLEASE WAIT....</span>';
        
        // Update progress percentage
        const progressPercentage3 = document.getElementById('progressPercentage');
        const progressPercent3 = document.getElementById('progressPercent');
        if (progressPercentage3 && progressPercent3) {
          progressPercentage3.style.display = 'flex';
          const progress = Math.min(90, 20 + Math.floor((retryCount / MAX_RETRIES) * 70));
          progressPercent3.textContent = `${progress}%`;
        }
        
        setTimeout(() => pollMasteringJob(jobId, retryCount + 1), 3000);

      } catch (err) {
        console.error('❌ Polling error:', err);
        
        // Handle network errors (fetch failures)
        if (err.name === 'TypeError' && err.message.includes('fetch')) {
          consecutive503Count++;
          const delay = Math.min(3000 + (consecutive503Count * 2000), 10000);
          statusBar.className = 'status-bar warning';
          statusText.textContent = `⚠️ Network error. Retrying... (${consecutive503Count}/${MAX_503_RETRIES})`;
          setTimeout(() => pollMasteringJob(jobId, retryCount + 1), delay);
          return;
        }
        
        // For other errors, retry with normal delay
        statusText.textContent = '🔄 Checking status... (retrying)';
        setTimeout(() => pollMasteringJob(jobId, retryCount + 1), 3000);
      }
    }

    /**
     * Play mastered audio (ONLY when ready)
     */
    function playMasteredAudio(audioUrl) {
      if (!audioUrl) {
        console.warn('⚠️ No audio URL provided');
        return;
      }

      const state = getState();
      
      if (!state.audioContext) {
        console.warn('⚠️ AudioContext not available');
        return;
      }

      try {
        console.log('🎵 Loading mastered audio for preview:', audioUrl);
        
        fetch(audioUrl)
          .then(response => {
            if (!response.ok) throw new Error(`Failed to fetch audio: ${response.status}`);
            return response.arrayBuffer();
          })
          .then(arrayBuffer => {
            return state.audioContext.decodeAudioData(arrayBuffer.slice(0));
          })
          .then(buffer => {
            setState({ masteredBuffer: buffer });
            
            // Draw waveform if in 'after' mode
            if (state.playbackMode === 'after' && state.drawWaveform) {
              state.drawWaveform(buffer, '#8b5cf6', '#06b6d4');
            }
            
            console.log('✅ Mastered audio loaded for preview');
          })
          .catch(audioErr => {
            console.warn('⚠️ Could not load mastered audio for preview:', audioErr);
          });
      } catch (err) {
        console.warn('⚠️ Error playing mastered audio:', err);
      }
    }

    // Attach event listener to master button
    masterBtn.addEventListener('click', submitMasteringJob);
    
    console.log('✅ Mastering module ready');
  }

})();

