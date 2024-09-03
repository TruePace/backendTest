import { Content } from "../models/HeadlineModel.js";

const getHeadlineNewsContent= async (req,res)=>{
    try {
        const content = await Content.find();
        res.status(200).json(content);
      } catch (err) {
        console.error('Error fetching contents:', err);
        res.status(500).json({ message: 'Error fetching contents', error: err.message });
      }
}
const postHeadlineNewsContent= async (req,res)=>{
    try {
        const dbContent = req.body;
        const newContent = await Content.create(dbContent);
        res.status(201).send(newContent);
     } catch (err) {
        res.status(500).send(err.message);
      }
}


//  a single ID
const getHeadlineNewsContentId= async (req,res)=>{
    try {
        const content = await Content.findById(req.params.id);
        if (!content) {
            return res.status(404).json({ message: 'Content not found' });
        }
        res.status(200).json(content);
    } catch (err) {
        console.error('Error fetching content:', err);
        res.status(500).json({ message: 'Error fetching content', error: err.message });
    }
}

const putHeadlineNewsContentId= async (req,res)=>{
    try {
        console.log('Received update request for content ID:', req.params.id);
        console.log('Request body:', req.body);

        const updatedContent = await Content.findByIdAndUpdate(
            req.params.id,
            { $set: req.body },
            { new: true, runValidators: true }
        );

        console.log('Updated content:', updatedContent);

        if (!updatedContent) {
            return res.status(404).json({ message: 'Content not found' });
        }

        res.status(200).json(updatedContent);
    } catch (err) {
        console.error('Error updating content:', err);
        res.status(500).json({ message: 'Error updating content', error: err.message });
    }
}
const deleteHeadlineNewsContentId= async (req,res)=>{
    try {
        const deletedContent = await Content.findByIdAndDelete(req.params.id);
        if (!deletedContent) {
            return res.status(404).json({ message: 'Content not found' });
        }
        res.status(200).json({ message: 'Content deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Error deleting content', error: err.message });
    }
}
// POST  Like and dislike content
const getHeadlineNewsContentIdReaction = async(req,res)=>{
    try {
        const { contentId } = req.params;
        const content = await Content.findById(contentId);

        if (!content) {
            return res.status(404).send('Content not found');
        }

        res.status(200).send({
            likeCount: content.likeCount || 0,
            dislikeCount: content.dislikeCount || 0
        });
    } catch (err) {
        res.status(500).send(err.message);
    }
}
const postHeadlineNewsContentAction = async (req, res) => {
    try {
      const { contentId, userId } = req.body;
      const action = req.params.action; // 'like' or 'dislike'
  
      if (!['like', 'dislike'].includes(action)) {
        return res.status(400).send('Invalid action');
      }
  
      const content = await Content.findById(contentId);
      if (!content) {
        return res.status(404).send('Content not found');
      }
  
      // Check if user has already liked or disliked
      const existingReaction = content.reactions.find(r => r.userId === userId);
      if (existingReaction) {
        if (existingReaction.action === action) {
          // User is trying to perform the same action again, so ignore
          return res.status(200).json({
            likeCount: content.likeCount || 0,
            dislikeCount: content.dislikeCount || 0
          });
        } else {
          // User is changing their reaction
          existingReaction.action = action;
          if (action === 'like') {
            content.likeCount += 1;
            content.dislikeCount -= 1;
          } else {
            content.likeCount -= 1;
            content.dislikeCount += 1;
          }
        }
      } else {
        // New reaction
        content.reactions.push({ userId, action });
        if (action === 'like') {
          content.likeCount = (content.likeCount || 0) + 1;
        } else {
          content.dislikeCount = (content.dislikeCount || 0) + 1;
        }
      }
  
      await content.save();
  
      res.status(200).json({
        likeCount: content.likeCount || 0,
        dislikeCount: content.dislikeCount || 0
      });
    } catch (err) {
      console.error('Error:', err);
      res.status(500).json({ error: err.message, stack: err.stack });
    }
  };
export{
    getHeadlineNewsContent,
    getHeadlineNewsContentId,
    postHeadlineNewsContent,
    getHeadlineNewsContentIdReaction,
    postHeadlineNewsContentAction,
    putHeadlineNewsContentId,
    deleteHeadlineNewsContentId
}