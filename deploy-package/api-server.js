/**
 * Audio City Local API Server for Development
 * Provides mock data for tracks, artists, and feed endpoints
 */

// Load environment variables
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// R2 Storage (Cloudflare R2 for tracks & images)
const { uploadBufferToR2, uploadToR2, deleteFromR2 } = require('./r2-storage');

const app = express();
const PORT = process.env.API_PORT || 3002;

// Create profiles directory
const PROFILES_DIR = path.join(__dirname, 'uploads', 'profiles');
if (!fs.existsSync(PROFILES_DIR)) {
  fs.mkdirSync(PROFILES_DIR, { recursive: true });
}

// Create tracks directory
const TRACKS_DIR = path.join(__dirname, 'uploads', 'tracks');
if (!fs.existsSync(TRACKS_DIR)) {
  fs.mkdirSync(TRACKS_DIR, { recursive: true });
}

// Create output directory for mastered files
const OUTPUT_DIR = path.join(__dirname, 'output');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Create uploads directory for mastering
const MASTERING_UPLOAD_DIR = path.join(__dirname, 'uploads', 'mastering');
if (!fs.existsSync(MASTERING_UPLOAD_DIR)) {
  fs.mkdirSync(MASTERING_UPLOAD_DIR, { recursive: true });
}

// Create voice tag directory
const VOICE_TAG_DIR = path.join(__dirname, 'voice-tags');
if (!fs.existsSync(VOICE_TAG_DIR)) {
  fs.mkdirSync(VOICE_TAG_DIR, { recursive: true });
}

// Voice tag file path (user can upload their own voice tag)
const DEFAULT_VOICE_TAG = path.join(VOICE_TAG_DIR, 'voice-tag.wav');
// Also support MP3 voice tags
const VOICE_TAG_MP3 = path.join(VOICE_TAG_DIR, 'voice-tag.mp3');

// Create data directory for persistent storage
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Persistent user storage file
const USERS_STORAGE_FILE = path.join(DATA_DIR, 'users.json');
// Persistent stats storage file
const STATS_STORAGE_FILE = path.join(DATA_DIR, 'stats.json');
// Persistent follows storage file
const FOLLOWS_STORAGE_FILE = path.join(DATA_DIR, 'follows.json');
// Persistent messages storage file
const MESSAGES_STORAGE_FILE = path.join(DATA_DIR, 'messages.json');

// Stats storage
let statsStorage = {
  tracksMastered: 0,
  totalVisitors: 0,
  uniqueVisitors: [],
  visitorsByDate: {}, // { "2024-01-01": { total: 10, unique: [] } }
  lastUpdated: new Date().toISOString()
};

// Load stats from file
function loadStatsStorage() {
  try {
    if (fs.existsSync(STATS_STORAGE_FILE)) {
      const data = fs.readFileSync(STATS_STORAGE_FILE, 'utf8');
      const loaded = JSON.parse(data);
      statsStorage = {
        tracksMastered: loaded.tracksMastered || 0,
        totalVisitors: loaded.totalVisitors || 0,
        uniqueVisitors: Array.isArray(loaded.uniqueVisitors) ? loaded.uniqueVisitors : [],
        visitorsByDate: loaded.visitorsByDate || {},
        lastUpdated: loaded.lastUpdated || new Date().toISOString()
      };
    }
  } catch (err) {
    console.error('Error loading stats:', err);
    statsStorage = {
      tracksMastered: 0,
      totalVisitors: 0,
      uniqueVisitors: [],
      visitorsByDate: {},
      lastUpdated: new Date().toISOString()
    };
  }
}

