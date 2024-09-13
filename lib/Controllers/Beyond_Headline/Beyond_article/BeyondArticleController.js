import { BeyondArticle, BeyondArticleComment } from "../../../models/Beyond_article/BeyondArticleModel.js";
import { Channel } from "../../../models/HeadlineNews/HeadlineModel.js";
import { User } from "../../../models/HeadlineNews/HeadlineModel.js";
import { io } from "../../../../server.js";

export const getAllArticles = async (req, res) => {
  try {
    const articles = await BeyondArticle.find()
      .sort({ createdAt: -1 })
      .populate('channelId', 'name picture');
    res.status(200).json(articles);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getArticleById = async (req, res) => {
  try {
    const article = await BeyondArticle.findById(req.params.id).populate('channelId', 'name picture');
    if (!article) {
      return res.status(404).json({ message: 'Article not found' });
    }
    res.status(200).json(article);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createArticle = async (req, res) => {
  try {
    const { title, previewContent, previewImage, fullContent, channelId, readTime } = req.body;
    
    if (!title || !previewContent || !previewImage || !fullContent || !channelId || !readTime) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const channel = await Channel.findById(channelId);
    if (!channel) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    const newArticle = new BeyondArticle({
      title,
      previewContent,
      previewImage,
      fullContent,
      channelId,
      readTime
    });

    const savedArticle = await newArticle.save();
    res.status(201).json(savedArticle);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const postBeyondArticleComment = async (req, res) => {
  try {
    const { articleId } = req.params;
    const { text, replyTo } = req.body;
    const { uid } = req.user;

    const user = await User.findOne({ uid });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const newComment = new BeyondArticleComment({
      userId: uid,
      username: user.username,
      articleId,
      text,
      replyTo,
      picture: user.photoURL
    });

    if (replyTo) {
      const parentComment = await BeyondArticleComment.findById(replyTo);
      if (!parentComment) {
        return res.status(404).json({ message: "Parent comment not found" });
      }
      parentComment.replies.push(newComment._id);
      await parentComment.save();
    }

    await newComment.save();

    const updatedArticle = await BeyondArticle.findByIdAndUpdate(
      articleId, 
      { $inc: { commentsCount: 1 } },  
      { new: true }
    );

    io.emit('contentUpdated', { 
      contentId: articleId,
      commentCount: updatedArticle.commentsCount,
      likesCount: updatedArticle.likesCount,
      viewsCount: updatedArticle.viewsCount
    });

    res.status(201).json(newComment);
  } catch (error) {
    console.error('Error in postBeyondArticleComment:', error);
    res.status(500).json({ message: error.message });
  }
};

export const getBeyondArticleComments = async (req, res) => {
  try {
    const { articleId } = req.params;
    const comments = await BeyondArticleComment.find({ articleId, replyTo: null })
      .populate({
        path: 'replies',
        populate: {
          path: 'replies',
          populate: { path: 'replies' }
        }
      })
      .sort('-createdAt');

    const commentCount = await BeyondArticleComment.countDocuments({ articleId });

    res.json({ comments, commentCount });
  } catch (error) {
    console.error('Error in getBeyondArticleComments:', error);
    res.status(500).json({ message: "An error occurred while fetching comments." });
  }
};

export const getBeyondArticleCommentCount = async (req, res) => {
  try {
    const { articleId } = req.params;
    const commentCount = await BeyondArticleComment.countDocuments({ articleId });
    res.json({ commentCount });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const likeArticle = async (req, res) => {
  try {
    const { articleId } = req.params;
    const { uid } = req.user;

    const article = await BeyondArticle.findById(articleId);
    if (!article) {
      return res.status(404).json({ message: "Article not found" });
    }

    const likeIndex = article.likes.indexOf(uid);
    if (likeIndex > -1) {
      article.likes.splice(likeIndex, 1);
      article.likesCount = Math.max(0, article.likesCount - 1);
    } else {
      article.likes.push(uid);
      article.likesCount += 1;
    }
    
    await article.save();

    io.emit('contentUpdated', { 
      contentId: article._id, 
      likesCount: article.likesCount,
      commentCount: article.commentsCount,
      viewsCount: article.viewsCount
    });
    
    res.json({ likes: article.likes, likesCount: article.likesCount });
  } catch (error) {
    console.error('Error in likeArticle:', error);
    res.status(500).json({ message: error.message });
  }
};

export const likeBeyondArticleComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const { uid } = req.user;

    const comment = await BeyondArticleComment.findById(commentId);
    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    const likeIndex = comment.likes.indexOf(uid);
    if (likeIndex > -1) {
      comment.likes.splice(likeIndex, 1);
    } else {
      comment.likes.push(uid);
    }

    await comment.save();
    res.json({ likes: comment.likes.length });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const viewArticle = async (req, res) => {
  try {
    const { articleId } = req.params;
    const { uid } = req.user;

    const article = await BeyondArticle.findById(articleId);
    if (!article) {
      return res.status(404).json({ message: "Article not found" });
    }

    if (!article.views.includes(uid)) {
      article.views.push(uid);
      article.viewsCount += 1;
      await article.save();
      io.emit('contentUpdated', { 
        contentId: article._id,
        viewsCount: article.viewsCount,
        likesCount: article.likesCount,
        commentCount: article.commentsCount
      });
    }

    res.json({ views: article.views, viewsCount: article.viewsCount });
  } catch (error) {
    console.error('Error in viewArticle:', error);
    res.status(500).json({ message: error.message });
  }
};