import mongoose from "mongoose";

// User Schema
const UserSchema = new mongoose.Schema({
  uid: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true, maxlength: 50 },
  displayName: { type: String },
  photoURL: { type: String },
  username: { type: String, unique: true, required: true },
  createdAt: { type: Date, default: Date.now },
  subscriptions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Channel' }],
  interests: [String],
  lastActive: { type: Date, default: Date.now },
  deviceInfo: {
    userAgent: String,
    platform: String,
    language: String,
    screenResolution: String
  },
  location: {
    type: {
      latitude: Number,
      longitude: Number
    }
  },
  ipAddress: String,
  readingHistory: [{ type: mongoose.Schema.Types.ObjectId, ref: 'BeyondArticle' }],
  interactionScores: { type: Map, of: Number },
  loginHistory: [{
    timestamp: Date,
    ipAddress: String,
    location: {
      latitude: Number,
      longitude: Number
    },
    deviceInfo: {
      userAgent: String,
      platform: String,
      language: String,
      screenResolution: String
    }
  }]
});

// Channel Schema (For Content Creators)
const ChannelSchema = new mongoose.Schema({
  name: { type: String, required: true, maxlength: 50 },
  picture: { type: String }, // URL to the picture
  subscriberCount: { type: Number, default: 0 },
  description: { type: String },
  tags: [String], // Categories or themes of the channel
  createdAt: { type: Date, default: Date.now },
  totalViews: { type: Number, default: 0 },
  avgEngagementRate: { type: Number, default: 0 }, // Average engagement rate of all content
  contentCount: { type: Number, default: 0 },
  topPerformingContent: [{ type: mongoose.Schema.Types.ObjectId, ref: 'BeyondArticle' }],
});

// Content Schema
const ContentSchema = new mongoose.Schema({
  message: { type: String, required: true },
  picture: { type: String, required: false },
  likeCount: { type: Number, default: 0 },
  dislikeCount: { type: Number, default: 0 },
  commentCount: { type: Number, default: 0 },
  shareCount: { type: Number, default: 0 },
  screenshotCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  isJustIn: { type: Boolean, default: true },
  justInExpiresAt: { type: Date },
  channelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel' },
  showInAllChannels: { type: Boolean, default: true },
  engagementScore: { type: Number, default: 0 },
  tags: [String], // Categories or themes of the content
  viewCount: { type: Number, default: 0 },
  uniqueViewers: [{ type: String }], // Store UIDs of unique viewers
  avgReadTime: { type: Number, default: 0 }, // Average time spent reading this content
  viralScore: { type: Number, default: 0 }, // Calculated field for viral potential
  viewedBy: [{ type: String }], // Array of user IDs who have viewed this content
  headlineExpiresAt: { type: Date },
  uploadedAt: { type: Date, default: Date.now },
});

ContentSchema.index({ headlineExpiresAt: 1 }, { expireAfterSeconds: 0 });

// Interaction Schema
const InteractionSchema = new mongoose.Schema({
  userId: { type: String, required: true }, // Store Firebase UID
  contentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Content', required: true },
  interactionType: { 
    type: String, 
    enum: ['view', 'like', 'dislike', 'comment', 'share', 'screenshot'],
    required: true 
  },
  timestamp: { type: Date, default: Date.now },
  duration: { type: Number }, // Time spent on content (for 'view' interactions)
  deviceInfo: { type: String }, // Device used for interaction
  platform: { type: String }, // Platform used for sharing (e.g., 'facebook', 'twitter', 'copy')
});

// Comment Schema
const CommentSchema = new mongoose.Schema({
  userId: { type: String, required: true }, // Store Firebase UID
  username: { type: String, required: true },
  contentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Content', required: true },
  picture: { type: String },
  text: { type: String, required: true },
  likes: [{ type: String }], // Store Firebase UIDs of users who liked
  replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment' },
  replies: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Comment' }],
  createdAt: { type: Date, default: Date.now },
  photoURL: { type: String },
  picture: { type: String }, // Add this for compatibility
});

// Methods
ContentSchema.methods.calculateEngagementScore = function() {
  const totalInteractions = this.likeCount + this.dislikeCount + this.commentCount + 
                            this.shareCount + this.screenshotCount;
  const uniqueViewers = this.uniqueViewers.length;
  return uniqueViewers > 0 ? (totalInteractions / uniqueViewers) * 100 : 0;
};

ContentSchema.methods.calculateViralScore = function() {
  const timeFactor = Math.max(1, (Date.now() - this.createdAt) / (1000 * 60 * 60)); // Hours since creation
  const engagementRate = this.engagementScore / timeFactor;
  const viewGrowthRate = this.viewCount / timeFactor;
  return (engagementRate * 0.7) + (viewGrowthRate * 0.3); // Weighted average
};



// Create models
const User = mongoose.model('User', UserSchema);
const Channel = mongoose.model('Channel', ChannelSchema);
const Content = mongoose.model('Content', ContentSchema);
const Interaction = mongoose.model('Interaction', InteractionSchema);
const Comment = mongoose.model('Comment', CommentSchema);

export { User, Channel, Content, Interaction, Comment };