// Save stats to file
function saveStatsStorage() {
  try {
    statsStorage.lastUpdated = new Date().toISOString();
    fs.writeFileSync(STATS_STORAGE_FILE, JSON.stringify(statsStorage, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving stats:', err);
  }
}

// Track visitor
function trackVisitor(req) {
  try {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.get('user-agent') || 'unknown';
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Create unique visitor ID (IP + User Agent hash)
    const visitorId = Buffer.from(`${ip}-${userAgent}`).toString('base64').substring(0, 32);
    
    // Initialize date entry if needed
    if (!statsStorage.visitorsByDate[today]) {
      statsStorage.visitorsByDate[today] = { total: 0, unique: [] };
    }
    
    // Track total visitors
    statsStorage.totalVisitors++;
    statsStorage.visitorsByDate[today].total++;
    
    // Track unique visitors
    if (!statsStorage.uniqueVisitors.includes(visitorId)) {
      statsStorage.uniqueVisitors.push(visitorId);
    }
    
    // Track unique visitors for today
    if (!statsStorage.visitorsByDate[today].unique.includes(visitorId)) {
      statsStorage.visitorsByDate[today].unique.push(visitorId);
    }
    
    statsStorage.lastUpdated = new Date().toISOString();
    saveStatsStorage();
  } catch (err) {
    console.error('Error tracking visitor:', err);
  }
}

// Load stats on startup
loadStatsStorage();

// Multer configuration for profile pictures
// Use memory storage for R2 uploads
const profileUpload = multer({
  storage: multer.memoryStorage(), // Store in memory, then upload to R2
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Multer configuration for tracks (audio uploads)
// Use memory storage for R2 uploads (upload directly from buffer)
const trackUpload = multer({
  storage: multer.memoryStorage(), // Store in memory, then upload to R2
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /audio|mpeg|mp3|wav|ogg|m4a|aac/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'));
    }
  }
});

// Multer configuration for mastering uploads
const masteringStorage = multer.diskStorage({
  destination: MASTERING_UPLOAD_DIR,
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`)
});
const masteringUpload = multer({ 
  storage: masteringStorage, 
  limits: { fileSize: 200 * 1024 * 1024 } // 200MB limit
});

// CORS - Allow all methods including DELETE
// In production, you can restrict origin to specific domains for better security
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : (process.env.NODE_ENV === 'production' 
      ? ['https://www.audiocity-ug.com', 'https://audiocity-ug.com', 'https://audio-city-frontend.pages.dev', 'https://*.pages.dev']
      : ['http://localhost:8000', 'http://localhost:3000', '*']); // Allow all in development

// CORS with function to handle wildcard subdomains
app.use(cors({ 
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // If allowedOrigins is '*', allow all
    if (allowedOrigins === '*') return callback(null, true);
    
    // Check exact matches
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // Check for wildcard patterns (e.g., *.pages.dev)
    for (const allowed of allowedOrigins) {
      if (allowed.includes('*')) {
        const pattern = allowed.replace(/\*/g, '.*');
        const regex = new RegExp(`^${pattern}$`);
        if (regex.test(origin)) {
          return callback(null, true);
        }
      }
    }
    
    callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Cache-Control'],
  credentials: true // Enable credentials for Passport.js sessions
}));

// Express session configuration (for Passport.js)
app.use(session({
  secret: process.env.SESSION_SECRET || 'audio-city-secret-key-change-in-production',
  resave: false,
  saveUninitialized: true, // Changed to true for Passport.js compatibility
  cookie: {
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax' // Helps with CORS and cross-site requests
  }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Handle preflight OPTIONS requests explicitly
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Cache-Control');
  res.sendStatus(200);
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Visitor tracking middleware (track all page visits)
app.use((req, res, next) => {
  // Track visitor for HTML pages (not API calls or static assets)
  if (req.path.endsWith('.html') || req.path === '/' || (req.path.startsWith('/') && !req.path.startsWith('/api') && !req.path.startsWith('/uploads'))) {
    trackVisitor(req);
  }
  next();
});

// Serve profile pictures
app.use('/uploads/profiles', express.static(PROFILES_DIR));
// Serve tracks
app.use('/uploads/tracks', express.static(TRACKS_DIR));
// Serve mastered output files
app.use('/output', express.static(OUTPUT_DIR));
// Serve voice tags directory (for management)
app.use('/voice-tags', express.static(VOICE_TAG_DIR));

// Generate mock track
function generateMockTrack(index = 0) {
  const genres = ['Afrobeat', 'Amapiano', 'Hip Hop', 'R&B', 'Pop', 'Dancehall', 'Reggae'];
  const artists = ['Artist One', 'Artist Two', 'Artist Three', 'Artist Four', 'Artist Five'];
  
  return {
    id: uuidv4(),
    title: `Track ${index + 1}`,
    song_title: `Track ${index + 1}`,
    artist_name: artists[index % artists.length],
    artistName: artists[index % artists.length],
    cover_art_url: `https://via.placeholder.com/300x300/8b5cf6/ffffff?text=Track+${index + 1}`,
    coverArtUrl: `https://via.placeholder.com/300x300/8b5cf6/ffffff?text=Track+${index + 1}`,
    audio_url: `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-${(index % 3) + 1}.mp3`,
    audioUrl: `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-${(index % 3) + 1}.mp3`,
    views_count: Math.floor(Math.random() * 10000) + 100,
    plays: Math.floor(Math.random() * 5000) + 50,
    genre: genres[index % genres.length],
    created_at: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
    duration: 180 + Math.floor(Math.random() * 120)
  };
}

// Generate mock artist
function generateMockArtist(index = 0) {
  const names = ['Artist One', 'Artist Two', 'Artist Three', 'Artist Four', 'Artist Five', 'Artist Six'];
  
  return {
    id: uuidv4(),
    username: names[index % names.length].toLowerCase().replace(/\s+/g, ''),
    display_name: names[index % names.length],
    avatar_url: `https://via.placeholder.com/200x200/6a0dad/ffffff?text=${encodeURIComponent(names[index % names.length].charAt(0))}`,
    bio: `This is a mock artist profile for ${names[index % names.length]}`,
    followers_count: Math.floor(Math.random() * 5000) + 100,
    tracks_count: Math.floor(Math.random() * 20) + 5,
    verified: index < 2
  };
}

// Routes

// Persistent tracks storage
const TRACKS_STORAGE_FILE = path.join(DATA_DIR, 'tracks.json');
let tracksStorage = [];

// Load tracks from file on startup
function loadTracksStorage() {
  try {
    if (fs.existsSync(TRACKS_STORAGE_FILE)) {
      const data = fs.readFileSync(TRACKS_STORAGE_FILE, 'utf8');
      tracksStorage = JSON.parse(data);
      console.log(`Loaded ${tracksStorage.length} tracks from storage`);
    }
  } catch (error) {
    console.error('Error loading tracks storage:', error);
    tracksStorage = [];
  }
}

// Save tracks to file
function saveTracksStorage() {
  try {
    fs.writeFileSync(TRACKS_STORAGE_FILE, JSON.stringify(tracksStorage, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving tracks storage:', error);
  }
}

// Load tracks on startup
loadTracksStorage();

// Persistent user storage (load from file on startup)
// Structure: Map<emailKey, { id, username, email, name, bio, location, avatar_url, created_at, ... }>
let usersStorage = new Map();

// Load users from file on startup
function loadUsersStorage() {
  try {
    if (fs.existsSync(USERS_STORAGE_FILE)) {
      const data = fs.readFileSync(USERS_STORAGE_FILE, 'utf8');
      const users = JSON.parse(data);
      usersStorage = new Map(Object.entries(users));
      console.log(`Loaded ${usersStorage.size} users from storage`);
    }
  } catch (error) {
    console.error('Error loading users storage:', error);
    usersStorage = new Map();
  }
}

// Save users to file
function saveUsersStorage() {
  try {
    const usersObj = Object.fromEntries(usersStorage);
    fs.writeFileSync(USERS_STORAGE_FILE, JSON.stringify(usersObj, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving users storage:', error);
  }
}

// Get user by ID (search through storage)
function getUserById(userId) {
  for (const user of usersStorage.values()) {
    if (user.id === userId) {
      return user;
    }
  }
  return null;
}

// Get user by email key
function getUserByEmailKey(emailKey) {
  return usersStorage.get(emailKey.toLowerCase()) || null;
}

// Follow relationships storage
// Structure: { "followerId:followeeId": true, ... }
let followsStorage = {};

// Load follows from file
function loadFollowsStorage() {
  try {
    if (fs.existsSync(FOLLOWS_STORAGE_FILE)) {
      const data = fs.readFileSync(FOLLOWS_STORAGE_FILE, 'utf8');
      followsStorage = JSON.parse(data);
      console.log(`Loaded ${Object.keys(followsStorage).length} follow relationships`);
    }
  } catch (error) {
    console.error('Error loading follows storage:', error);
    followsStorage = {};
  }
}

// Save follows to file
function saveFollowsStorage() {
  try {
    fs.writeFileSync(FOLLOWS_STORAGE_FILE, JSON.stringify(followsStorage, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving follows storage:', error);
  }
}

// Check if user A follows user B
function isFollowing(followerId, followeeId) {
  const key = `${followerId}:${followeeId}`;
  return followsStorage[key] === true;
}

// Toggle follow relationship
function toggleFollow(followerId, followeeId) {
  const key = `${followerId}:${followeeId}`;
  const isCurrentlyFollowing = followsStorage[key] === true;
  
  if (isCurrentlyFollowing) {
    delete followsStorage[key];
    return false; // Unfollowed
  } else {
    followsStorage[key] = true;
    return true; // Followed
  }
}

// Get follower count for a user
function getFollowerCount(userId) {
  return Object.keys(followsStorage).filter(key => key.endsWith(`:${userId}`)).length;
}

// Get following count for a user
function getFollowingCount(userId) {
  return Object.keys(followsStorage).filter(key => key.startsWith(`${userId}:`)).length;
}

// Load follows on startup
loadFollowsStorage();

// Load users on startup
loadUsersStorage();

// Configure Passport Google OAuth Strategy
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID_HERE';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'YOUR_GOOGLE_CLIENT_SECRET_HERE';
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL; // Can be undefined for dynamic URL

passport.use(new GoogleStrategy({
  clientID: GOOGLE_CLIENT_ID,
  clientSecret: GOOGLE_CLIENT_SECRET,
  callbackURL: GOOGLE_CALLBACK_URL || ((req) => {
    // Fallback: dynamically construct callback URL based on request
    return `${req.protocol}://${req.get('host')}/auth/google/callback`;
  }),
  passReqToCallback: true
}, async (req, accessToken, refreshToken, profile, done) => {
  try {
    loadUsersStorage();
    const emailKey = profile.emails[0].value.toLowerCase();
    let user = getUserByEmailKey(emailKey);
    
    if (!user) {
      // Create new user from Google account
      const userId = uuidv4();
      const username = profile.emails[0].value.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
      
      // Check if username is taken
      let finalUsername = username;
      let counter = 1;
      while (Array.from(usersStorage.values()).some(u => u.username === finalUsername)) {
        finalUsername = `${username}${counter}`;
        counter++;
      }
      
      user = {
        id: userId,
        username: finalUsername,
        email: profile.emails[0].value,
        name: profile.displayName || profile.name?.givenName || finalUsername,
        bio: null,
        location: null,
        avatar_url: profile.photos?.[0]?.value || null,
        profile_image: profile.photos?.[0]?.value || null,
        password: null, // No password for Google-authenticated users
        auth_provider: 'google',
        google_id: profile.id,
        followers_count: 0,
        following_count: 0,
        tracks_count: 0,
        verified: false,
        is_admin: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      usersStorage.set(emailKey, user);
      saveUsersStorage();
      console.log(`[GOOGLE SIGNUP] New user created: ${user.email}`);
    } else {
      // Update existing user with Google info if needed
      if (!user.auth_provider) {
        user.auth_provider = 'google';
        user.google_id = profile.id;
        if (profile.photos?.[0]?.value && !user.avatar_url) {
          user.avatar_url = profile.photos[0].value;
          user.profile_image = profile.photos[0].value;
        }
        user.updated_at = new Date().toISOString();
        usersStorage.set(emailKey, user);
        saveUsersStorage();
      }
      console.log(`[GOOGLE LOGIN] User logged in: ${user.email}`);
    }
    
    return done(null, user);
  } catch (error) {
    console.error('[GOOGLE OAUTH] Error in strategy:', error);
    return done(error, null);
  }
}));

// Passport serialization (store user in session)
passport.serializeUser((user, done) => {
  // Store user ID for efficiency, but can store full user object if needed
  done(null, user.id || user);
});

// Passport deserialization (retrieve user from ID)
passport.deserializeUser((id, done) => {
  loadUsersStorage();
  // If id is already a user object, return it; otherwise look it up
  if (typeof id === 'object' && id.id) {
    return done(null, id);
  }
  const user = Array.from(usersStorage.values()).find(u => u.id === id);
  done(null, user || null);
});

// Log OAuth configuration on startup
if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_ID !== 'YOUR_GOOGLE_CLIENT_ID_HERE') {
  console.log('[GOOGLE OAUTH] Client ID configured:', GOOGLE_CLIENT_ID.substring(0, 20) + '...');
  if (GOOGLE_CALLBACK_URL) {
    console.log('[GOOGLE OAUTH] Callback URL:', GOOGLE_CALLBACK_URL);
  } else {
    console.log('[GOOGLE OAUTH] Callback URL: Dynamic (based on request)');
  }
} else {
  console.warn('[GOOGLE OAUTH] Client ID not configured! Set GOOGLE_CLIENT_ID in .env');
}

// GET /api/tracks - Get tracks with optional query params
app.get('/api/tracks', (req, res) => {
  let tracks = [...tracksStorage];
  
  // Filter by artist_id if provided
  if (req.query.artist_id) {
    const operator = req.query.artist_id.startsWith('eq.') ? 'eq' : 'eq';
    const artistId = req.query.artist_id.replace(/^(eq|neq|gt|lt)\./, '');
    if (operator === 'eq') {
      tracks = tracks.filter(t => t.artist_id === artistId);
    }
  }
  
  // Sort tracks
  if (req.query.order) {
    const [field, direction] = req.query.order.split('.');
    tracks.sort((a, b) => {
      const aVal = a[field] || 0;
      const bVal = b[field] || 0;
      return direction === 'desc' ? bVal - aVal : aVal - bVal;
    });
  }
  
  // Limit results
  if (req.query.limit) {
    tracks = tracks.slice(0, parseInt(req.query.limit));
  }
  
  // Enrich tracks with artist information
  const baseUrl = req.protocol + '://' + req.get('host');
  const enrichedTracks = tracks.map(track => {
    const enriched = { ...track };
    
    // Get artist/user information
    if (track.artist_id) {
      const artist = getUserById(track.artist_id);
      if (artist) {
        enriched.artist_username = artist.username || 'creator';
        enriched.artist_is_verified = artist.verified || false;
        
        // Get profile image URL
        if (artist.profile_image || artist.avatar_url) {
          let profileImage = artist.profile_image || artist.avatar_url;
          // Make absolute URL if relative
          if (profileImage && !profileImage.startsWith('http') && !profileImage.startsWith('data:')) {
            if (profileImage.startsWith('/')) {
              profileImage = baseUrl + profileImage;
            } else {
              profileImage = baseUrl + '/' + profileImage;
            }
          }
          enriched.artist_profile_image = profileImage;
        } else {
          enriched.artist_profile_image = null;
        }
      } else {
        // Fallback if artist not found
        enriched.artist_username = 'creator';
        enriched.artist_profile_image = null;
        enriched.artist_is_verified = false;
      }
    } else {
      enriched.artist_username = 'creator';
      enriched.artist_profile_image = null;
      enriched.artist_is_verified = false;
    }
    
    return enriched;
  });
  
  res.json(enrichedTracks);
});

// GET /api/tracks/:id - Get single track
app.get('/api/tracks/:id', (req, res) => {
  const track = tracksStorage.find(t => t.id === req.params.id);
  if (!track) {
    // Fallback to mock track for compatibility
    const mockTrack = generateMockTrack(0);
    mockTrack.id = req.params.id;
    return res.json(mockTrack);
  }
  
  // Ensure liked_by array exists for compatibility with existing tracks
  if (!track.liked_by || !Array.isArray(track.liked_by)) {
    track.liked_by = [];
  }
  // Ensure shares_count exists for compatibility with existing tracks
  if (typeof track.shares_count !== 'number') {
    track.shares_count = 0;
  }
  
  // Enrich track with artist information
  const baseUrl = req.protocol + '://' + req.get('host');
  const enriched = { ...track };
  
  if (track.artist_id) {
    const artist = getUserById(track.artist_id);
    if (artist) {
      enriched.artist_username = artist.username || 'creator';
      enriched.artist_is_verified = artist.verified || false;
      
      // Get profile image URL
      if (artist.profile_image || artist.avatar_url) {
        let profileImage = artist.profile_image || artist.avatar_url;
        // Make absolute URL if relative
        if (profileImage && !profileImage.startsWith('http') && !profileImage.startsWith('data:')) {
          if (profileImage.startsWith('/')) {
            profileImage = baseUrl + profileImage;
          } else {
            profileImage = baseUrl + '/' + profileImage;
          }
        }
        enriched.artist_profile_image = profileImage;
      } else {
        enriched.artist_profile_image = null;
      }
    } else {
      enriched.artist_username = 'creator';
      enriched.artist_profile_image = null;
      enriched.artist_is_verified = false;
    }
  } else {
    enriched.artist_username = 'creator';
    enriched.artist_profile_image = null;
    enriched.artist_is_verified = false;
  }
  
  res.json(enriched);
});

// POST /api/tracks/:id/play - increment play count
app.post('/api/tracks/:id/play', (req, res) => {
  const track = tracksStorage.find(t => t.id === req.params.id);
  if (!track) return res.status(404).json({ error: 'Track not found' });
  track.views_count = (track.views_count || 0) + 1;
  track.plays_count = (track.plays_count || 0) + 1;
  track.updated_at = new Date().toISOString();
  saveTracksStorage();
  res.json({ success: true, views_count: track.views_count, plays_count: track.plays_count });
});

// POST /api/tracks/:id/like - like/unlike track (one like per user)
app.post('/api/tracks/:id/like', (req, res) => {
  const track = tracksStorage.find(t => t.id === req.params.id);
  if (!track) return res.status(404).json({ error: 'Track not found' });
  
  // Initialize liked_by array if it doesn't exist
  if (!track.liked_by || !Array.isArray(track.liked_by)) {
    track.liked_by = [];
  }
  
  const userId = req.body.user_id || req.query.user_id;
  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }
  
  // Check if user already liked (case-insensitive comparison for safety)
  const isLiked = track.liked_by.some(id => String(id) === String(userId));
  
  if (isLiked) {
    // Unlike - remove user from liked_by and decrement count
    track.liked_by = track.liked_by.filter(id => String(id) !== String(userId));
    track.likes_count = Math.max(0, (track.likes_count || 0) - 1);
  } else {
    // Like - add user to liked_by and increment count (only if not already there)
    if (!track.liked_by.some(id => String(id) === String(userId))) {
      track.liked_by.push(userId);
      track.likes_count = (track.likes_count || 0) + 1;
    }
  }
  
  track.updated_at = new Date().toISOString();
  saveTracksStorage();
  
  // Final check to ensure consistency
  const finalIsLiked = track.liked_by.some(id => String(id) === String(userId));
  
  res.json({ 
    success: true, 
    likes_count: track.likes_count,
    is_liked: finalIsLiked
  });
});

// POST /api/tracks/:id/share - Share a track (increment share count)
app.post('/api/tracks/:id/share', (req, res) => {
  const track = tracksStorage.find(t => t.id === req.params.id);
  if (!track) {
    return res.status(404).json({ error: 'Track not found' });
  }
  
  // Initialize shares_count if it doesn't exist
  if (typeof track.shares_count !== 'number') {
    track.shares_count = 0;
  }
  
  // Increment share count
  track.shares_count = (track.shares_count || 0) + 1;
  
  // Save to storage
  saveTracksStorage();
  
  res.json({
    success: true,
    shares_count: track.shares_count
  });
});

// POST /api/tracks/:id/repost - repost a track
app.post('/api/tracks/:id/repost', (req, res) => {
  const track = tracksStorage.find(t => t.id === req.params.id);
  if (!track) return res.status(404).json({ error: 'Track not found' });
  
  const userId = req.body.user_id || req.body.reposted_by;
  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }
  
  // Initialize reposted_by array if it doesn't exist
  if (!track.reposted_by) {
    track.reposted_by = [];
  }
  
  // Check if user already reposted
  if (track.reposted_by.includes(userId)) {
    return res.status(400).json({ error: 'Track already reposted by this user' });
  }
  
  // Add user to reposted_by
  track.reposted_by.push(userId);
  track.reposts_count = (track.reposts_count || 0) + 1;
  track.updated_at = new Date().toISOString();
  saveTracksStorage();
  
  res.json({ 
    success: true, 
    reposts_count: track.reposts_count,
    message: 'Track reposted successfully'
  });
});

// POST /api/tracks/:id/comment - add comment
app.post('/api/tracks/:id/comment', (req, res) => {
  const track = tracksStorage.find(t => t.id === req.params.id);
  if (!track) return res.status(404).json({ error: 'Track not found' });
  const { author, text } = req.body;
  if (!text) return res.status(400).json({ error: 'Comment text is required' });
  if (!track.comments) track.comments = [];
  const comment = {
    id: uuidv4(),
    author: author || 'User',
    text,
    time: new Date().toISOString(),
    user_id: req.body.user_id || null,
    author_id: req.body.user_id || req.body.author_id || null,
    likes: 0,
    liked_by: []
  };
  track.comments.unshift(comment);
  track.updated_at = new Date().toISOString();
  saveTracksStorage();
  res.json({ success: true, comment, comments_count: track.comments.length });
});

// DELETE /api/tracks/:id/comments/:commentId - delete comment
app.delete('/api/tracks/:id/comments/:commentId', (req, res) => {
  const track = tracksStorage.find(t => t.id === req.params.id);
  if (!track) return res.status(404).json({ error: 'Track not found' });
  
  if (!track.comments || !Array.isArray(track.comments)) {
    return res.status(404).json({ error: 'Comment not found' });
  }
  
  const commentId = req.params.commentId;
  const commentIndex = track.comments.findIndex(c => c.id === commentId);
  
  if (commentIndex === -1) {
    return res.status(404).json({ error: 'Comment not found' });
  }
  
  // Remove the comment (global deletion - everyone can delete any comment)
  track.comments.splice(commentIndex, 1);
  track.updated_at = new Date().toISOString();
  saveTracksStorage();
  
  res.json({ success: true, comments_count: track.comments.length });
});

// POST /api/tracks/:id/comments/:commentId/like - like/unlike comment
app.post('/api/tracks/:id/comments/:commentId/like', (req, res) => {
  const track = tracksStorage.find(t => t.id === req.params.id);
  if (!track) return res.status(404).json({ error: 'Track not found' });
  
  if (!track.comments || !Array.isArray(track.comments)) {
    return res.status(404).json({ error: 'Comment not found' });
  }
  
  const commentId = req.params.commentId;
  const comment = track.comments.find(c => c.id === commentId);
  
  if (!comment) {
    return res.status(404).json({ error: 'Comment not found' });
  }
  
  // Initialize likes if not exists
  if (!comment.likes) {
    comment.likes = 0;
  }
  if (!comment.liked_by) {
    comment.liked_by = [];
  }
  
  const userId = req.body.user_id || req.query.user_id;
  const isLiked = userId && comment.liked_by.includes(userId);
  
  if (isLiked) {
    // Unlike
    comment.likes = Math.max(0, comment.likes - 1);
    comment.liked_by = comment.liked_by.filter(id => id !== userId);
  } else {
    // Like
    comment.likes = (comment.likes || 0) + 1;
    if (userId && !comment.liked_by.includes(userId)) {
      comment.liked_by.push(userId);
    }
  }
  
  track.updated_at = new Date().toISOString();
  saveTracksStorage();
  
  res.json({ 
    success: true, 
    likes: comment.likes,
    is_liked: userId ? comment.liked_by.includes(userId) : false
  });
});

// DELETE /api/tracks/:id - delete track
app.delete('/api/tracks/:id', (req, res) => {
  const index = tracksStorage.findIndex(t => t.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Track not found' });
  const track = tracksStorage[index];
  tracksStorage.splice(index, 1);
  saveTracksStorage();
  
  // Decrement user track count
  const user = getUserById(track.artist_id);
  if (user && user.tracks_count > 0) {
    user.tracks_count -= 1;
    user.updated_at = new Date().toISOString();
    saveUsersStorage();
  }
  
  res.json({ success: true });
});

// POST /api/tracks - Upload/create a new track (supports audio upload)
app.post('/api/tracks', trackUpload.single('audioFile'), async (req, res) => {
  try {
    const {
      title,
      description,
      genre,
      bpm,
      artist_id,
      artist_name,
      cover_art_url,
      duration
    } = req.body;
    
    if (!title || !artist_id) {
      return res.status(400).json({ error: 'Title and artist_id are required' });
    }
    
    let audioUrl = req.body.audio_url || null;
    
    // Upload to R2 if file provided
    if (req.file) {
      try {
        const trackId = uuidv4();
        const ext = path.extname(req.file.originalname) || '.mp3';
        const r2Key = `tracks/${trackId}${ext}`;
        
        // Upload buffer directly to R2
        audioUrl = await uploadBufferToR2(
          req.file.buffer,
          r2Key,
          req.file.mimetype
        );
        
        console.log(`✅ Track uploaded to R2: ${r2Key}`);
      } catch (r2Error) {
        console.error('❌ R2 Upload Error:', r2Error);
        // Fallback to local storage if R2 fails
        const fallbackPath = path.join(TRACKS_DIR, `${uuidv4()}${path.extname(req.file.originalname)}`);
        fs.writeFileSync(fallbackPath, req.file.buffer);
        audioUrl = `/uploads/tracks/${path.basename(fallbackPath)}`;
        console.log(`⚠️  Fallback to local storage: ${audioUrl}`);
      }
    }
    
    const track = {
      id: uuidv4(),
      title: title.trim(),
      description: description || '',
      genre: genre || 'Unknown',
      bpm: bpm ? parseInt(bpm) : null,
      artist_id: artist_id,
      artist_name: artist_name || 'Unknown Artist',
      cover_art_url: cover_art_url || null,
      audio_url: audioUrl,
      duration: duration || null,
      views_count: 0,
      likes_count: 0,
      liked_by: [],
      shares_count: 0,
      plays_count: 0,
      comments: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    tracksStorage.push(track);
    saveTracksStorage(); // Save to file
    
    // Update user's tracks count
    const user = getUserById(artist_id);
    if (user) {
      user.tracks_count = (user.tracks_count || 0) + 1;
      user.updated_at = new Date().toISOString();
      saveUsersStorage();
    }
    
    res.status(201).json({
      success: true,
      message: 'Track uploaded successfully',
      track: track
    });
  } catch (err) {
    console.error('Track upload error:', err);
    res.status(500).json({ error: 'Failed to upload track' });
  }
});

// GET /api/feed/trending-artists - Get trending artists
app.get('/api/feed/trending-artists', (req, res) => {
  // Return empty array - no mock data
  res.json([]);
});

// GET /api/users - Get users/artists
app.get('/api/users', (req, res) => {
  // Reload users from file to ensure fresh data
  loadUsersStorage();
  
  // Return all users from storage with proper profile picture URLs
  const users = Array.from(usersStorage.values()).map(user => {
    const baseUrl = req.protocol + '://' + req.get('host');
    
    // Ensure profile picture URLs are absolute
    if (user.profile_image && !user.profile_image.startsWith('http') && !user.profile_image.startsWith('data:')) {
      if (user.profile_image.startsWith('/')) {
        user.profile_image = baseUrl + user.profile_image;
      } else {
        user.profile_image = baseUrl + '/uploads/profiles/' + user.profile_image;
      }
    }
    if (user.avatar_url && !user.avatar_url.startsWith('http') && !user.avatar_url.startsWith('data:')) {
      if (user.avatar_url.startsWith('/')) {
        user.avatar_url = baseUrl + user.avatar_url;
      } else {
        user.avatar_url = baseUrl + '/uploads/profiles/' + user.avatar_url;
      }
    }
    
    // Ensure profile_image_url is set (for compatibility with frontend)
    if (!user.profile_image_url) {
      user.profile_image_url = user.profile_image || user.avatar_url || null;
    }
    
    return user;
  });
  res.json(users);
});

// POST /api/users/:id/follow - Toggle follow relationship
app.post('/api/users/:id/follow', (req, res) => {
  const followeeId = req.params.id; // User being followed/unfollowed
  const followerId = req.body.user_id; // Current user (follower)
  
  if (!followerId) {
    return res.status(401).json({ error: 'User ID required' });
  }
  
  if (followerId === followeeId) {
    return res.status(400).json({ error: 'Cannot follow yourself' });
  }
  
  // Check if users exist
  const follower = getUserById(followerId);
  const followee = getUserById(followeeId);
  
  if (!follower) {
    return res.status(404).json({ error: 'Follower not found' });
  }
  
  if (!followee) {
    return res.status(404).json({ error: 'User to follow not found' });
  }
  
  // Toggle follow relationship
  const isNowFollowing = toggleFollow(followerId, followeeId);
  saveFollowsStorage();
  
  // Update follower/following counts
  const followerCount = getFollowerCount(followeeId);
  const followingCount = getFollowingCount(followerId);
  
  // Update followee's follower count
  if (followee) {
    followee.followers_count = followerCount;
    const emailKey = followee.email?.toLowerCase();
    if (emailKey && usersStorage.has(emailKey)) {
      usersStorage.set(emailKey, followee);
      saveUsersStorage();
    }
  }
  
  // Update follower's following count
  if (follower) {
    follower.following_count = followingCount;
    const emailKey = follower.email?.toLowerCase();
    if (emailKey && usersStorage.has(emailKey)) {
      usersStorage.set(emailKey, follower);
      saveUsersStorage();
    }
  }
  
  res.json({
    is_following: isNowFollowing,
    followers_count: followerCount,
    following_count: followingCount
  });
});

// GET /api/users/:id/follow-status - Check if current user follows this user
app.get('/api/users/:id/follow-status', (req, res) => {
  const followeeId = req.params.id;
  const followerId = req.query.user_id;
  
  if (!followerId) {
    return res.json({ is_following: false });
  }
  
  const isFollowingUser = isFollowing(followerId, followeeId);
  res.json({ is_following: isFollowingUser });
});

// GET /api/users/:id - Get single user by ID
app.get('/api/users/:id', (req, res) => {
  const userId = req.params.id;
  
  // Try to get user from storage
  let user = getUserById(userId);
  
  if (!user) {
    // User not found in storage, create default user data
    const baseUrl = req.protocol + '://' + req.get('host');
    
    // Check if profile picture exists
    let avatarUrl = null;
    const possibleExtensions = ['.jpg', '.png', '.gif', '.webp'];
    for (const ext of possibleExtensions) {
      const profilePicPath = path.join(PROFILES_DIR, `${userId}${ext}`);
      if (fs.existsSync(profilePicPath)) {
        avatarUrl = `${baseUrl}/uploads/profiles/${userId}${ext}`;
        break;
      }
    }
    
    user = {
      id: userId,
      username: 'user',
      name: 'User',
      email: `${userId}@example.com`,
      bio: null,
      location: null,
      avatar_url: avatarUrl,
      profile_image: avatarUrl,
      followers_count: 0,
      following_count: 0,
      tracks_count: 0,
      verified: false,
      created_at: new Date().toISOString()
    };
  } else {
    // Ensure existing user has proper profile picture URLs
    const baseUrl = req.protocol + '://' + req.get('host');
    
    // Check if profile picture file exists
    const possibleExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    let foundProfilePic = false;
    for (const ext of possibleExtensions) {
      const profilePicPath = path.join(PROFILES_DIR, `${userId}${ext}`);
      if (fs.existsSync(profilePicPath)) {
        const currentAvatarUrl = `${baseUrl}/uploads/profiles/${userId}${ext}`;
        if (user.avatar_url !== currentAvatarUrl) {
          user.avatar_url = currentAvatarUrl;
          user.profile_image = currentAvatarUrl;
          user.profile_image_url = currentAvatarUrl;
          user.updated_at = new Date().toISOString();
          saveUsersStorage();
        }
        foundProfilePic = true;
        break;
      }
    }
    
    // Also check for files with UUID in filename
    if (!foundProfilePic) {
      try {
        const files = fs.readdirSync(PROFILES_DIR);
        const matchingFile = files.find(f => f.includes(userId) || f.startsWith(userId));
        if (matchingFile) {
          const currentAvatarUrl = `${baseUrl}/uploads/profiles/${matchingFile}`;
          user.avatar_url = currentAvatarUrl;
          user.profile_image = currentAvatarUrl;
          user.profile_image_url = currentAvatarUrl;
        }
      } catch (err) {
        // Directory might not exist
      }
    }
    
    // Ensure URLs are absolute
    if (user.profile_image && !user.profile_image.startsWith('http') && !user.profile_image.startsWith('data:')) {
      if (user.profile_image.startsWith('/')) {
        user.profile_image = baseUrl + user.profile_image;
      } else {
        user.profile_image = baseUrl + '/uploads/profiles/' + user.profile_image;
      }
    }
    if (user.avatar_url && !user.avatar_url.startsWith('http') && !user.avatar_url.startsWith('data:')) {
      if (user.avatar_url.startsWith('/')) {
        user.avatar_url = baseUrl + user.avatar_url;
      } else {
        user.avatar_url = baseUrl + '/uploads/profiles/' + user.avatar_url;
      }
    }
    // Also set profile_image_url if not set
    if (!user.profile_image_url) {
      user.profile_image_url = user.profile_image || user.avatar_url;
    }
  }
  
  res.json(user);
});

// POST /api/users/:id/profile-picture - Upload profile picture
app.post('/api/users/:id/profile-picture', profileUpload.single('profilePicture'), async (req, res) => {
  const userId = req.params.id;
  
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  let avatarUrl;
  
  // Upload to R2 if configured, otherwise use local storage
  try {
    const ext = path.extname(req.file.originalname) || '.jpg';
    const r2Key = `profiles/${userId}${ext}`;
    
    // Upload buffer to R2
    avatarUrl = await uploadBufferToR2(
      req.file.buffer,
      r2Key,
      req.file.mimetype
    );
    
    console.log(`✅ Profile picture uploaded to R2: ${r2Key}`);
  } catch (r2Error) {
    console.error('❌ R2 Upload Error:', r2Error);
    // Fallback to local storage
    const baseUrl = req.protocol + '://' + req.get('host');
    const fallbackPath = path.join(PROFILES_DIR, `${userId}${path.extname(req.file.originalname)}`);
    fs.writeFileSync(fallbackPath, req.file.buffer);
    avatarUrl = `${baseUrl}/uploads/profiles/${path.basename(fallbackPath)}`;
    console.log(`⚠️  Fallback to local storage: ${avatarUrl}`);
  }
  
  // Update user in storage
  let user = getUserById(userId);
  if (user) {
    user.avatar_url = avatarUrl;
    user.profile_image = avatarUrl;
    user.updated_at = new Date().toISOString();
    saveUsersStorage();
  } else {
    // Find user by email key and update
    for (const [key, storedUser] of usersStorage.entries()) {
      if (storedUser.id === userId) {
        storedUser.avatar_url = avatarUrl;
        storedUser.profile_image = avatarUrl;
        storedUser.updated_at = new Date().toISOString();
        saveUsersStorage();
        break;
      }
    }
  }
  
  res.json({
    success: true,
    message: 'Profile picture uploaded successfully',
    avatar_url: avatarUrl,
    profile_image: avatarUrl,
    file: {
      filename: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype
    }
  });
});

// PUT /api/users/:id/profile - Update user profile
// POST /api/users/:id/password - Change user password
app.post('/api/users/:id/password', (req, res) => {
  const userId = req.params.id;
  const { oldPassword, newPassword } = req.body;
  
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ error: 'Old password and new password are required' });
  }
  
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters long' });
  }
  
  // Reload users to ensure fresh data
  loadUsersStorage();
  
  // Find user by ID
  const user = getUserById(userId);
  
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  // Check if old password matches
  // Note: In a real app, passwords should be hashed. For now, we'll check against stored password
  // If user doesn't have a password set (old accounts), we need to handle this
  if (user.password) {
    if (user.password !== oldPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
  } else {
    // User doesn't have a password set (old account)
    // For security, we should require them to set a password first or use a different method
    // For now, we'll allow setting a password if they don't have one
    // In production, you might want to require email verification or other security measures
  }
  
  // Check if new password is the same as current password
  if (user.password === newPassword) {
    return res.status(400).json({ error: 'You are trying to use your current password. Please choose a different password.' });
  }
  
  // Check password history to prevent reuse
  // Initialize password_history if it doesn't exist
  if (!user.password_history) {
    user.password_history = [];
  }
  
  // Check if new password was used before
  if (user.password_history.includes(newPassword)) {
    return res.status(400).json({ error: 'You are trying to use a recently changed password. Please choose a different password.' });
  }
  
  // Add current password to history (before updating)
  if (user.password) {
    user.password_history.push(user.password);
    // Keep only last 5 passwords in history (for security and storage efficiency)
    if (user.password_history.length > 5) {
      user.password_history = user.password_history.slice(-5);
    }
  }
  
  // Update password
  user.password = newPassword;
  user.updated_at = new Date().toISOString();
  
  // Save to storage
  const emailKey = user.email?.toLowerCase();
  if (emailKey) {
    usersStorage.set(emailKey, user);
    saveUsersStorage();
  }
  
  res.json({ 
    success: true, 
    message: 'Password changed successfully' 
  });
});

app.put('/api/users/:id/profile', (req, res) => {
  const userId = req.params.id;
  const { bio, location, name, username } = req.body;
  
  // Get user from storage
  let user = getUserById(userId);
  
  if (user) {
    // Update user profile
    if (bio !== undefined) user.bio = bio;
    if (location !== undefined) user.location = location;
    if (name !== undefined) user.name = name;
    if (username !== undefined) user.username = username;
    user.updated_at = new Date().toISOString();
    saveUsersStorage();
    
    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: user
    });
  } else {
    // User not found, create new entry
    const baseUrl = req.protocol + '://' + req.get('host');
    let avatarUrl = null;
    const possibleExtensions = ['.jpg', '.png', '.gif', '.webp'];
    for (const ext of possibleExtensions) {
      const profilePicPath = path.join(PROFILES_DIR, `${userId}${ext}`);
      if (fs.existsSync(profilePicPath)) {
        avatarUrl = `${baseUrl}/uploads/profiles/${userId}${ext}`;
        break;
      }
    }
    
    user = {
      id: userId,
      username: username || 'user',
      name: name || 'User',
      email: `${userId}@example.com`,
      bio: bio || null,
      location: location || null,
      avatar_url: avatarUrl,
      profile_image: avatarUrl,
      followers_count: 0,
      following_count: 0,
      tracks_count: 0,
      verified: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    // Try to find by email key, otherwise create new entry
    const emailKey = user.email.toLowerCase();
    usersStorage.set(emailKey, user);
    saveUsersStorage();
    
    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: user
    });
  }
});

// GET /api/users/:id/notifications
app.get('/api/users/:id/notifications', (req, res) => {
  res.json([]);
});

// Messages storage
let messagesStorage = [];

// Load messages from file
function loadMessagesStorage() {
  try {
    if (fs.existsSync(MESSAGES_STORAGE_FILE)) {
      const data = fs.readFileSync(MESSAGES_STORAGE_FILE, 'utf8');
      messagesStorage = JSON.parse(data);
      console.log(`Loaded ${messagesStorage.length} messages from storage`);
    }
  } catch (error) {
    console.error('Error loading messages storage:', error);
    messagesStorage = [];
  }
}

// Save messages to file
function saveMessagesStorage() {
  try {
    fs.writeFileSync(MESSAGES_STORAGE_FILE, JSON.stringify(messagesStorage, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving messages storage:', error);
  }
}

// Load messages on startup
loadMessagesStorage();

// POST /api/messages - Send a message
app.post('/api/messages', (req, res) => {
  const { sender_id, recipient_id, content } = req.body;
  
  if (!sender_id || !recipient_id || !content) {
    return res.status(400).json({ error: 'sender_id, recipient_id, and content are required' });
  }
  
  if (!content.trim()) {
    return res.status(400).json({ error: 'Message content cannot be empty' });
  }
  
  const message = {
    id: uuidv4(),
    sender_id,
    recipient_id,
    content: content.trim(),
    created_at: new Date().toISOString(),
    read: false
  };
  
  messagesStorage.push(message);
  saveMessagesStorage();
  
  res.status(201).json(message);
});

// GET /api/conversations/:userId1/:userId2/messages - Get messages between two users
app.get('/api/conversations/:userId1/:userId2/messages', (req, res) => {
  const { userId1, userId2 } = req.params;
  
  const conversationMessages = messagesStorage.filter(msg => 
    (msg.sender_id === userId1 && msg.recipient_id === userId2) ||
    (msg.sender_id === userId2 && msg.recipient_id === userId1)
  ).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  
  res.json(conversationMessages);
});

// GET /api/users/:id/messages - Get all conversations for a user
app.get('/api/users/:id/messages', (req, res) => {
  const userId = req.params.id;
  
  // Get unique conversation partners
  const conversations = new Map();
  
  // First pass: collect all messages and find latest message for each conversation
  messagesStorage.forEach(msg => {
    if (msg.sender_id === userId || msg.recipient_id === userId) {
      const partnerId = msg.sender_id === userId ? msg.recipient_id : msg.sender_id;
      
      if (!conversations.has(partnerId)) {
        // Get partner user info
        let partnerName = 'User';
        let partnerAvatar = null;
        const partnerUser = getUserById(partnerId);
        if (partnerUser) {
          partnerName = partnerUser.name || partnerUser.full_name || partnerUser.username || 'User';
          partnerAvatar = partnerUser.profile_image || partnerUser.avatar_url || partnerUser.profile_image_url || null;
        }
        
        conversations.set(partnerId, {
          id: partnerId,
          conversation_id: partnerId,
          sender_id: msg.sender_id === userId ? partnerId : userId,
          sender_name: partnerName,
          sender: {
            id: partnerId,
            username: partnerName,
            profile_image: partnerAvatar
          },
          last_message: msg.content,
          created_at: msg.created_at,
          updated_at: msg.created_at,
          hasUnreadMessages: false  // Will be calculated in second pass
        });
      } else {
        const conv = conversations.get(partnerId);
        if (new Date(msg.created_at) > new Date(conv.updated_at)) {
          conv.last_message = msg.content;
          conv.updated_at = msg.created_at;
        }
      }
    }
  });
  
  // Second pass: check if conversation has any unread messages sent TO current user
  messagesStorage.forEach(msg => {
    if (msg.sender_id === userId || msg.recipient_id === userId) {
      const partnerId = msg.sender_id === userId ? msg.recipient_id : msg.sender_id;
      const conv = conversations.get(partnerId);
      
      if (conv) {
        // If this message was sent TO current user and is unread, mark conversation as unread
        if (msg.recipient_id === userId && !msg.read) {
          conv.hasUnreadMessages = true;
        }
      }
    }
  });
  
  // Convert hasUnreadMessages to read status (read = !hasUnreadMessages)
  const result = Array.from(conversations.values()).map(conv => ({
    ...conv,
    read: !conv.hasUnreadMessages
  }));
  
  res.json(result);
});

// PUT /api/conversations/:userId1/:userId2/messages/read - Mark messages as read
app.put('/api/conversations/:userId1/:userId2/messages/read', (req, res) => {
  const { userId1, userId2 } = req.params;
  
  // Mark all messages in this conversation as read for userId1 (the one viewing)
  let updated = 0;
  messagesStorage.forEach(msg => {
    if (
      ((msg.sender_id === userId2 && msg.recipient_id === userId1) ||
       (msg.sender_id === userId1 && msg.recipient_id === userId2)) &&
      !msg.read
    ) {
      msg.read = true;
      updated++;
    }
  });
  
  if (updated > 0) {
    saveMessagesStorage();
  }
  
  res.json({ success: true, updated });
});

// GET /api/users/:id/requests
app.get('/api/users/:id/requests', (req, res) => {
  res.json([]);
});

// POST /api/notifications/:id/read
app.post('/api/notifications/:id/read', (req, res) => {
  res.json({ success: true });
});

// POST /api/auth/signup - User registration
app.post('/api/auth/signup', (req, res) => {
  const { username, email, password } = req.body;
  
  // Basic validation
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email, and password are required' });
  }
  
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }
  
  // Check if user already exists by email
  const userIdKey = email.toLowerCase();
  let user = getUserByEmailKey(userIdKey);
  
  if (user) {
    // User with this email already exists - return error
    return res.status(409).json({ 
      error: 'An account with this email already exists. Please use a different email or try logging in.' 
    });
  }
  
  // Check if username is already taken by another user
  for (const existingUser of usersStorage.values()) {
    if (existingUser.username && existingUser.username.toLowerCase() === username.toLowerCase() && 
        existingUser.email.toLowerCase() !== email.toLowerCase()) {
      return res.status(409).json({ 
        error: 'This username is already taken. Please choose a different username.' 
      });
    }
  }
  
  // Create new user (email and username are both unique)
  // IMPORTANT: Only store ONCE with email as key - never store by username
  const userId = uuidv4();
  const baseUrl = req.protocol + '://' + req.get('host');
  
  // Check if profile picture exists
  let avatarUrl = null;
  const possibleExtensions = ['.jpg', '.png', '.gif', '.webp'];
  for (const ext of possibleExtensions) {
    const profilePicPath = path.join(PROFILES_DIR, `${userId}${ext}`);
    if (fs.existsSync(profilePicPath)) {
      avatarUrl = `${baseUrl}/uploads/profiles/${userId}${ext}`;
      break;
    }
  }
  
  user = {
    id: userId,
    username: username,
    email: email,
    password: password, // Store password for password change functionality
    password_history: [], // Track password history to prevent reuse
    name: username,
    bio: null,
    location: null,
    avatar_url: avatarUrl,
    profile_image: avatarUrl,
    followers_count: 0,
    following_count: 0,
    tracks_count: 0,
    verified: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  
  // Store user ONCE with email as the key (never store by username)
  console.log(`[SIGNUP] Creating account: email=${email}, username=${username}, key=${userIdKey}`);
  usersStorage.set(userIdKey, user);
  saveUsersStorage(); // Save to file
  console.log(`[SIGNUP] Account created successfully. Total users: ${usersStorage.size}`);
  
  // Return success with user data
  res.status(201).json({
    success: true,
    message: 'Account created successfully',
    user: user,
    token: `mock_token_${user.id}`
  });
});

// POST /api/auth/login - User login
app.post('/api/auth/login', (req, res) => {
  const { identifier, password } = req.body;
  
  // Basic validation
  if (!identifier || !password) {
    return res.status(400).json({ error: 'Email/username and password are required' });
  }
  
  // Admin login check (same as in login.html)
  const ADMIN_EMAIL = 'chilafrican@gmail.com';
  const ADMIN_PASSWORD = 'Semakulanico1';
  
  if (identifier.toLowerCase() === ADMIN_EMAIL.toLowerCase() && password === ADMIN_PASSWORD) {
    // Use consistent admin user ID
    const adminUserIdKey = ADMIN_EMAIL.toLowerCase();
    let adminUser = getUserByEmailKey(adminUserIdKey);
    
    if (!adminUser) {
      const adminUserId = 'admin_' + ADMIN_EMAIL.replace(/[^a-zA-Z0-9]/g, '_');
      const baseUrl = req.protocol + '://' + req.get('host');
      
      // Check if profile picture exists for admin
      let avatarUrl = null;
      const possibleExtensions = ['.jpg', '.png', '.gif', '.webp'];
      for (const ext of possibleExtensions) {
        const profilePicPath = path.join(PROFILES_DIR, `${adminUserId}${ext}`);
        if (fs.existsSync(profilePicPath)) {
          avatarUrl = `${baseUrl}/uploads/profiles/${adminUserId}${ext}`;
          break;
        }
      }
      
      adminUser = {
        id: adminUserId,
        name: 'Admin',
        username: 'admin',
        email: ADMIN_EMAIL,
        bio: null,
        location: null,
        avatar_url: avatarUrl,
        profile_image: avatarUrl,
        followers_count: 0,
        following_count: 0,
        tracks_count: 0,
        verified: true,
        is_admin: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      usersStorage.set(adminUserIdKey, adminUser);
      saveUsersStorage(); // Save to file
    }
    
    return res.json({
      success: true,
      message: 'Admin login successful',
      user: adminUser,
      token: `admin_token_${Date.now()}`
    });
  }
  
  // Reload users to ensure fresh data (important after password changes)
  loadUsersStorage();
  
  // For other users, try to find by email or username
  // First, try to find by email if identifier is an email
  let user = null;
  let userIdKey = null;
  
  if (identifier.includes('@')) {
    // Identifier is an email
    userIdKey = identifier.toLowerCase();
    user = getUserByEmailKey(userIdKey);
  } else {
    // Identifier is a username - search all users to find by username
    for (const existingUser of usersStorage.values()) {
      if (existingUser.username && existingUser.username.toLowerCase() === identifier.toLowerCase()) {
        user = existingUser;
        userIdKey = existingUser.email.toLowerCase();
        break;
      }
    }
  }
  
  if (!user) {
    // User not found - return error (don't auto-create accounts during login)
    return res.status(401).json({ 
      error: 'Invalid credentials. Please check your email/username and password, or sign up for a new account.' 
    });
  }
  
  // Validate password - check current password and password history
  if (user.password) {
    // Check if password matches current password
    if (user.password !== password) {
      // Check password history if current password doesn't match
      if (user.password_history && user.password_history.includes(password)) {
        return res.status(401).json({ 
          error: 'You are trying to use a recently changed password. Please use your current password or reset it if you forgot it.' 
        });
      }
      return res.status(401).json({ 
        error: 'Invalid credentials. Please check your email/username and password.' 
      });
    }
  } else {
    // User doesn't have a password set (old account)
    // Allow login but note this
    console.log(`[LOGIN] User ${user.email} logged in without password (old account)`);
  }
  
  // If user doesn't have a password set (old account), allow login
  // But we should encourage them to set a password
  if (!user.password) {
    // Old account without password - allow login but note this
    console.log(`[LOGIN] User ${user.email} logged in without password (old account)`);
  }
  
  // Update avatar URL if profile picture exists but not in user data
  if (!user.avatar_url) {
    const baseUrl = req.protocol + '://' + req.get('host');
    const possibleExtensions = ['.jpg', '.png', '.gif', '.webp'];
    for (const ext of possibleExtensions) {
      const profilePicPath = path.join(PROFILES_DIR, `${user.id}${ext}`);
      if (fs.existsSync(profilePicPath)) {
        user.avatar_url = `${baseUrl}/uploads/profiles/${user.id}${ext}`;
        user.profile_image = user.avatar_url;
        user.updated_at = new Date().toISOString();
        saveUsersStorage();
        break;
      }
    }
  }
  
  res.json({
    success: true,
    message: 'Login successful',
    user: user,
    token: `mock_token_${user.id}`
  });
});

// POST /api/auth/forgot-password - Request password reset
app.post('/api/auth/forgot-password', (req, res) => {
  const { identifier } = req.body;
  
  if (!identifier) {
    return res.status(400).json({ error: 'Email or username is required' });
  }
  
  // Reload users to ensure fresh data
  loadUsersStorage();
  
  // Find user by email or username
  let user = null;
  
  if (identifier.includes('@')) {
    // Identifier is an email
    user = getUserByEmailKey(identifier.toLowerCase());
  } else {
    // Identifier is a username - search all users
    for (const existingUser of usersStorage.values()) {
      if (existingUser.username && existingUser.username.toLowerCase() === identifier.toLowerCase()) {
        user = existingUser;
        break;
      }
    }
  }
  
  if (!user) {
    // Don't reveal if user exists for security
    return res.json({
      success: true,
      message: 'If an account with that email/username exists, password reset instructions have been sent.'
    });
  }
  
  // Generate reset token (in production, this would be a secure token sent via email)
  const resetToken = uuidv4();
  const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour from now
  
  // Store reset token in user object
  user.reset_token = resetToken;
  user.reset_token_expiry = resetTokenExpiry.toISOString();
  user.updated_at = new Date().toISOString();
  
  // Save to storage
  const emailKey = user.email?.toLowerCase();
  if (emailKey) {
    usersStorage.set(emailKey, user);
    saveUsersStorage();
  }
  
  // Generate reset link
  const resetLink = `${req.protocol}://${req.get('host')}/reset-password.html?token=${resetToken}`;
  
  // Send email with reset link
  // The email will be sent to: user.email
  console.log(`[PASSWORD RESET] Sending reset email to: ${user.email}`);
  console.log(`[PASSWORD RESET] Reset link: ${resetLink}`);
  console.log(`[PASSWORD RESET] Token: ${resetToken} (for reference)`);
  
  // TODO: Implement actual email sending using nodemailer or similar service
  // For now, we log the details. In production, you would:
  // 1. Install nodemailer: npm install nodemailer
  // 2. Configure SMTP settings (Gmail, SendGrid, etc.)
  // 3. Send email with reset link to user.email
  // 
  // Example implementation:
  // const nodemailer = require('nodemailer');
  // const transporter = nodemailer.createTransport({
  //   service: 'gmail',
  //   auth: {
  //     user: process.env.EMAIL_USER,
  //     pass: process.env.EMAIL_PASSWORD
  //   }
  // });
  // await transporter.sendMail({
  //   from: 'noreply@audio-city.com',
  //   to: user.email,
  //   subject: 'Password Reset Request',
  //   html: `<p>Click <a href="${resetLink}">here</a> to reset your password.</p>`
  // });
  
  res.json({
    success: true,
    message: `Password reset instructions have been sent to ${user.email}. Please check your inbox (and spam folder).`,
    // In development, also return the link for testing (remove in production)
    ...(process.env.NODE_ENV === 'development' && {
      reset_token: resetToken,
      reset_link: resetLink
    })
  });
});

// POST /api/auth/reset-password - Reset password with token
app.post('/api/auth/reset-password', (req, res) => {
  const { token, newPassword } = req.body;
  
  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Reset token and new password are required' });
  }
  
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long' });
  }
  
  // Reload users to ensure fresh data
  loadUsersStorage();
  
  // Find user by reset token
  let user = null;
  for (const existingUser of usersStorage.values()) {
    if (existingUser.reset_token === token) {
      // Check if token is still valid
      if (existingUser.reset_token_expiry) {
        const expiryDate = new Date(existingUser.reset_token_expiry);
        if (expiryDate < new Date()) {
          return res.status(400).json({ error: 'Reset token has expired. Please request a new one.' });
        }
      }
      user = existingUser;
      break;
    }
  }
  
  if (!user) {
    return res.status(400).json({ error: 'Invalid or expired reset token. Please request a new password reset.' });
  }
  
  // Check if new password is the same as current password
  if (user.password === newPassword) {
    return res.status(400).json({ error: 'New password must be different from your current password' });
  }
  
  // Check password history
  if (!user.password_history) {
    user.password_history = [];
  }
  
  if (user.password_history.includes(newPassword)) {
    return res.status(400).json({ error: 'You are trying to use a recently changed password. Please choose a different password.' });
  }
  
  // Add current password to history
  if (user.password) {
    user.password_history.push(user.password);
    if (user.password_history.length > 5) {
      user.password_history = user.password_history.slice(-5);
    }
  }
  
  // Update password and clear reset token
  user.password = newPassword;
  user.reset_token = null;
  user.reset_token_expiry = null;
  user.updated_at = new Date().toISOString();
  
  // Save to storage
  const emailKey = user.email?.toLowerCase();
  if (emailKey) {
    usersStorage.set(emailKey, user);
    saveUsersStorage();
  }
  
  res.json({
    success: true,
    message: 'Password has been reset successfully. You can now log in with your new password.'
  });
});

// GET /auth/google - Initiate Google OAuth flow (using Passport.js)
app.get('/auth/google', (req, res, next) => {
  if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID_HERE') {
    console.error('[GOOGLE OAUTH ERROR] Client ID not configured! Check .env file.');
    return res.status(500).json({ error: 'Google OAuth not configured. Please check server configuration.' });
  }
  
  console.log('[GOOGLE OAUTH] Initiating OAuth flow with Passport.js');
  passport.authenticate('google', {
    scope: ['profile', 'email']
  })(req, res, next);
});

// GET /auth/google/callback - Handle Google OAuth callback (using Passport.js)
app.get('/auth/google/callback', 
  passport.authenticate('google', { 
    failureRedirect: (() => {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8000';
      return `${frontendUrl}/login.html?error=google_auth_failed`;
    })()
  }),
  (req, res) => {
    // User is authenticated, redirect to frontend with token
    const user = req.user;
    
    if (!user) {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8000';
      return res.redirect(`${frontendUrl}/login.html?error=google_auth_failed`);
    }
    
    // Generate auth token
    const authToken = 'google_token_' + Date.now() + '_' + uuidv4();
    
    // Redirect to frontend with token
    const frontendBaseUrl = process.env.FRONTEND_URL || 'http://localhost:8000';
    const frontendUrl = `${frontendBaseUrl}/login.html?` +
      `google_auth=success&` +
      `token=${authToken}&` +
      `user_id=${user.id}&` +
      `user_name=${encodeURIComponent(user.name)}&` +
      `username=${encodeURIComponent(user.username)}&` +
      `user_email=${encodeURIComponent(user.email)}&` +
      `is_admin=${user.is_admin || false}`;
    
    console.log(`[GOOGLE OAUTH] Redirecting user ${user.email} to frontend`);
    res.redirect(frontendUrl);
  }
);

// GET /auth/logout - Logout route
app.get('/auth/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error('[LOGOUT] Error:', err);
      return res.status(500).json({ error: 'Logout failed' });
    }
    req.session.destroy((err) => {
      if (err) {
        console.error('[LOGOUT] Session destroy error:', err);
      }
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8000';
      res.redirect(`${frontendUrl}/login.html`);
    });
  });
});

