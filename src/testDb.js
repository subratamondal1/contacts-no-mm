const { MongoClient } = require('mongodb');

const uri = "mongodb+srv://mmdevadmin:gd3rcD7b54u4r0gV@mmdev.z7q8g.mongodb.net/mmdev?retryWrites=true&w=majority";

async function testConnection() {
  const client = new MongoClient(uri);
  
  try {
    console.log('Connecting to MongoDB...');
    await client.connect();
    console.log('Connected successfully');
    
    const db = client.db('mmdev');
    console.log('Database:', db.databaseName);
    
    const collections = await db.listCollections().toArray();
    console.log('Collections:', collections.map(c => c.name));
    
    const usersCollection = db.collection('users_data');
    const count = await usersCollection.countDocuments();
    console.log('Number of documents in users_data:', count);
    
    const sample = await usersCollection.findOne();
    console.log('Sample document:', sample);
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.close();
  }
}

testConnection();
