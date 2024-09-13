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
  views: [{ type: String }], // Array of user IDs who viewed the video
  likes: [{ type: String }], // Array of user IDs who liked the video
  viewsCount: { type: Number, default: 0 },
  readTime: {type: Number, required: true}
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
});

export const BeyondArticleComment = mongoose.model('BeyondArticleComment', BeyondArticleCommentSchema);
export const BeyondArticle = mongoose.model('BeyondArticle', BeyondArticleSchema);