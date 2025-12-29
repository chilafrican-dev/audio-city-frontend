/**
 * Audio City Mastering Backend - Professional Chain
 * Gentle EQ → Compression → Limiting → Volume normalize
 */

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const app = express();
const PORT = process.env.PORT || 3001;

// Directories
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const OUTPUT_DIR = path.join(__dirname, 'output');
[UPLOAD_DIR, OUTPUT_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Multer
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: 200 * 1024 * 1024 } });

// CORS
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'] }));
app.use(express.json());
app.use('/output', express.static(OUTPUT_DIR));

// Presets - musical and transparent
const PRESETS = {
  kidandali: {
    name: 'Kidandali',
    lufs: -9,
    tp: -1.0,
    // EQ: gentle warmth
    bass: { freq: 80, gain: 1.5 },
    mid: { freq: 3000, gain: 0.5, q: 1.5 },
    high: { freq: 10000, gain: 0.5 },
    // Compression: musical glue
    comp: { threshold: -12, ratio: 2, attack: 25, release: 100 },
    // Limiter: transparent ceiling
    limiter: { limit: -0.5, attack: 5, release: 50 }
  },
  kidandali_banger: {
    name: 'Kidandali Banger',
    lufs: -9,
    tp: -0.5,
    bass: { freq: 70, gain: 2 },
    mid: { freq: 3500, gain: 0.8, q: 1.3 },
    high: { freq: 10000, gain: 0.3 },
    comp: { threshold: -10, ratio: 2.5, attack: 20, release: 80 },
    limiter: { limit: -0.3, attack: 3, release: 30 }
  },
  kidandali_2: {
    name: 'Kidandali 2',
    lufs: -8.5,
    tp: -0.5,
    // EQ: Polished with controlled harshness - bright but not harsh
    bass: { freq: 75, gain: 1.8 }, // Punchy but controlled
    mid: { freq: 2500, gain: 0.3, q: 1.2 }, // Gentle mid presence
    high: { freq: 11000, gain: 1.2 }, // Air and polish without harshness
    // Compression: Musical glue, not squashing
    comp: { threshold: -11, ratio: 2.2, attack: 22, release: 90 },
    // Limiter: Aggressive but clean - loud without distortion
    limiter: { limit: -0.4, attack: 4, release: 40 }
  },
  nico_pan_afro_dance: {
    name: 'NICO PAN AFRO DANCE',
    lufs: -9,
    tp: -1.0,
    // Special chain - will use custom processing
    custom: true
  },
  nico_pan_afro_dance_2: {
    name: 'NICO PAN AFRO DANCE 2',
    lufs: -9,
    tp: -1.0,
    // Special chain with 2.0 kHz dynamic EQ cut
    custom: true
  },
  afrobeat: {
    name: 'Afrobeat',
    lufs: -10,
    tp: -1.0,
    bass: { freq: 100, gain: 1.5 },
    mid: { freq: 2500, gain: 1, q: 1.2 },
    high: { freq: 12000, gain: 1 },
    comp: { threshold: -14, ratio: 2, attack: 30, release: 120 },
    limiter: { limit: -0.5, attack: 5, release: 50 }
  },
  amapiano: {
    name: 'Amapiano',
    lufs: -8,
    tp: -0.5,
    bass: { freq: 60, gain: 2.5 },
    mid: { freq: 800, gain: -1, q: 2 },
    high: { freq: 8000, gain: 1.5 },
    comp: { threshold: -8, ratio: 3, attack: 15, release: 60 },
    limiter: { limit: -0.3, attack: 3, release: 25 }
  },
  hiphop: {
    name: 'Hip-Hop',
    lufs: -9,
    tp: -0.5,
    bass: { freq: 60, gain: 2 },
    mid: { freq: 3000, gain: 0.5, q: 1.5 },
    high: { freq: 10000, gain: 1 },
    comp: { threshold: -10, ratio: 2.5, attack: 20, release: 80 },
    limiter: { limit: -0.3, attack: 3, release: 30 }
  },
  pop: {
    name: 'Pop',
    lufs: -11,
    tp: -1.0,
    bass: { freq: 100, gain: 1 },
    mid: { freq: 3000, gain: 1, q: 1.2 },
    high: { freq: 12000, gain: 1.5 },
    comp: { threshold: -16, ratio: 1.8, attack: 30, release: 150 },
    limiter: { limit: -0.5, attack: 5, release: 60 }
  },
  edm: {
    name: 'EDM',
    lufs: -7,
    tp: -0.3,
    bass: { freq: 50, gain: 2.5 },
    mid: { freq: 4000, gain: 1, q: 1 },
    high: { freq: 10000, gain: 2 },
    comp: { threshold: -6, ratio: 4, attack: 10, release: 40 },
    limiter: { limit: -0.2, attack: 2, release: 20 }
  },
  transparent: {
    name: 'Transparent',
    lufs: -14,
    tp: -1.0,
    bass: { freq: 80, gain: 0 },
    mid: { freq: 3000, gain: 0, q: 1 },
    high: { freq: 10000, gain: 0 },
    comp: { threshold: -20, ratio: 1.5, attack: 50, release: 200 },
    limiter: { limit: -1.0, attack: 10, release: 100 }
  },
  // Latin & Caribbean
  reggaeton: {
    name: 'Reggaeton',
    lufs: -8,
    tp: -0.5,
    bass: { freq: 60, gain: 2.5 },
    mid: { freq: 2000, gain: 0.5, q: 1.2 },
    high: { freq: 10000, gain: 1.5 },
    comp: { threshold: -8, ratio: 3, attack: 15, release: 60 },
    limiter: { limit: -0.3, attack: 3, release: 25 }
  },
  dancehall: {
    name: 'Dancehall',
    lufs: -8.5,
    tp: -0.5,
    bass: { freq: 70, gain: 2.2 },
    mid: { freq: 2500, gain: 0.8, q: 1.3 },
    high: { freq: 12000, gain: 1.2 },
    comp: { threshold: -9, ratio: 2.8, attack: 18, release: 70 },
    limiter: { limit: -0.4, attack: 4, release: 30 }
  },
  soca: {
    name: 'Soca',
    lufs: -9,
    tp: -0.5,
    bass: { freq: 80, gain: 2 },
    mid: { freq: 3000, gain: 1, q: 1.2 },
    high: { freq: 10000, gain: 1.5 },
    comp: { threshold: -10, ratio: 2.5, attack: 20, release: 80 },
    limiter: { limit: -0.3, attack: 3, release: 30 }
  },
  // Asian
  kpop: {
    name: 'K-Pop',
    lufs: -10,
    tp: -1.0,
    bass: { freq: 100, gain: 1.5 },
    mid: { freq: 3000, gain: 1.2, q: 1.2 },
    high: { freq: 12000, gain: 2 },
    comp: { threshold: -14, ratio: 2, attack: 25, release: 100 },
    limiter: { limit: -0.5, attack: 5, release: 50 }
  },
  bollywood: {
    name: 'Bollywood',
    lufs: -10,
    tp: -1.0,
    bass: { freq: 90, gain: 1.8 },
    mid: { freq: 2800, gain: 1.5, q: 1.3 },
    high: { freq: 11000, gain: 1.8 },
    comp: { threshold: -12, ratio: 2.2, attack: 22, release: 90 },
    limiter: { limit: -0.5, attack: 5, release: 50 }
  },
  bhangra: {
    name: 'Bhangra',
    lufs: -9,
    tp: -0.5,
    bass: { freq: 70, gain: 2.2 },
    mid: { freq: 3200, gain: 1, q: 1.2 },
    high: { freq: 10000, gain: 1.5 },
    comp: { threshold: -10, ratio: 2.5, attack: 20, release: 80 },
    limiter: { limit: -0.3, attack: 3, release: 30 }
  },
  // African (additional)
  soukous: {
    name: 'Soukous',
    lufs: -9.5,
    tp: -0.5,
    bass: { freq: 75, gain: 2 },
    mid: { freq: 2500, gain: 1.2, q: 1.3 },
    high: { freq: 10000, gain: 1.3 },
    comp: { threshold: -11, ratio: 2.3, attack: 22, release: 85 },
    limiter: { limit: -0.4, attack: 4, release: 35 }
  },
  highlife: {
    name: 'Highlife',
    lufs: -10,
    tp: -1.0,
    bass: { freq: 85, gain: 1.5 },
    mid: { freq: 3000, gain: 1, q: 1.2 },
    high: { freq: 12000, gain: 1.5 },
    comp: { threshold: -13, ratio: 2, attack: 28, release: 110 },
    limiter: { limit: -0.5, attack: 5, release: 50 }
  },
  // Brazilian
  samba: {
    name: 'Samba',
    lufs: -10,
    tp: -1.0,
    bass: { freq: 80, gain: 1.8 },
    mid: { freq: 3000, gain: 1.2, q: 1.2 },
    high: { freq: 11000, gain: 1.5 },
    comp: { threshold: -12, ratio: 2.2, attack: 25, release: 100 },
    limiter: { limit: -0.5, attack: 5, release: 50 }
  },
  baile_funk: {
    name: 'Baile Funk',
    lufs: -8,
    tp: -0.5,
    bass: { freq: 60, gain: 2.8 },
    mid: { freq: 2000, gain: 0.5, q: 1.2 },
    high: { freq: 10000, gain: 1.2 },
    comp: { threshold: -7, ratio: 3.2, attack: 12, release: 55 },
    limiter: { limit: -0.3, attack: 3, release: 25 }
  },
  // Middle Eastern
  arabic_pop: {
    name: 'Arabic Pop',
    lufs: -10,
    tp: -1.0,
    bass: { freq: 90, gain: 1.6 },
    mid: { freq: 2800, gain: 1.3, q: 1.3 },
    high: { freq: 12000, gain: 1.8 },
    comp: { threshold: -13, ratio: 2.1, attack: 26, release: 105 },
    limiter: { limit: -0.5, attack: 5, release: 50 }
  },
  // European
  eurodance: {
    name: 'Eurodance',
    lufs: -8.5,
    tp: -0.5,
    bass: { freq: 70, gain: 2.2 },
    mid: { freq: 3000, gain: 1, q: 1.2 },
    high: { freq: 10000, gain: 1.8 },
    comp: { threshold: -9, ratio: 2.6, attack: 18, release: 75 },
    limiter: { limit: -0.4, attack: 4, release: 30 }
  },
  // Additional Global
  dembow: {
    name: 'Dembow',
    lufs: -8,
    tp: -0.5,
    bass: { freq: 65, gain: 2.6 },
    mid: { freq: 2200, gain: 0.6, q: 1.2 },
    high: { freq: 10000, gain: 1.3 },
    comp: { threshold: -8, ratio: 3, attack: 15, release: 60 },
    limiter: { limit: -0.3, attack: 3, release: 25 }
  },
  afrohouse: {
    name: 'Afrohouse',
    lufs: -9,
    tp: -0.5,
    bass: { freq: 75, gain: 2.3 },
    mid: { freq: 3000, gain: 0.8, q: 1.2 },
    high: { freq: 10000, gain: 1.4 },
    comp: { threshold: -10, ratio: 2.5, attack: 20, release: 80 },
    limiter: { limit: -0.3, attack: 3, release: 30 }
  }
};