// GET /api/admin/stats - Get admin statistics (admin only)
app.get('/api/admin/stats', (req, res) => {
  // In production, verify admin authentication here
  // For now, we'll allow access (you should add proper auth check)
  
  // Get last 30 days of visitor data
  const last30Days = {};
  const today = new Date();
  for (let i = 0; i < 30; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    const dayData = statsStorage.visitorsByDate[dateStr] || { total: 0, unique: [] };
    last30Days[dateStr] = {
      total: dayData.total,
      unique: Array.isArray(dayData.unique) ? dayData.unique.length : 0
    };
  }
  
  res.json({
    totalVisitors: statsStorage.totalVisitors,
    uniqueVisitors: statsStorage.uniqueVisitors.length,
    visitorsByDate: last30Days,
    tracksMastered: statsStorage.tracksMastered,
    lastUpdated: statsStorage.lastUpdated
  });
});

// POST /api/violations/check - Check content for violations
app.post('/api/violations/check', (req, res) => {
  const { title, description, content } = req.body;
  const text = `${title || ''} ${description || ''} ${content || ''}`.toLowerCase();
  const violations = [];
  
  // Profanity patterns
  const profanityPatterns = [
    /\b(fuck|shit|damn|bitch|asshole|piss|hell|bastard|crap)\b/i,
    /\b(nigga|nigger|fag|faggot|retard|slut|whore)\b/i
  ];
  
  // Hate speech patterns
  const hateSpeechPatterns = [
    /\b(kill|murder|die|death|suicide|harm)\s+(yourself|your|you|them|him|her)\b/i,
    /\b(hate|violence|attack|destroy)\s+(.*?)\s+(group|people|race|religion)\b/i
  ];
  
  // Spam patterns
  const spamPatterns = [
    /(click here|buy now|free money|make money|get rich|guaranteed|100% free)/i,
    /(www\.|http:\/\/|https:\/\/).{0,10}(bit\.ly|tinyurl|short\.link)/i,
    /([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i
  ];
  
  // Check violations
  profanityPatterns.forEach(pattern => {
    if (pattern.test(text)) {
      violations.push({ type: 'profanity', severity: 'high' });
    }
  });
  
  hateSpeechPatterns.forEach(pattern => {
    if (pattern.test(text)) {
      violations.push({ type: 'hate_speech', severity: 'critical' });
    }
  });
  
  spamPatterns.forEach(pattern => {
    if (pattern.test(text)) {
      violations.push({ type: 'spam', severity: 'medium' });
    }
  });
  
  res.json({
    hasViolations: violations.length > 0,
    violations: violations,
    canProceed: violations.filter(v => v.severity === 'critical').length === 0
  });
});

// Health check
// GET /api/stats - Get usage statistics
app.get('/api/stats', (req, res) => {
  res.json({
    tracksMastered: statsStorage.tracksMastered || 0,
    lastUpdated: statsStorage.lastUpdated || new Date().toISOString()
  });
});

app.get('/api/health', async (req, res) => {
  try {
    // Check if FFmpeg is available (for mastering functionality)
    const { exec } = require('child_process');
    const util = require('util');
    const execPromise = util.promisify(exec);
    
    try {
      await execPromise('ffmpeg -version');
      res.json({ 
        status: 'ok', 
        ffmpeg: true,
        message: 'Audio City Local API Server is running',
        presets: ['kidandali', 'afrobeat', 'amapiano', 'hiphop', 'pop', 'edm', 'transparent']
      });
    } catch {
      res.json({ 
        status: 'ok', 
        ffmpeg: false,
        message: 'Audio City Local API Server is running (FFmpeg not available)'
      });
    }
  } catch (error) {
    res.json({ 
      status: 'ok', 
      ffmpeg: false,
      message: 'Audio City Local API Server is running',
      error: error.message
    });
  }
});

// Mastering presets
const PRESETS = {
  kidandali: {
    name: 'Kidandali',
    lufs: -9,
    tp: -1.0,
    bass: { freq: 80, gain: 1.5 },
    mid: { freq: 3000, gain: 0.5, q: 1.5 },
    high: { freq: 10000, gain: 0.5 },
    comp: { threshold: -12, ratio: 2, attack: 25, release: 100 },
    limiter: { limit: -0.5, attack: 5, release: 50 }
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
  nico_pan_ugandan_clean_restore: {
    name: 'Nico Pan Ugandan Clean Restore',
    lufs: -9,
    tp: -1.0,
    custom: true
  }
};

// Analyze audio
async function analyzeAudio(filepath) {
  const cmd = `ffmpeg -hide_banner -i "${filepath}" -af ebur128=peak=true -f null - 2>&1`;
  const { stdout } = await execPromise(cmd, { maxBuffer: 50 * 1024 * 1024 });
  
  const lufsMatch = stdout.match(/I:\s+([-\d.]+)\s+LUFS/g);
  const peakMatch = stdout.match(/Peak:\s+([-\d.]+)\s+dBFS/);
  
  let lufs = -23;
  if (lufsMatch && lufsMatch.length > 0) {
    const last = lufsMatch[lufsMatch.length - 1];
    const val = last.match(/([-\d.]+)/);
    if (val) lufs = parseFloat(val[1]);
  }
  
  const peak = peakMatch ? parseFloat(peakMatch[1]) : 0;
  return { lufs, peak };
}

// Nico Pan Ugandan Clean Restore - Advanced mastering chain
async function masterNicoPanUgandanCleanRestore(inputPath, outputWav, outputMp3, progressId = null) {
  const updateProgress = (progress, message, stage) => {
    if (progressId && masteringProgress.has(progressId)) {
      masteringProgress.set(progressId, {
        status: 'processing',
        progress,
        message,
        stage
      });
    }
  };

  console.log(`\n🎛️ Mastering: Nico Pan Ugandan Clean Restore`);
  console.log(`   Target: -9 LUFS, -1.0 dBTP`);
  updateProgress(5, 'Starting Ugandan Clean Restore mastering...', 'init');
  
  updateProgress(10, 'Analyzing input audio...', 'analyze');
  const input = await analyzeAudio(inputPath);
  console.log(`   Input: ${input.lufs.toFixed(1)} LUFS, ${input.peak.toFixed(1)} dBTP`);
  
  const filters = [];
  
  // Saved settings from FabFilter Pro-Q 4
  // 1. Low-cut filter (high-pass) at very low end
  updateProgress(15, 'Applying low-cut filter...', 'eq');
  filters.push(`highpass=f=30:slope=24`);
  
  // 2. Bell cut at 97 Hz (bass control)
  updateProgress(20, 'Applying 97 Hz cut...', 'eq');
  filters.push(`equalizer=f=97:g=-2.0:t=h:w=1.0`); // Bell cut, moderate Q
  
  // 3. Bell cut at 562 Hz (boxiness removal)
  updateProgress(25, 'Applying 562 Hz cut...', 'eq');
  filters.push(`equalizer=f=562:g=-1.5:t=h:w=1.2`); // Bell cut, moderate Q
  
  // 4. Bell cut at 3.9 kHz (harshness control)
  updateProgress(30, 'Applying 3.9 kHz cut...', 'eq');
  filters.push(`equalizer=f=3900:g=-1.5:t=h:w=1.5`); // Bell cut, moderate Q
  
  // 5. Bell cut at 9.4 kHz (top-end taming)
  updateProgress(35, 'Applying 9.4 kHz cut...', 'eq');
  filters.push(`equalizer=f=9400:g=-1.0:t=h:w=1.2`); // Bell cut, moderate Q
  
  // 7. Glue Compression
  // Ratio: 1.5:1, Attack: 30 ms, Release: 150 ms
  // Gain reduction: 1 dB average, 2 dB max, Preserve transients
  updateProgress(45, 'Applying glue compression...', 'compressor');
  filters.push(`acompressor=threshold=-12dB:ratio=1.5:attack=30:release=150`);
  
  // Calculate gain for target LUFS
  const gainNeeded = -9 - input.lufs;
  const safeGain = Math.max(-6, Math.min(12, gainNeeded));
  console.log(`   Gain: ${safeGain.toFixed(1)} dB`);
  
  if (Math.abs(safeGain) > 0.5) {
    updateProgress(50, 'Adjusting gain...', 'gain');
    filters.push(`volume=${safeGain}dB`);
  }
  
  // 8. Loudness & Safety Limiting
  // True peak limiter, Target: -9 LUFS integrated
  // True peak ceiling: -1.0 dBTP, Oversampling enabled, No clipping, No hard limiting
  updateProgress(55, 'Applying safety limiter...', 'limiter');
  filters.push(`alimiter=limit=-1.0dB:attack=5:release=50`);
  
  const filterChain = filters.join(',');
  console.log(`   Chain: ${filters.length} stages`);
  
  updateProgress(65, 'Processing audio with FFmpeg...', 'process');
  const cmd = `ffmpeg -hide_banner -y -i "${inputPath}" -af "${filterChain}" -c:a pcm_s24le -ar 48000 "${outputWav}"`;
  await execPromise(cmd, { maxBuffer: 50 * 1024 * 1024 });
  console.log('   ✅ WAV created');
  updateProgress(70, 'WAV file created, verifying output...', 'verify');
  
  const output = await analyzeAudio(outputWav);
  console.log(`   Output: ${output.lufs.toFixed(1)} LUFS, ${output.peak.toFixed(1)} dBTP`);
  
  // Fine-tune if needed
  if (Math.abs(output.lufs - (-9)) > 2) {
    console.log('   🔄 Fine-tuning with loudnorm...');
    updateProgress(75, 'Fine-tuning with loudnorm...', 'fine-tune');
    const tempWav = outputWav.replace('.wav', '_temp.wav');
    fs.renameSync(outputWav, tempWav);
    const lnCmd = `ffmpeg -hide_banner -y -i "${tempWav}" -af "loudnorm=I=-9:TP=-1.0:LRA=20:linear=true" -c:a pcm_s24le -ar 48000 "${outputWav}"`;
    await execPromise(lnCmd, { maxBuffer: 50 * 1024 * 1024 });
    fs.unlinkSync(tempWav);
    const final = await analyzeAudio(outputWav);
    output.lufs = final.lufs;
    output.peak = final.peak;
  }
  
  // Add voice tag if it exists (same as other presets)
  let voiceTagAdded = false;
  let voiceTagPath = null;
  console.log(`   🔍 Checking for voice tag in: ${VOICE_TAG_DIR}`);
  
  if (fs.existsSync(DEFAULT_VOICE_TAG)) {
    voiceTagPath = DEFAULT_VOICE_TAG;
  } else if (fs.existsSync(VOICE_TAG_MP3)) {
    voiceTagPath = VOICE_TAG_MP3;
  } else {
    try {
      const files = fs.readdirSync(VOICE_TAG_DIR);
      for (const file of files) {
        const filePath = path.join(VOICE_TAG_DIR, file);
        const ext = path.extname(file).toLowerCase();
        if ((ext === '.wav' || ext === '.mp3') && fs.statSync(filePath).isFile()) {
          voiceTagPath = filePath;
          break;
        }
      }
    } catch (err) {
      console.log(`   ⚠️ Error reading voice-tags folder: ${err.message}`);
    }
  }
  
  if (voiceTagPath) {
    updateProgress(80, 'Adding voice tag before track ends...', 'voice-tag');
    console.log('   🎤 Adding voice tag before track ends...');
    
    const tempVoiceTag = path.join(OUTPUT_DIR, `voice_tag_${uuidv4()}.wav`);
    try {
      const durationCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outputWav}"`;
      const { stdout: durationOutput } = await execPromise(durationCmd, { maxBuffer: 10 * 1024 * 1024 });
      const trackDuration = parseFloat(durationOutput.trim());
      
      const tagDurationCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${voiceTagPath}"`;
      const { stdout: tagDurationOutput } = await execPromise(tagDurationCmd, { maxBuffer: 10 * 1024 * 1024 });
      const voiceTagDuration = parseFloat(tagDurationOutput.trim());
      
      const insertPoint = Math.max(trackDuration - 3, trackDuration * 0.8);
      const endPoint = insertPoint + voiceTagDuration;
      
      const convertCmd = `ffmpeg -hide_banner -y -i "${voiceTagPath}" -c:a pcm_s24le -ar 48000 "${tempVoiceTag}"`;
      await execPromise(convertCmd, { maxBuffer: 50 * 1024 * 1024 });
      
      const normalizedVoiceTag = path.join(OUTPUT_DIR, `voice_tag_norm_${uuidv4()}.wav`);
      const normalizeCmd = `ffmpeg -hide_banner -y -i "${tempVoiceTag}" -af "volume=-3dB" -c:a pcm_s24le -ar 48000 "${normalizedVoiceTag}"`;
      await execPromise(normalizeCmd, { maxBuffer: 50 * 1024 * 1024 });
      
      const part1 = path.join(OUTPUT_DIR, `part1_${uuidv4()}.wav`);
      const part2 = path.join(OUTPUT_DIR, `part2_${uuidv4()}.wav`);
      
      const extractPart1Cmd = `ffmpeg -hide_banner -y -i "${outputWav}" -t ${insertPoint} -c:a pcm_s24le -ar 48000 "${part1}"`;
      await execPromise(extractPart1Cmd, { maxBuffer: 50 * 1024 * 1024 });
      
      if (endPoint < trackDuration) {
        const remainingDuration = trackDuration - endPoint;
        const extractPart2Cmd = `ffmpeg -hide_banner -y -i "${outputWav}" -ss ${endPoint} -t ${remainingDuration} -c:a pcm_s24le -ar 48000 "${part2}"`;
        await execPromise(extractPart2Cmd, { maxBuffer: 50 * 1024 * 1024 });
      }
      
      const concatList = path.join(OUTPUT_DIR, `concat_${uuidv4()}.txt`);
      let concatContent = `file '${part1.replace(/'/g, "'\\''")}'\nfile '${normalizedVoiceTag.replace(/'/g, "'\\''")}'\n`;
      if (fs.existsSync(part2)) {
        concatContent += `file '${part2.replace(/'/g, "'\\''")}'\n`;
      }
      fs.writeFileSync(concatList, concatContent);
      
      const finalWavWithTag = path.join(OUTPUT_DIR, `${path.basename(outputWav, '.wav')}_tagged.wav`);
      const concatCmd = `ffmpeg -hide_banner -y -f concat -safe 0 -i "${concatList}" -c:a pcm_s24le -ar 48000 "${finalWavWithTag}"`;
      await execPromise(concatCmd, { maxBuffer: 50 * 1024 * 1024 });
      
      fs.unlinkSync(outputWav);
      fs.renameSync(finalWavWithTag, outputWav);
      
      fs.unlinkSync(tempVoiceTag);
      fs.unlinkSync(normalizedVoiceTag);
      if (fs.existsSync(part1)) fs.unlinkSync(part1);
      if (fs.existsSync(part2)) fs.unlinkSync(part2);
      fs.unlinkSync(concatList);
      
      console.log('   ✅ Voice tag added before track ends');
      voiceTagAdded = true;
    } catch (err) {
      console.warn('   ⚠️ Could not add voice tag:', err.message);
      if (fs.existsSync(tempVoiceTag)) fs.unlinkSync(tempVoiceTag);
    }
  }
  
  updateProgress(85, 'Encoding MP3...', 'mp3');
  const mp3Cmd = `ffmpeg -hide_banner -y -i "${outputWav}" -c:a libmp3lame -b:a 320k "${outputMp3}"`;
  await execPromise(mp3Cmd, { maxBuffer: 50 * 1024 * 1024 });
  console.log('   ✅ MP3 created');
  updateProgress(95, 'Finalizing...', 'finalize');
  
  return {
    input,
    output: { lufs: output.lufs, truePeak: output.peak },
    preset: 'nico_pan_ugandan_clean_restore',
    gain: safeGain,
    voiceTagAdded
  };
}

// Master audio
async function masterAudio(inputPath, outputWav, outputMp3, presetName, progressId = null) {
  // Special handling for custom presets
  if (presetName === 'nico_pan_ugandan_clean_restore') {
    return await masterNicoPanUgandanCleanRestore(inputPath, outputWav, outputMp3, progressId);
  }

  const updateProgress = (progress, message, stage) => {
    if (progressId && masteringProgress.has(progressId)) {
      masteringProgress.set(progressId, {
        status: 'processing',
        progress,
        message,
        stage
      });
    }
  };

  const p = PRESETS[presetName] || PRESETS.kidandali;
  
  console.log(`\n🎛️ Mastering: ${p.name}`);
  console.log(`   Target: ${p.lufs} LUFS, ${p.tp} dBTP`);
  updateProgress(5, `Starting ${p.name} mastering...`, 'init');
  
  updateProgress(10, 'Analyzing input audio...', 'analyze');
  const input = await analyzeAudio(inputPath);
  console.log(`   Input: ${input.lufs.toFixed(1)} LUFS, ${input.peak.toFixed(1)} dBTP`);
  
  const gainNeeded = p.lufs - input.lufs;
  const safeGain = Math.max(-6, Math.min(12, gainNeeded));
  console.log(`   Gain: ${safeGain.toFixed(1)} dB`);
  
  updateProgress(20, 'Building processing chain...', 'build');
  const filters = [];
  if (p.bass.gain !== 0) {
    filters.push(`lowshelf=f=${p.bass.freq}:g=${p.bass.gain}`);
    updateProgress(25, 'Applying bass EQ...', 'eq');
  }
  if (p.mid.gain !== 0) {
    filters.push(`equalizer=f=${p.mid.freq}:g=${p.mid.gain}:t=h:w=${p.mid.q || 1}`);
    updateProgress(30, 'Applying mid-range EQ...', 'eq');
  }
  if (p.high.gain !== 0) {
    filters.push(`highshelf=f=${p.high.freq}:g=${p.high.gain}`);
    updateProgress(35, 'Applying high-frequency EQ...', 'eq');
  }
  if (input.lufs > -20) {
    filters.push(`acompressor=threshold=${p.comp.threshold}dB:ratio=${p.comp.ratio}:attack=${p.comp.attack}:release=${p.comp.release}`);
    updateProgress(40, 'Applying compressor...', 'compressor');
  }
  if (Math.abs(safeGain) > 0.5) {
    filters.push(`volume=${safeGain}dB`);
    updateProgress(45, 'Adjusting gain...', 'gain');
  }
  filters.push(`alimiter=limit=${p.limiter.limit}dB:attack=${p.limiter.attack}:release=${p.limiter.release}`);
  updateProgress(50, 'Applying limiter...', 'limiter');
  
  const filterChain = filters.join(',');
  console.log(`   Chain: ${filters.length} stages`);
  
  updateProgress(55, 'Processing audio with FFmpeg...', 'process');
  const cmd = `ffmpeg -hide_banner -y -i "${inputPath}" -af "${filterChain}" -c:a pcm_s24le -ar 48000 "${outputWav}"`;
  await execPromise(cmd, { maxBuffer: 50 * 1024 * 1024 });
  console.log('   ✅ WAV created');
  updateProgress(70, 'WAV file created, verifying output...', 'verify');
  
  const output = await analyzeAudio(outputWav);
  console.log(`   Output: ${output.lufs.toFixed(1)} LUFS, ${output.peak.toFixed(1)} dBTP`);
  
  if (Math.abs(output.lufs - p.lufs) > 2) {
    console.log('   🔄 Fine-tuning with loudnorm...');
    updateProgress(75, 'Fine-tuning with loudnorm...', 'fine-tune');
    const tempWav = outputWav.replace('.wav', '_temp.wav');
    fs.renameSync(outputWav, tempWav);
    const lnCmd = `ffmpeg -hide_banner -y -i "${tempWav}" -af "loudnorm=I=${p.lufs}:TP=${p.tp}:LRA=20:linear=true" -c:a pcm_s24le -ar 48000 "${outputWav}"`;
    await execPromise(lnCmd, { maxBuffer: 50 * 1024 * 1024 });
    fs.unlinkSync(tempWav);
    const final = await analyzeAudio(outputWav);
    output.lufs = final.lufs;
    output.peak = final.peak;
  }
  
  // Add voice tag at the end if it exists
  let voiceTagAdded = false;
  
  // Check for voice tag file (prefer WAV, fallback to MP3, or any audio file in folder)
  let voiceTagPath = null;
  console.log(`   🔍 Checking for voice tag in: ${VOICE_TAG_DIR}`);
  
  // First try exact names
  if (fs.existsSync(DEFAULT_VOICE_TAG)) {
    voiceTagPath = DEFAULT_VOICE_TAG;
    console.log(`   ✅ Found voice tag: ${voiceTagPath}`);
  } else if (fs.existsSync(VOICE_TAG_MP3)) {
    voiceTagPath = VOICE_TAG_MP3;
    console.log(`   ✅ Found voice tag: ${voiceTagPath}`);
  } else {
    // Try to find any audio file in the voice-tags folder
    try {
      const files = fs.readdirSync(VOICE_TAG_DIR);
      console.log(`   🔍 Files in voice-tags folder: ${files.join(', ')}`);
      
      // Look for any WAV or MP3 file
      for (const file of files) {
        const filePath = path.join(VOICE_TAG_DIR, file);
        const ext = path.extname(file).toLowerCase();
        if ((ext === '.wav' || ext === '.mp3') && fs.statSync(filePath).isFile()) {
          voiceTagPath = filePath;
          console.log(`   ✅ Found voice tag file: ${filePath}`);
          break;
        }
      }
      
      if (!voiceTagPath) {
        console.log(`   ⚠️ No voice tag file found. Looking for: voice-tag.wav, voice-tag.mp3, or any .wav/.mp3 file`);
      }
    } catch (err) {
      console.log(`   ⚠️ Error reading voice-tags folder: ${err.message}`);
    }
  }
  
  if (voiceTagPath) {
    updateProgress(80, 'Adding voice tag before track ends...', 'voice-tag');
    console.log('   🎤 Adding voice tag before track ends...');
    
    // Create temporary file for voice tag (convert to same format as mastered audio)
    const tempVoiceTag = path.join(OUTPUT_DIR, `voice_tag_${uuidv4()}.wav`);
    
    try {
      // Get the duration of the mastered track
      const durationCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outputWav}"`;
      const { stdout: durationOutput } = await execPromise(durationCmd, { maxBuffer: 10 * 1024 * 1024 });
      const trackDuration = parseFloat(durationOutput.trim());
      
      // Get the duration of the voice tag
      const tagDurationCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${voiceTagPath}"`;
      const { stdout: tagDurationOutput } = await execPromise(tagDurationCmd, { maxBuffer: 10 * 1024 * 1024 });
      const voiceTagDuration = parseFloat(tagDurationOutput.trim());
      
      // Insert voice tag 3 seconds before the end (or at 80% of track if track is short)
      const insertPoint = Math.max(trackDuration - 3, trackDuration * 0.8);
      const endPoint = insertPoint + voiceTagDuration;
      
      console.log(`   📊 Track duration: ${trackDuration.toFixed(2)}s, Voice tag: ${voiceTagDuration.toFixed(2)}s, Insert at: ${insertPoint.toFixed(2)}s`);
      
      // Convert voice tag to match mastered audio format (24-bit, 48kHz)
      const convertCmd = `ffmpeg -hide_banner -y -i "${voiceTagPath}" -c:a pcm_s24le -ar 48000 "${tempVoiceTag}"`;
      await execPromise(convertCmd, { maxBuffer: 50 * 1024 * 1024 });
      
      // Normalize voice tag to match mastered audio level (slightly quieter, -3dB)
      const normalizedVoiceTag = path.join(OUTPUT_DIR, `voice_tag_norm_${uuidv4()}.wav`);
      const normalizeCmd = `ffmpeg -hide_banner -y -i "${tempVoiceTag}" -af "volume=-3dB" -c:a pcm_s24le -ar 48000 "${normalizedVoiceTag}"`;
      await execPromise(normalizeCmd, { maxBuffer: 50 * 1024 * 1024 });
      
      // Split the mastered track: part before voice tag + part after voice tag
      const part1 = path.join(OUTPUT_DIR, `part1_${uuidv4()}.wav`);
      const part2 = path.join(OUTPUT_DIR, `part2_${uuidv4()}.wav`);
      
      // Extract part 1: from start to insert point
      const extractPart1Cmd = `ffmpeg -hide_banner -y -i "${outputWav}" -t ${insertPoint} -c:a pcm_s24le -ar 48000 "${part1}"`;
      await execPromise(extractPart1Cmd, { maxBuffer: 50 * 1024 * 1024 });
      
      // Extract part 2: from end point to end (if there's remaining audio)
      if (endPoint < trackDuration) {
        const remainingDuration = trackDuration - endPoint;
        const extractPart2Cmd = `ffmpeg -hide_banner -y -i "${outputWav}" -ss ${endPoint} -t ${remainingDuration} -c:a pcm_s24le -ar 48000 "${part2}"`;
        await execPromise(extractPart2Cmd, { maxBuffer: 50 * 1024 * 1024 });
      }
      
      // Create file list for concatenation: part1 + voice tag + part2 (if exists)
      const concatList = path.join(OUTPUT_DIR, `concat_${uuidv4()}.txt`);
      let concatContent = `file '${part1.replace(/'/g, "'\\''")}'\nfile '${normalizedVoiceTag.replace(/'/g, "'\\''")}'\n`;
      if (fs.existsSync(part2)) {
        concatContent += `file '${part2.replace(/'/g, "'\\''")}'\n`;
      }
      fs.writeFileSync(concatList, concatContent);
      
      // Concatenate: part1 + voice tag + part2
      const finalWavWithTag = path.join(OUTPUT_DIR, `${path.basename(outputWav, '.wav')}_tagged.wav`);
      const concatCmd = `ffmpeg -hide_banner -y -f concat -safe 0 -i "${concatList}" -c:a pcm_s24le -ar 48000 "${finalWavWithTag}"`;
      await execPromise(concatCmd, { maxBuffer: 50 * 1024 * 1024 });
      
      // Replace original with tagged version
      fs.unlinkSync(outputWav);
      fs.renameSync(finalWavWithTag, outputWav);
      
      // Cleanup temporary files
      fs.unlinkSync(tempVoiceTag);
      fs.unlinkSync(normalizedVoiceTag);
      if (fs.existsSync(part1)) fs.unlinkSync(part1);
      if (fs.existsSync(part2)) fs.unlinkSync(part2);
      fs.unlinkSync(concatList);
      
      console.log('   ✅ Voice tag added before track ends');
      voiceTagAdded = true;
    } catch (err) {
      console.warn('   ⚠️ Could not add voice tag:', err.message);
      // Continue without voice tag if it fails
      if (fs.existsSync(tempVoiceTag)) fs.unlinkSync(tempVoiceTag);
    }
  }
  
  updateProgress(85, 'Encoding MP3...', 'mp3');
  const mp3Cmd = `ffmpeg -hide_banner -y -i "${outputWav}" -c:a libmp3lame -b:a 320k "${outputMp3}"`;
  await execPromise(mp3Cmd, { maxBuffer: 50 * 1024 * 1024 });
  console.log('   ✅ MP3 created');
  updateProgress(95, 'Finalizing...', 'finalize');
  
  return {
    input,
    output: { lufs: output.lufs, truePeak: output.peak },
    preset: presetName,
    gain: safeGain,
    voiceTagAdded
  };
}

// Progress tracking for mastering
const masteringProgress = new Map();

// Master endpoint
app.post('/api/quick-master', masteringUpload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });

  const preset = req.body.preset || 'kidandali';
  const id = uuidv4();
  const name = req.file.originalname.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');

  const outputWav = path.join(OUTPUT_DIR, `${name}_master_${id}.wav`);
  const outputMp3 = path.join(OUTPUT_DIR, `${name}_master_${id}.mp3`);

  // Initialize progress
  masteringProgress.set(id, {
    status: 'processing',
    progress: 0,
    message: 'Starting mastering process...',
    stage: 'init'
  });

  // Return progressId immediately so frontend can start polling
  // Process in background
  masterAudio(req.file.path, outputWav, outputMp3, preset, id)
    .then(result => {
      fs.unlink(req.file.path, () => {});
      
      // Increment stats
      statsStorage.tracksMastered++;
      saveStatsStorage();
      
      // Mark as complete
      masteringProgress.set(id, {
        status: 'complete',
        progress: 100,
        message: 'Mastering complete!',
        stage: 'complete',
        result: {
          success: true,
          preset: result.preset,
          input: result.input,
          output: result.output,
          gain: result.gain,
          downloads: {
            wav: `/output/${path.basename(outputWav)}`,
            mp3: `/output/${path.basename(outputMp3)}`
          }
        }
      });
    })
    .catch(err => {
      console.error('❌ Error:', err.message);
      masteringProgress.set(id, {
        status: 'error',
        progress: 0,
        message: `Error: ${err.message}`,
        stage: 'error'
      });
    })
    .finally(() => {
      // Clean up progress after 5 minutes
      setTimeout(() => masteringProgress.delete(id), 5 * 60 * 1000);
    });

  // Return immediately with progressId
  res.json({
    success: true,
    progressId: id,
    message: 'Mastering started. Poll /api/mastering-progress/' + id + ' for updates.'
  });
});

