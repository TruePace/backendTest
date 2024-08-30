import  {Comment}  from "../models/HeadlineModel.js";



// Create a new comment
const postHeadlineNewsComment = async (req, res) => {
    try {
      const { contentId, text, replyTo, username } = req.body;
  
      const newComment = new Comment({
        username,
        text,
        contentId,
      });
  
      if (replyTo) {
        // If it's a reply, add it to the parent comment's replies
        const parentComment = await Comment.findById(replyTo);
        if (!parentComment) {
          return res.status(404).json({ message: "Parent comment not found" });
        }
        parentComment.replies.push(newComment._id);
        await parentComment.save();
      }
  
      await newComment.save();
      res.status(201).json(newComment);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  };
 // Get comments for a specific content
 const getHeadlineNewsComments = async (req, res) => {
    try {
      const { contentId } = req.params;
      const comments = await Comment.find({ contentId, replyTo: null })
        .populate({
          path: 'replies',
          populate: { path: 'replies' }
        })
        .sort('-createdAt');
      
      const commentCount = await Comment.countDocuments({ contentId });
  
      res.json({ comments, commentCount });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  };

  const likeComment = async (req, res) => {
    try {
      const { commentId } = req.params;
      const { username } = req.body; // Changed from userId to username
  
      const comment = await Comment.findById(commentId);
      if (!comment) {
        return res.status(404).json({ message: "Comment not found" });
      }
  
      // Check if the user has already liked the comment
      const likeIndex = comment.likes.indexOf(username);
      if (likeIndex > -1) {
        // User has already liked, so unlike
        comment.likes.splice(likeIndex, 1);
      } else {
        // User hasn't liked, so add like
        comment.likes.push(username);
      }
  
      await comment.save();
      res.json({ likes: comment.likes.length });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  };
  
  export {
    postHeadlineNewsComment,
    getHeadlineNewsComments,
    likeComment 
  };