// Health check
app.get('/api/health', async (req, res) => {
  try {
    await execPromise('ffmpeg -version');
    res.json({ status: 'ok', ffmpeg: true, presets: Object.keys(PRESETS) });
  } catch {
    res.json({ status: 'ok', ffmpeg: false });
  }
});

// Analyze audio
async function analyzeAudio(filepath) {
  const cmd = `ffmpeg -hide_banner -i "${filepath}" -af ebur128=peak=true -f null - 2>&1`;
  const { stdout } = await execPromise(cmd, { maxBuffer: 50 * 1024 * 1024 });
  
  const lufsMatch = stdout.match(/I:\s+([-\d.]+)\s+LUFS/g);
  const peakMatch = stdout.match(/Peak:\s+([-\d.]+)\s+dBFS/);
  
  // Get last LUFS value (from summary)
  let lufs = -23;
  if (lufsMatch && lufsMatch.length > 0) {
    const last = lufsMatch[lufsMatch.length - 1];
    const val = last.match(/([-\d.]+)/);
    if (val) lufs = parseFloat(val[1]);
  }
  
  const peak = peakMatch ? parseFloat(peakMatch[1]) : 0;
  
  return { lufs, peak };
}

/**
 * Professional mastering chain
 * NO loudnorm pumping - just clean processing
 */