// Get mastering result (after completion)
app.get('/api/mastering-result/:id', (req, res) => {
  const progress = masteringProgress.get(req.params.id);
  if (!progress) {
    return res.status(404).json({ error: 'Progress not found' });
  }
  if (progress.status === 'complete' && progress.result) {
    return res.json(progress.result);
  }
  res.json({ status: progress.status, message: progress.message });
});

// Old endpoint - keeping for backward compatibility but should use new flow
app.post('/api/quick-master-old', masteringUpload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });

  const preset = req.body.preset || 'kidandali';
  const id = uuidv4();
  const name = req.file.originalname.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');

  const outputWav = path.join(OUTPUT_DIR, `${name}_master_${id}.wav`);
  const outputMp3 = path.join(OUTPUT_DIR, `${name}_master_${id}.mp3`);

  try {
    const result = await masterAudio(req.file.path, outputWav, outputMp3, preset);
    
    fs.unlink(req.file.path, () => {});

    // Mark as complete
    masteringProgress.set(id, {
      status: 'complete',
      progress: 100,
      message: 'Mastering complete!',
      stage: 'complete'
    });

    res.json({
      success: true,
      preset: result.preset,
      input: result.input,
      output: result.output,
      gain: result.gain,
      downloads: {
        wav: `/output/${path.basename(outputWav)}`,
        mp3: `/output/${path.basename(outputMp3)}`
      },
      progressId: id
    });
  } catch (err) {
    console.error('❌ Error:', err.message);
    masteringProgress.set(id, {
      status: 'error',
      progress: 0,
      message: `Error: ${err.message}`,
      stage: 'error'
    });
    res.status(500).json({ error: err.message });
  } finally {
    // Clean up progress after 5 minutes
    setTimeout(() => masteringProgress.delete(id), 5 * 60 * 1000);
  }
});

