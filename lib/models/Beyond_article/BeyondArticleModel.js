import mongoose from 'mongoose';

// BeyondArticle Schema (Enhanced)
const BeyondArticleSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  previewContent: { type: String, required: true },
  previewImage: { type: String, required: true },
  fullContent: { type: String, required: true },
  channelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel', required: true },
  createdAt: { type: Date, default: Date.now },
  commentsCount: { type: Number, default: 0 },
  likesCount: { type: Number, default: 0 },
  views: [{ type: String }], // Array of user IDs who viewed the article
  likes: [{ type: String }], // Array of user IDs who liked the article
  viewsCount: { type: Number, default: 0 },
  readTime: { type: Number, required: true },
  tags: [String], // Categories or themes of the article
  engagementScore: { type: Number, default: 0 },
  viralScore: { type: Number, default: 0 },
  shareCount: { type: Number, default: 0 },
  avgReadTime: { type: Number, default: 0 },
  uniqueViewersCount: { type: Number, default: 0 },
});


const BeyondArticleCommentSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  username: { type: String, required: true },
  articleId: { type: mongoose.Schema.Types.ObjectId, ref: 'BeyondArticle', required: true },
  picture: { type: String },
  text: { type: String, required: true },
  likes: [{ type: String }],
  replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'BeyondArticleComment' },
  replies: [{ type: mongoose.Schema.Types.ObjectId, ref: 'BeyondArticleComment' }],
  createdAt: { type: Date, default: Date.now },
  sentiment: { type: String, enum: ['positive', 'neutral', 'negative'] },
});

// ArticleInteraction Schema (New)
const ArticleInteractionSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  articleId: { type: mongoose.Schema.Types.ObjectId, ref: 'BeyondArticle', required: true },
  interactionType: { 
    type: String, 
    enum: ['view', 'like', 'comment', 'share'],
    required: true 
  },
  timestamp: { type: Date, default: Date.now },
  platform: { type: String }, // For share interactions
  duration: { type: Number }, // Time spent on article (for 'view' interactions)
  deviceInfo: { type: String },
  location: {
    latitude: { type: Number },
    longitude: { type: Number }
  },
  ipAddress: { type: String },
});

// ContentRecommendation Schema (New)
const ContentRecommendationSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  recommendedArticles: [{
    articleId: { type: mongoose.Schema.Types.ObjectId, ref: 'BeyondArticle' },
    score: { type: Number },
    reason: { type: String }
  }],
  timestamp: { type: Date, default: Date.now },
});

// Methods
BeyondArticleSchema.methods.calculateEngagementScore = function() {
  const totalInteractions = this.likesCount + this.commentsCount + this.shareCount;
  return this.uniqueViewersCount > 0 ? (totalInteractions / this.uniqueViewersCount) * 100 : 0;
};

BeyondArticleSchema.methods.calculateViralScore = function() {
  const timeFactor = Math.max(1, (Date.now() - this.createdAt) / (1000 * 60 * 60)); // Hours since creation
  const engagementRate = this.engagementScore / timeFactor;
  const viewGrowthRate = this.viewsCount / timeFactor;
  return (engagementRate * 0.7) + (viewGrowthRate * 0.3); // Weighted average
};



export const ArticleInteraction = mongoose.model('ArticleInteraction', ArticleInteractionSchema);
 export const ContentRecommendation = mongoose.model('ContentRecommendation', ContentRecommendationSchema);
export const BeyondArticleComment = mongoose.model('BeyondArticleComment', BeyondArticleCommentSchema);
export const BeyondArticle = mongoose.model('BeyondArticle', BeyondArticleSchema);