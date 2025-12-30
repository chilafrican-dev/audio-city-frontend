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
      
      if (!state.currentFile) {
        alert('Please upload an audio file first');
        return null;
      }

      // Stop playback if playing
      if (state.isPlaying && state.stopPlayback) {
        state.stopPlayback();
      }

      // Update UI
      masterBtn.disabled = true;
      masterBtn.innerHTML = '<span>⏳</span> Mastering...';
      statusBar.className = 'status-bar processing';
      statusText.textContent = 'Processing with real FFmpeg loudnorm...';
      if (downloadReady) downloadReady.classList.remove('show');

      try {
        const formData = new FormData();
        formData.append('audio', state.currentFile);
        formData.append('preset', state.selectedPreset);

        console.log('📤 Submitting mastering job...', {
          file: state.currentFile.name,
          preset: state.selectedPreset
        });

        const response = await fetch(`${API}/quick-master`, {
          method: 'POST',
          body: formData
        });

        const data = await response.json();
        console.log('✅ Mastering response:', data);

        if (!data.success || !data.jobId) {
          throw new Error(data.error || data.message || 'Mastering request failed');
        }

        // Start polling
        pollMasteringJob(data.jobId);
        return data.jobId;

      } catch (err) {
        console.error('❌ Mastering submission error:', err);
        statusBar.className = 'status-bar error';
        statusText.textContent = `❌ ${err.message || 'Mastering failed'}`;
        masterBtn.disabled = false;
        masterBtn.innerHTML = '<span>🎛️</span> Master';
        alert(`❌ Mastering failed: ${err.message}`);
        return null;
      }
    }

    /**
     * Poll mastering job status until completion
     */
    async function pollMasteringJob(jobId) {
      if (!jobId) {
        console.error('❌ No jobId provided for polling');
        return;
      }

      try {
        console.log(`🔄 Polling job status: ${jobId}`);
        
        const res = await fetch(`${API}/master-status/${jobId}`);
        
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

          // Update UI
          statusBar.className = 'status-bar';
          statusText.textContent = `✅ Mastered with ${state.selectedPreset} preset`;
          if (downloadReady) downloadReady.classList.add('show');
          if (downloadWav) downloadWav.disabled = false;
          if (downloadMp3) downloadMp3.disabled = false;

          // Reload usage stats
          if (state.loadUsageStats) {
            setTimeout(() => state.loadUsageStats(), 500);
          }

          masterBtn.disabled = false;
          masterBtn.innerHTML = '<span>🎛️</span> Master';
          
          console.log('✅ Mastering completed successfully');
          return;
        }

        // Job failed
        if (status.status === 'failed') {
          statusBar.className = 'status-bar error';
          statusText.textContent = `❌ ${status.error || 'Mastering failed'}`;
          masterBtn.disabled = false;
          masterBtn.innerHTML = '<span>🎛️</span> Master';
          alert(`❌ Mastering failed: ${status.error || 'Unknown error'}`);
          return;
        }

        // Still processing
        statusText.textContent = status.message || '🔄 Processing...';
        setTimeout(() => pollMasteringJob(jobId), 3000);

      } catch (err) {
        console.error('❌ Polling error:', err);
        statusText.textContent = '🔄 Checking status... (retrying)';
        setTimeout(() => pollMasteringJob(jobId), 3000);
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