// Progress endpoint
app.get('/api/mastering-progress/:id', (req, res) => {
  const progress = masteringProgress.get(req.params.id);
  if (!progress) {
    return res.status(404).json({ error: 'Progress not found' });
  }
  res.json(progress);
});

// Restart endpoint (for PM2 management via API)
app.post('/api/restart', async (req, res) => {
  try {
    const { exec } = require('child_process');
    const util = require('util');
    const execPromise = util.promisify(exec);
    
    // Try multiple PM2 process names
    const processNames = ['api-server', 'audio-city-api', 'audio-city-backend', 'backend'];
    let restarted = false;
    
    for (const name of processNames) {
      try {
        await execPromise(`pm2 restart ${name}`);
        res.json({ success: true, message: `Backend restarted via PM2 (${name})` });
        restarted = true;
        break;
      } catch (err) {
        // Try next name
        continue;
      }
    }
    
    // If specific names failed, try restarting all
    if (!restarted) {
      try {
        await execPromise('pm2 restart all');
        res.json({ success: true, message: 'All PM2 processes restarted' });
      } catch (allError) {
        // Last resort: try to find and restart any node process running api-server
        try {
          await execPromise('pkill -f "node.*api-server" && sleep 1 && cd /root/backend && nohup node api-server.js > server.log 2>&1 &');
          res.json({ success: true, message: 'Backend restarted via process kill/restart' });
        } catch (killError) {
          res.status(500).json({ 
            success: false, 
            error: 'PM2 restart failed', 
            details: allError.message,
            suggestion: 'Please restart manually via SSH'
          });
        }
      }
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/admin/users/:id - Remove user account (admin only)
app.delete('/api/admin/users/:id', (req, res) => {
  try {
    const userId = req.params.id;
    
    // Find user by ID
    let userToRemove = null;
    let userKey = null;
    
    for (const [key, user] of usersStorage.entries()) {
      if (user && user.id === userId) {
        userToRemove = user;
        userKey = key;
        break;
      }
    }
    
    if (!userToRemove) {
      return res.status(404).json({ 
        error: 'User not found',
        userId 
      });
    }
    
    // Check for associated tracks
    const tracksToRemove = tracksStorage.filter(track => 
      track.artist_id === userId || 
      track.user_id === userId ||
      track.creator_id === userId
    );
    
    // Create backup
    const backupFile = USERS_STORAGE_FILE + '.backup.' + Date.now();
    if (fs.existsSync(USERS_STORAGE_FILE)) {
      fs.copyFileSync(USERS_STORAGE_FILE, backupFile);
    }
    
    // Remove user
    usersStorage.delete(userKey);
    saveUsersStorage();
    
    res.json({
      success: true,
      message: 'User account removed successfully',
      removedUser: {
        id: userToRemove.id,
        username: userToRemove.username,
        email: userToRemove.email
      },
      associatedTracks: tracksToRemove.length,
      backupFile: path.basename(backupFile)
    });
  } catch (error) {
    console.error('Error removing user:', error);
    res.status(500).json({ 
      error: 'Failed to remove user', 
      message: error.message 
    });
  }
});

// POST /api/admin/remove-duplicates - Remove duplicate user accounts
app.post('/api/admin/remove-duplicates', (req, res) => {
  try {
    // Load users
    let users = {};
    if (fs.existsSync(USERS_STORAGE_FILE)) {
      const data = fs.readFileSync(USERS_STORAGE_FILE, 'utf8');
      users = JSON.parse(data);
    }
    
    // Group users by email (case-insensitive)
    const usersByEmail = {};
    const duplicates = [];
    
    for (const [key, user] of Object.entries(users)) {
      if (!user || !user.email) continue;
      
      const emailKey = user.email.toLowerCase();
      
      if (!usersByEmail[emailKey]) {
        usersByEmail[emailKey] = [];
      }
      
      usersByEmail[emailKey].push({ key, user });
    }
    
    // Find and remove duplicates
    let removedCount = 0;
    const removedKeys = [];
    
    for (const [email, userList] of Object.entries(usersByEmail)) {
      if (userList.length > 1) {
        // Sort by created_at (oldest first)
        userList.sort((a, b) => {
          const dateA = a.user.created_at ? new Date(a.user.created_at) : new Date(0);
          const dateB = b.user.created_at ? new Date(b.user.created_at) : new Date(0);
          return dateA - dateB;
        });
        
        // Keep the first (oldest) account, remove the rest
        const keep = userList[0];
        const remove = userList.slice(1);
        
        for (const r of remove) {
          delete users[r.key];
          removedKeys.push(r.key);
          removedCount++;
        }
        
        duplicates.push({
          email,
          kept: keep.key,
          removed: remove.map(r => r.key)
        });
      }
    }
    
    // Also check for duplicate usernames
    const usersByUsername = {};
    
    for (const [key, user] of Object.entries(users)) {
      if (!user || !user.username) continue;
      
      const usernameKey = user.username.toLowerCase();
      
      if (!usersByUsername[usernameKey]) {
        usersByUsername[usernameKey] = [];
      }
      
      usersByUsername[usernameKey].push({ key, user });
    }
    
    for (const [username, userList] of Object.entries(usersByUsername)) {
      if (userList.length > 1) {
        // Sort by created_at (oldest first)
        userList.sort((a, b) => {
          const dateA = a.user.created_at ? new Date(a.user.created_at) : new Date(0);
          const dateB = b.user.created_at ? new Date(b.user.created_at) : new Date(0);
          return dateA - dateB;
        });
        
        // Keep the first (oldest) account, remove the rest
        const remove = userList.slice(1);
        
        for (const r of remove) {
          if (users[r.key]) {
            delete users[r.key];
            removedKeys.push(r.key);
            removedCount++;
          }
        }
      }
    }
    
    // Create backup
    const backupFile = USERS_STORAGE_FILE + '.backup.' + Date.now();
    if (fs.existsSync(USERS_STORAGE_FILE)) {
      fs.copyFileSync(USERS_STORAGE_FILE, backupFile);
    }
    
    // Save cleaned users
    fs.writeFileSync(USERS_STORAGE_FILE, JSON.stringify(users, null, 2), 'utf8');
    
    // Reload users storage
    loadUsersStorage();
    
    res.json({
      success: true,
      message: `Removed ${removedCount} duplicate account(s)`,
      duplicatesFound: duplicates.length,
      removedCount,
      removedKeys,
      keptCount: Object.keys(users).length,
      backupFile: path.basename(backupFile)
    });
  } catch (error) {
    console.error('Error removing duplicates:', error);
    res.status(500).json({ 
      error: 'Failed to remove duplicates', 
      message: error.message 
    });
  }
});

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║   Audio City Local API Server                        ║
║   Running on: http://localhost:${PORT}                ║
║                                                       ║
║   Endpoints:                                         ║
║   • GET /api/tracks                                  ║
║   • GET /api/tracks/:id                              ║
║   • GET /api/feed/trending-artists                   ║
║   • POST /api/auth/signup                            ║
║   • POST /api/auth/login                             ║
║   • POST /api/violations/check                       ║
║   • POST /api/quick-master                           ║
║   • GET /api/health                                  ║
╚═══════════════════════════════════════════════════════╝
  `);
});