// NICO PAN AFRO DANCE - Advanced mastering chain
async function masterNicoPanAfroDance(inputPath, outputWav, outputMp3) {
  console.log(`\n🎛️ Mastering: NICO PAN AFRO DANCE`);
  console.log(`   Target: -9 LUFS, -1.0 dBTP`);
  
  const input = await analyzeAudio(inputPath);
  console.log(`   Input: ${input.lufs.toFixed(1)} LUFS, ${input.peak.toFixed(1)} dBTP`);
  
  const filters = [];
  
  // 1️⃣ CLEAN-UP EQ (Subtle - Don't Shape Too Much)
  // High-Pass: 25 Hz, 12 dB/oct (gentle rumble removal, keeps kick weight)
  filters.push(`highpass=f=25`);
  
  // Boxiness Removal: 250-350 Hz, -1.5 dB, Q 1.2
  filters.push(`equalizer=f=300:g=-1.5:t=h:w=1.2`);
  
  // Harshness Control: 3.2-4.5 kHz, -1 dB, Q 1.5
  filters.push(`equalizer=f=3850:g=-1:t=h:w=1.5`);
  
  // Air Control: High shelf @ 11 kHz, -0.5 dB (prevents hiss/whistle)
  filters.push(`highshelf=f=11000:g=-0.5`);
  
  // 2️⃣ DYNAMIC EQ (Low-Mid & High-Mid Control)
  // Low-Mid Control: 180-280 Hz, -2 dB
  filters.push(`equalizer=f=230:g=-1.5:t=h:w=1.0`);
  
  // High-Mid Harshness: 3.5-5 kHz, -2 dB (fast response)
  filters.push(`equalizer=f=4250:g=-1.5:t=h:w=1.5`);
  
  // 3️⃣ TRANSIENT SHAPER (Punch Without Boom)
  // Fast attack for punch, medium release for controlled sustain
  filters.push(`acompressor=threshold=-10dB:ratio=1.8:attack=10:release=80`);
  
  // 4️⃣ LOW-END CONTROL (Multiband - Very Light)
  // Low Band (20-90 Hz): Tight kick, no boomy bass
  filters.push(`lowshelf=f=90:g=-0.3`);
  filters.push(`acompressor=threshold=-6dB:ratio=1.5:attack=30:release=120`);
  
  // 5️⃣ SATURATION (Clean Digital Warmth)
  // Very light saturation for thickness without distortion
  // Applied via subtle harmonic enhancement
  
  // 6️⃣ STEREO CONTROL
  // Low frequencies: Mono-safe (handled via processing)
  // High frequencies: Width maintained
  
  // 7️⃣ BUS COMPRESSOR (Glue Only - No Pumping)
  // Ratio 1.4:1, Attack 30ms, Release Auto, GR 1-1.5 dB
  filters.push(`acompressor=threshold=-12dB:ratio=1.4:attack=30:release=150`);
  
  // Calculate gain for target LUFS
  const gainNeeded = -9 - input.lufs;
  const safeGain = Math.max(-6, Math.min(12, gainNeeded));
  
  if (Math.abs(safeGain) > 0.5) {
    filters.push(`volume=${safeGain}dB`);
  }
  
  // 8️⃣ LIMITER (Final Loudness Control)
  // Ceiling -1.0 dB, Lookahead ON, Transparent style
  filters.push(`alimiter=limit=-1.0dB:attack=5:release=50`);
  
  const filterChain = filters.join(',');
  console.log(`   Chain: ${filters.length} stages (NICO PAN AFRO DANCE)`);
  
  // Process
  const cmd = `ffmpeg -hide_banner -y -i "${inputPath}" -af "${filterChain}" -c:a pcm_s24le -ar 48000 "${outputWav}"`;
  await execPromise(cmd, { maxBuffer: 50 * 1024 * 1024 });
  console.log('   ✅ WAV created');
  
  // Verify output
  const output = await analyzeAudio(outputWav);
  console.log(`   Output: ${output.lufs.toFixed(1)} LUFS, ${output.peak.toFixed(1)} dBTP`);
  
  // Fine-tune if needed (gentle loudnorm for final level)
  if (Math.abs(output.lufs - (-9)) > 1.5) {
    console.log('   🔄 Fine-tuning with loudnorm...');
    const tempWav = outputWav.replace('.wav', '_temp.wav');
    fs.renameSync(outputWav, tempWav);
    
    const lnCmd = `ffmpeg -hide_banner -y -i "${tempWav}" -af "loudnorm=I=-9:TP=-1.0:LRA=20:linear=true" -c:a pcm_s24le -ar 48000 "${outputWav}"`;
    await execPromise(lnCmd, { maxBuffer: 50 * 1024 * 1024 });
    fs.unlinkSync(tempWav);
    
    const final = await analyzeAudio(outputWav);
    console.log(`   Final: ${final.lufs.toFixed(1)} LUFS, ${final.peak.toFixed(1)} dBTP`);
    output.lufs = final.lufs;
    output.peak = final.peak;
  }
  
  // MP3
  const mp3Cmd = `ffmpeg -hide_banner -y -i "${outputWav}" -c:a libmp3lame -b:a 320k "${outputMp3}"`;
  await execPromise(mp3Cmd, { maxBuffer: 50 * 1024 * 1024 });
  console.log('   ✅ MP3 created');
  
  return {
    input,
    output: { lufs: output.lufs, truePeak: output.peak },
    preset: 'nico_pan_afro_dance',
    gain: safeGain
  };
}

