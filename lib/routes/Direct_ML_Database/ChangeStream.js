// THIS ARE JUST ALLTERNATIVE FOR THE RESTAPI ML PARNER  ..ALREADY GOING FOR THE RESTAPI FOR MACHINE LEARNING..THE REASON I COMMENT IT OUT

// import mongoose from "mongoose";
// import { setupMessageQueue } from "./MessageQueue.js";

// export async function setupChangeStream() {
//     const db = mongoose.connection.db;
//     const changeStream = db.watch();
//     const sendUpdate = await setupMessageQueue();
  
//     changeStream.on('change', (change) => {
//       console.log('Change detected:', change);
//       sendUpdate(change);
//     });
//   }