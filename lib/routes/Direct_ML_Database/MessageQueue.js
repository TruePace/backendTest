import amqp from 'amqplib'

export async function setupMessageQueue() {
    const connection = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://localhost');
    const channel = await connection.createChannel();
    const queue = 'data_updates';
  
    await channel.assertQueue(queue, { durable: false });
  
    return async function sendUpdate(data) {
      channel.sendToQueue(queue, Buffer.from(JSON.stringify(data)));
    };
  }