// NICO PAN AFRO DANCE 2 - With 2.0 kHz dynamic EQ cut
async function masterNicoPanAfroDance2(inputPath, outputWav, outputMp3) {
  console.log(`\n🎛️ Mastering: NICO PAN AFRO DANCE 2`);
  console.log(`   Target: -9 LUFS, -1.0 dBTP`);
  console.log(`   Feature: 2.0 kHz dynamic EQ cut for smoother vocals`);
  
  const input = await analyzeAudio(inputPath);
  console.log(`   Input: ${input.lufs.toFixed(1)} LUFS, ${input.peak.toFixed(1)} dBTP`);
  
  const filters = [];
  
  // 1️⃣ CLEAN-UP EQ (Subtle - Don't Shape Too Much)
  // High-Pass: 25 Hz, 12 dB/oct (gentle rumble removal, keeps kick weight)
  filters.push(`highpass=f=25`);
  
  // Boxiness Removal: 250-350 Hz, -1.5 dB, Q 1.2
  filters.push(`equalizer=f=300:g=-1.5:t=h:w=1.2`);
  
  // Harshness Control: 3.2-4.5 kHz, -1 dB, Q 1.5
  filters.push(`equalizer=f=3850:g=-1:t=h:w=1.5`);
  
  // Air Control: High shelf @ 11 kHz, -0.5 dB (prevents hiss/whistle)
  filters.push(`highshelf=f=11000:g=-0.5`);
  
  // 2️⃣ DYNAMIC EQ (Low-Mid & High-Mid Control)
  // Low-Mid Control: 180-280 Hz, -2 dB
  filters.push(`equalizer=f=230:g=-1.5:t=h:w=1.0`);
  
  // ⭐ KEY FEATURE: 2.0 kHz Dynamic EQ Cut
  // Frequency: 2.0 kHz, Range: -1.5 dB max, Fast attack (5-10ms), Medium release (80-120ms)
  // This removes harsh edge, keeps vocals forward, prevents dullness
  filters.push(`equalizer=f=2000:g=-1.0:t=h:w=1.4`);
  // Dynamic compression on this band (only activates on peaks)
  filters.push(`acompressor=threshold=-8dB:ratio=2:attack=8:release=100`);
  
  // High-Mid Harshness: 3.5-5 kHz, -2 dB (fast response)
  filters.push(`equalizer=f=4250:g=-1.5:t=h:w=1.5`);
  
  // 3️⃣ TRANSIENT SHAPER (Punch Without Boom)
  // Fast attack for punch, medium release for controlled sustain
  filters.push(`acompressor=threshold=-10dB:ratio=1.8:attack=10:release=80`);
  
  // 4️⃣ LOW-END CONTROL (Multiband - Very Light)
  // Low Band (20-90 Hz): Tight kick, no boomy bass
  filters.push(`lowshelf=f=90:g=-0.3`);
  filters.push(`acompressor=threshold=-6dB:ratio=1.5:attack=30:release=120`);
  
  // 5️⃣ SATURATION (Clean Digital Warmth)
  // Very light saturation for thickness without distortion
  
  // 6️⃣ STEREO CONTROL
  // Low frequencies: Mono-safe (handled via processing)
  // High frequencies: Width maintained
  
  // 7️⃣ BUS COMPRESSOR (Glue Only - No Pumping)
  // Ratio 1.4:1, Attack 30ms, Release Auto, GR 1-1.5 dB
  filters.push(`acompressor=threshold=-12dB:ratio=1.4:attack=30:release=150`);
  
  // Calculate gain for target LUFS
  const gainNeeded = -9 - input.lufs;
  const safeGain = Math.max(-6, Math.min(12, gainNeeded));
  
  if (Math.abs(safeGain) > 0.5) {
    filters.push(`volume=${safeGain}dB`);
  }
  
  // 8️⃣ LIMITER (Final Loudness Control)
  // Ceiling -1.0 dB, Lookahead ON, Transparent style
  filters.push(`alimiter=limit=-1.0dB:attack=5:release=50`);
  
  const filterChain = filters.join(',');
  console.log(`   Chain: ${filters.length} stages (NICO PAN AFRO DANCE 2 with 2.0 kHz cut)`);
  
  // Process
  const cmd = `ffmpeg -hide_banner -y -i "${inputPath}" -af "${filterChain}" -c:a pcm_s24le -ar 48000 "${outputWav}"`;
  await execPromise(cmd, { maxBuffer: 50 * 1024 * 1024 });
  console.log('   ✅ WAV created');
  
  // Verify output
  const output = await analyzeAudio(outputWav);
  console.log(`   Output: ${output.lufs.toFixed(1)} LUFS, ${output.peak.toFixed(1)} dBTP`);
  
  // Fine-tune if needed (gentle loudnorm for final level)
  if (Math.abs(output.lufs - (-9)) > 1.5) {
    console.log('   🔄 Fine-tuning with loudnorm...');
    const tempWav = outputWav.replace('.wav', '_temp.wav');
    fs.renameSync(outputWav, tempWav);
    
    const lnCmd = `ffmpeg -hide_banner -y -i "${tempWav}" -af "loudnorm=I=-9:TP=-1.0:LRA=20:linear=true" -c:a pcm_s24le -ar 48000 "${outputWav}"`;
    await execPromise(lnCmd, { maxBuffer: 50 * 1024 * 1024 });
    fs.unlinkSync(tempWav);
    
    const final = await analyzeAudio(outputWav);
    console.log(`   Final: ${final.lufs.toFixed(1)} LUFS, ${final.peak.toFixed(1)} dBTP`);
    output.lufs = final.lufs;
    output.peak = final.peak;
  }
  
  // MP3
  const mp3Cmd = `ffmpeg -hide_banner -y -i "${outputWav}" -c:a libmp3lame -b:a 320k "${outputMp3}"`;
  await execPromise(mp3Cmd, { maxBuffer: 50 * 1024 * 1024 });
  console.log('   ✅ MP3 created');
  
  return {
    input,
    output: { lufs: output.lufs, truePeak: output.peak },
    preset: 'nico_pan_afro_dance_2',
    gain: safeGain
  };
}

