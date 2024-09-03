import mongoose from 'mongoose';

const BeyondArticleSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
  imageUrl: { type: String, required: true },
  author: { type: String, required: true },
  truepacerUrl:{type:String, required: true},
  createdAt: { type: Date, default: Date.now },
  commentsCount: { type: Number, default: 0 },
  likesCount: { type: Number, default: 0 },
  viewsCount: { type: Number, default: 0 }
});

export const BeyondArticle = mongoose.model('BeyondArticle', BeyondArticleSchema);