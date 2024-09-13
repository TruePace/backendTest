import { BeyondArticle } from "../../../models/Beyond_article/BeyondArticleModel.js";

export const getAllArticles = async (req, res) => {
  try {
    const articles = await BeyondArticle.find()
      .populate('channelId', 'name picture') // Populate the channelId field
      .sort({ createdAt: -1 });
    res.status(200).json(articles);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getArticleById = async (req, res) => {
  try {
    const article = await BeyondArticle.findById(req.params.id);
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