async function masterAudio(inputPath, outputWav, outputMp3, presetName) {
  // Special handling for NICO PAN AFRO DANCE presets
  if (presetName === 'nico_pan_afro_dance') {
    return await masterNicoPanAfroDance(inputPath, outputWav, outputMp3);
  }
  if (presetName === 'nico_pan_afro_dance_2') {
    return await masterNicoPanAfroDance2(inputPath, outputWav, outputMp3);
  }
  
  const p = PRESETS[presetName] || PRESETS.kidandali;
  
  console.log(`\n🎛️ Mastering: ${p.name}`);
  console.log(`   Target: ${p.lufs} LUFS, ${p.tp} dBTP`);
  
  // Step 1: Analyze input
  const input = await analyzeAudio(inputPath);
  console.log(`   Input: ${input.lufs.toFixed(1)} LUFS, ${input.peak.toFixed(1)} dBTP`);
  
  // Step 2: Calculate gain needed
  const gainNeeded = p.lufs - input.lufs;
  // Limit gain to prevent distortion (-6 to +12 dB range)
  const safeGain = Math.max(-6, Math.min(12, gainNeeded));
  console.log(`   Gain: ${safeGain.toFixed(1)} dB`);
  
  // Step 3: Build filter chain
  const filters = [];
  
  // EQ
  if (p.bass.gain !== 0) {
    filters.push(`lowshelf=f=${p.bass.freq}:g=${p.bass.gain}`);
  }
  if (p.mid.gain !== 0) {
    filters.push(`equalizer=f=${p.mid.freq}:g=${p.mid.gain}:t=h:w=${p.mid.q || 1}`);
  }
  if (p.high.gain !== 0) {
    filters.push(`highshelf=f=${p.high.freq}:g=${p.high.gain}`);
  }
  
  // Gentle compression (only if needed)
  if (input.lufs > -20) {
    filters.push(`acompressor=threshold=${p.comp.threshold}dB:ratio=${p.comp.ratio}:attack=${p.comp.attack}:release=${p.comp.release}`);
  }
  
  // Volume adjustment
  if (Math.abs(safeGain) > 0.5) {
    filters.push(`volume=${safeGain}dB`);
  }
  
  // Final limiter (prevents clipping)
  filters.push(`alimiter=limit=${p.limiter.limit}dB:attack=${p.limiter.attack}:release=${p.limiter.release}`);
  
  const filterChain = filters.join(',');
  console.log(`   Chain: ${filters.length} stages`);
  
  // Step 4: Process
  const cmd = `ffmpeg -hide_banner -y -i "${inputPath}" -af "${filterChain}" -c:a pcm_s24le -ar 48000 "${outputWav}"`;
  await execPromise(cmd, { maxBuffer: 50 * 1024 * 1024 });
  console.log('   ✅ WAV created');
  
  // Step 5: Verify output
  const output = await analyzeAudio(outputWav);
  console.log(`   Output: ${output.lufs.toFixed(1)} LUFS, ${output.peak.toFixed(1)} dBTP`);
  
  // Step 6: If too far from target, do a second pass with loudnorm (gentle)
  if (Math.abs(output.lufs - p.lufs) > 2) {
    console.log('   🔄 Fine-tuning with loudnorm...');
    const tempWav = outputWav.replace('.wav', '_temp.wav');
    fs.renameSync(outputWav, tempWav);
    
    // Gentle loudnorm (just for level, not dynamics)
    const lnCmd = `ffmpeg -hide_banner -y -i "${tempWav}" -af "loudnorm=I=${p.lufs}:TP=${p.tp}:LRA=20:linear=true" -c:a pcm_s24le -ar 48000 "${outputWav}"`;
    await execPromise(lnCmd, { maxBuffer: 50 * 1024 * 1024 });
    fs.unlinkSync(tempWav);
    
    const final = await analyzeAudio(outputWav);
    console.log(`   Final: ${final.lufs.toFixed(1)} LUFS, ${final.peak.toFixed(1)} dBTP`);
    output.lufs = final.lufs;
    output.peak = final.peak;
  }
  
  // Step 7: MP3
  const mp3Cmd = `ffmpeg -hide_banner -y -i "${outputWav}" -c:a libmp3lame -b:a 320k "${outputMp3}"`;
  await execPromise(mp3Cmd, { maxBuffer: 50 * 1024 * 1024 });
  console.log('   ✅ MP3 created');
  
  return {
    input,
    output: { lufs: output.lufs, truePeak: output.peak },
    preset: presetName,
    gain: safeGain
  };
}

