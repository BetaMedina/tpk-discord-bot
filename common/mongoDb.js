const {MongoClient}  = require('mongodb')

const MongoLib = {
  client: MongoClient,
  async connect (uri) {
    this.client = await MongoClient.connect(uri || process.env.MONGO_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    })
  },
  
  async disconnect () {
    await this.client.close()
  },

  getCollection (name){
    return this.client.db().collection(name)
  },

  map (collection){
    const formatingCollection = collection.ops[0]
    const { _id, ...formated } = formatingCollection
    
    return { ...formated, id: _id }
  }
  
}
module.exports = {MongoLib}