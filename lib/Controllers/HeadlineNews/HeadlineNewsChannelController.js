import { Channel ,User} from "../../models/HeadlineNews/HeadlineModel.js";

const getHeadlineNewsChannel= async (req,res)=>{
    try {
        const channels = await Channel.find();
        res.status(200).json(channels);
      } catch (err) {
        console.error('Error fetching channels:', err);
        res.status(500).json({ message: 'Error fetching channels', error: err.message });
      }
}
const postHeadlineNewsChannel =async(req,res)=>{
    try {
        const dbChannel = req.body;
        const newChannel = await Channel.create(dbChannel);
        res.status(201).send(newChannel);
      } catch (err) {
        res.status(500).send(err.message);
      }
}
// //  a single ID
const getHeadlineNewsChannelId = async(req,res)=>{
    try {
        console.log('Received GET request for Channel ID:', req.params.id);
        
        const channel = await Channel.findById(req.params.id);
        
        console.log('Database query result:', channel);
        
        if (!channel) {
            console.log('Channel not found');
            return res.status(404).json({ message: 'Channel not found' });
        }
        
        res.status(200).json(channel);
    } catch (err) {
        console.error('Error fetching channel:', err);
        res.status(500).json({ message: 'Error fetching channel', error: err.message });
    }
}

const putHeadlineNewsChannelId = async(req,res)=>{
    try {
        const updatedChannel = await Channel.findByIdAndUpdate(
            req.params.id,
            { $set: req.body },
            { new: true, runValidators: true }
        );
        if (!updatedChannel) {
            return res.status(404).json({ message: 'Channel not found' });
        }
        res.status(200).json(updatedChannel);
    } catch (err) {
        res.status(500).json({ message: 'Error updating channel', error: err.message });
    }
}
const deleteHeadlineNewsChannelId = async(req,res)=>{
    try {
        const deletedChannel = await Channel.findByIdAndDelete(req.params.id);
        if (!deletedChannel) {
            return res.status(404).json({ message: 'Channel not found' });
        }
        res.status(200).json({ message: 'Channel deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Error deleting channel', error: err.message });
    }
}
const subscribeToChannel = async (req, res) => {
  try {
    const channelId = req.params.id;
    const userId = req.body.userId;

    const channel = await Channel.findById(channelId);
    if (!channel) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    // Update user's subscriptions in the database
    await User.findOneAndUpdate(
      { uid: userId },
      { $addToSet: { subscriptions: channelId } }
    );

    channel.subscriberCount += 1;
    await channel.save();

    res.status(200).json({ message: 'Subscribed successfully', subscriberCount: channel.subscriberCount });
  } catch (err) {
    console.error('Error subscribing to channel:', err);
    res.status(500).json({ message: 'Error subscribing to channel', error: err.message });
  }
};

const unsubscribeFromChannel = async (req, res) => {
  try {
    const channelId = req.params.id;
    const userId = req.body.userId;

    const channel = await Channel.findById(channelId);
    if (!channel) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    // Update user's subscriptions in the database
    await User.findOneAndUpdate(
      { uid: userId },
      { $pull: { subscriptions: channelId } }
    );

    channel.subscriberCount = Math.max(0, channel.subscriberCount - 1);
    await channel.save();

    res.status(200).json({ message: 'Unsubscribed successfully', subscriberCount: channel.subscriberCount });
  } catch (err) {
    console.error('Error unsubscribing from channel:', err);
    res.status(500).json({ message: 'Error unsubscribing from channel', error: err.message });
  }
};

export{
    getHeadlineNewsChannel,
    getHeadlineNewsChannelId,
    postHeadlineNewsChannel,
    putHeadlineNewsChannelId ,
    deleteHeadlineNewsChannelId,
    subscribeToChannel,
    unsubscribeFromChannel
}