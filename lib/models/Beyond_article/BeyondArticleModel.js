import mongoose from 'mongoose';

const BeyondArticleSchema = new mongoose.Schema({
  title: { type: String, required: true ,trim: true},
  previewContent: { type: String, required: true, maxlength: 200 },
  previewImage: { type: String,   required: true},
  fullContent: {type: String, required: true},
  channelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel', required: true },
  createdAt: { type: Date, default: Date.now },
  commentsCount: { type: Number, default: 0 },
  likesCount: { type: Number, default: 0 },
  viewsCount: { type: Number, default: 0 },
  readTime: {type: Number, required: true}
});

export const BeyondArticle = mongoose.model('BeyondArticle', BeyondArticleSchema);