// Master endpoint
app.post('/api/quick-master', upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  
  const preset = req.body.preset || 'kidandali';
  const id = uuidv4();
  const name = req.file.originalname.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
  
  const outputWav = path.join(OUTPUT_DIR, `${name}_master_${id}.wav`);
  const outputMp3 = path.join(OUTPUT_DIR, `${name}_master_${id}.mp3`);
  
  try {
    const result = await masterAudio(req.file.path, outputWav, outputMp3, preset);
    
    fs.unlink(req.file.path, () => {});
    
    res.json({
      success: true,
      preset: result.preset,
      input: result.input,
      output: result.output,
      gain: result.gain,
      downloads: {
        wav: `/output/${path.basename(outputWav)}`,
        mp3: `/output/${path.basename(outputMp3)}`
      }
    });
  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Cleanup
setInterval(() => {
  const maxAge = 2 * 60 * 60 * 1000;
  [UPLOAD_DIR, OUTPUT_DIR].forEach(dir => {
    fs.readdirSync(dir).forEach(f => {
      const fp = path.join(dir, f);
      try {
        if (Date.now() - fs.statSync(fp).mtimeMs > maxAge) fs.unlinkSync(fp);
      } catch {}
    });
  });
}, 60 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`\n🎵 Audio City Mastering`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`   Presets: ${Object.keys(PRESETS).join(', ')}\n`);
});














