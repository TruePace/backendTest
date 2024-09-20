import mongoose from "mongoose";


// Enhanced Video Schema
const BeyondVideoSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  thumbnailUrl: { type: String, required: true },
  videoUrl: { type: String, required: true },
  channelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel', required: true },
  createdAt: { type: Date, default: Date.now },
  duration: { type: Number, default:0 }, // in seconds
  tags: [String],
  likes: [{ type: String }],
  likeCount: { type: Number, default: 0 },
  commentCount: { type: Number, default: 0 },
  views: [{ type: String }], 
  viewCount: { type: Number, default: 0 },
  uniqueViewers: [{ type: String }], // Store UIDs of unique viewers
  avgWatchTime: { type: Number, default: 0 }, // Average watch time in seconds
  engagementScore: { type: Number, default: 0 },
  viralScore: { type: Number, default: 0 },
  isRecommended: { type: Boolean, default: false },
});

// Methods for BeyondVideo Schema
BeyondVideoSchema.methods.calculateEngagementScore = function() {
  const totalInteractions = this.likeCount + this.commentCount;
  const uniqueViewerCount = this.uniqueViewers.length;
  console.log('Calculating engagement score:', {
    totalInteractions,
    uniqueViewerCount
  });
  return uniqueViewerCount > 0 ? (totalInteractions / uniqueViewerCount) * 100 : 0;
};

BeyondVideoSchema.methods.calculateViralScore = function() {
  const timeFactor = Math.max(1, (Date.now() - this.createdAt) / (1000 * 60 * 60)); // Hours since creation
  const engagementRate = this.engagementScore / timeFactor;
  const viewGrowthRate = this.viewCount / timeFactor;
  console.log('Calculating viral score:', {
    timeFactor,
    engagementRate,
    viewGrowthRate
  });
  return (engagementRate * 0.7) + (viewGrowthRate * 0.3); // Weighted average
};

// BeyondVideo Interaction Schema
const BeyondVideoInteractionSchema = new mongoose.Schema({
  userId: { type: String, required: true }, // Store Firebase UID
  videoId: { type: mongoose.Schema.Types.ObjectId, ref: 'BeyondVideo', required: true },
  interactionType: { 
    type: String, 
    enum: ['view', 'like', 'dislike', 'comment', 'share'],
    required: true 
  },
  timestamp: { type: Date, default: Date.now },
  watchDuration: { type: Number }, // Time spent watching (for 'view' interactions)
  deviceInfo: { type: String },
  location: { type: String },
});








// Video Comment Schema
const BeyondVidCommentSchema = new mongoose.Schema({
  userId: { type: String, required: true }, // Store Firebase UID
  username: { type: String, required: true },
  videoId: { type: mongoose.Schema.Types.ObjectId, ref: 'BeyondVideo', required: true },
  picture: { type: String },
  text: { type: String, required: true },
  likes: [{ type: String }], // Store Firebase UIDs of users who liked
  replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'BeyondVidComment' },
  replies: [{ type: mongoose.Schema.Types.ObjectId, ref: 'BeyondVidComment' }],
  createdAt: { type: Date, default: Date.now },
});


export const BeyondVideoInteraction = mongoose.model('BeyondVideoInteraction', BeyondVideoInteractionSchema);
export const BeyondVidComment = mongoose.model('BeyondVidComment', BeyondVidCommentSchema);
export const BeyondVideo = mongoose.model('BeyondVideo', BeyondVideoSchema);







