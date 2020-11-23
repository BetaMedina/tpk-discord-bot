const Discord = require("discord.js");
// const { prefix, token, mongoDbUri } = require("./config.json");
const { MongoLib } = require("./common/mongoDb");
const ytdl = require("ytdl-core");

const client = new Discord.Client();

const queue = new Map();

MongoLib.connect(process.env.mongodbUri).then(async () => {
  execute = async (message, serverQueue) => {
    const args = message.content.split(" ");
    const voiceChannel = message.member.voice.channel;

    if (!voiceChannel)
      return message.channel.send(
        "Você precisa estar em um canal de voz para usar esse comando"
      );

    const songInfo = await ytdl.getInfo(args[1]);
    const song = {
      title: songInfo.videoDetails.title,
      url: songInfo.videoDetails.video_url,
    };

    if (!serverQueue) {
      return playMusicAndConnect(message, song, voiceChannel, message.guild.id);
    }
    return addInQueue(song, serverQueue, message);
  };

  executePlaylist = async (message, songObject, voiceChannel, serverQueue) => {
    const { song: songLink, guildId } = songObject;
    const songInfo = await ytdl.getInfo(songLink);
    const song = {
      title: songInfo.videoDetails.title,
      url: songInfo.videoDetails.video_url,
    };
    if (!serverQueue) {
      return playMusicAndConnect(message, song, voiceChannel, guildId);
    }
    return addInQueue(song, serverQueue, message);
  };

  playMusicAndConnect = async (message, song, voiceChannel, guildId) => {
    const queueContruct = {
      textChannel: message.channel,
      voiceChannel: voiceChannel,
      connection: null,
      songs: [],
      volume: 10,
      playing: true,
    };

    queue.set(guildId, queueContruct);

    queueContruct.songs.push(song);

    try {
      const connection = await voiceChannel.join();
      queueContruct.connection = connection;
      play(message.guild, queueContruct.songs[0]);
      return queueContruct;
    } catch (err) {
      queue.delete(message.guild.id);
      return message.channel.send(err);
    }
  };

  addInQueue = async (song, serverQueue, message) => {
    serverQueue.songs.push(song);
    return message.channel.send(`${song.title} has been added to the queue!`);
  };

  formatAndSendToQueue = async (songObject, message, serverQueue) => {
    const { song: songLink } = songObject;
    const songInfo = await ytdl.getInfo(songLink);
    const song = {
      title: songInfo.videoDetails.title,
      url: songInfo.videoDetails.video_url,
    };

    addInQueue(song, serverQueue, message);
  };

  play = (guild, song) => {
    const serverQueue = queue.get(guild.id);
    if (!song) {
      serverQueue.voiceChannel.leave();
      queue.delete(guild.id);
      return;
    }

    const dispatcher = serverQueue.connection
      .play(ytdl(song.url))
      .on("finish", () => {
        serverQueue.songs.shift();
        play(guild, serverQueue.songs[0]);
      })
      .on("error", (error) => console.error(error));
    dispatcher.setVolumeLogarithmic(serverQueue.volume / 10);
    serverQueue.textChannel.send(`Tocando: **${song.title}**`);
  };

  volume = (message, queue) => {
    const args = message.content.split(" ");

    if (args[1] > 10) {
      return message.channel.send(
        "Coloque um volume de 1 a 10 por gentileza..."
      );
    }

    queue.connection.dispatcher.setVolume(args[1] / 10);
    message.channel.send(`O volume atual está em: ${args[1] * 10}%`);
  };

  clear = (queue) => {
    queue.songs = [];
    queue.connection.dispatcher.end();
  };

  exit = (queue) => {
    queue.songs = [];
    queue.connection.dispatcher.end();
  };

  skip = (message, serverQueue) => {
    if (!message.member.voice.channel)
      return message.channel.send(
        "You have to be in a voice channel to stop the music!"
      );
    if (!serverQueue)
      return message.channel.send("There is no song that I could skip!");

    serverQueue.connection.dispatcher.end();
  };

  createPlaylist = async (message) => {
    const user = message.author.id;
    const playlistName = message.content.split(" ");

    const playlistCollection = MongoLib.getCollection("user-playlist");

    const formatData = {
      userId: user,
      playlistName: playlistName[1],
      songs: [],
    };

    await playlistCollection.updateOne(
      { userId: user, playlistName: playlistName[1] },
      { $set: { ...formatData } },
      { upsert: true }
    );
    return message.channel.send(
      `Sua playlist **${playlistName[1]}** foi criada com sucesso`
    );
  };

  addSong = async (message) => {
    const playlistCollection = MongoLib.getCollection("user-playlist");
    const user = message.author.id;

    const playlistAndSong = message.content.split(" ");
    if (!playlistAndSong[1]) {
      return message.channel.send(
        "A playlist tem que ser informada, exemplo:  ```>add-song PLAYLIST musica``` "
      );
    }
    if (!playlistAndSong[2]) {
      return message.channel.send(
        "A musica tem que ser informada, exemplo:  ```>add-song playlist MUSICA``` "
      );
    }

    await playlistCollection.updateOne(
      { userId: user, playlistName: playlistAndSong[1] },
      {
        $push: {
          songs: { song: playlistAndSong[2], guildId: message.guild.id },
        },
      },
      { upsert: true }
    );

    return message.channel.send(
      `Sua musica **${playlistAndSong[2]}** foi adicionada a playlist ${playlistAndSong[1]}`
    );
  };

  runPlaylist = async (message, serverQueue) => {
    const playlistCollection = MongoLib.getCollection("user-playlist");
    const user = message.author.id;
    const playlistAndSong = message.content.split(" ");
    const voiceChannel = message.member.voice.channel;

    if (!playlistAndSong[1]) {
      return message.channel.send(
        "A playlist tem que ser informada, exemplo:  ```>add-song PLAYLIST musica``` "
      );
    }
    const songs = await playlistCollection.findOne({
      userId: user,
      playlistName: playlistAndSong[1],
    });
    const queueSong = await executePlaylist(
      message,
      songs.songs[0],
      voiceChannel,
      serverQueue
    );
    delete songs.songs[0];
    await songs.songs.map(async (song) => {
      formatAndSendToQueue(song, message, queueSong);
    });
  };

  listPlaylist = async (message, serverQueue) => {
    const playlistCollection = MongoLib.getCollection("user-playlist");
    const user = message.author.id;
    const songs = [];
    await playlistCollection.find({ userId: user }).forEach((item) => {
      songs.push(item.playlistName);
    });
    const playlistNames = songs.join(", ");
    return message.channel.send(
      `Suas playlists atuais são: **${playlistNames}**`
    );
  };

  deletePlaylist = async (message) => {
    const playlistCollection = MongoLib.getCollection("user-playlist");
    const playlistAndSong = message.content.split(" ");
    const user = message.author.id;

    if (!playlistAndSong[1]) {
      return message.channel.send(
        "A playlist tem que ser informada, exemplo:  ```>delete-playlist PLAYLIST``` "
      );
    }

    await playlistCollection.deleteOne({
      userId: user,
      playlistName: playlistAndSong[1],
    });

    return message.channel.send(
      `Sua playlist **${playlistAndSong[1]}** foi deletada`
    );
  };

  client.login(process.env.token);
  client.on("message", async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith(process.env.prefix)) return;

    const factoryObject = (message, serverQueue) => ({
      [">create-playlist"]: () => createPlaylist(message),
      [">play"]: () => execute(message, serverQueue),
      [">run-playlist"]: () => runPlaylist(message, serverQueue),
      [">add-song"]: () => addSong(message, serverQueue),
      [">volume"]: () => volume(message, serverQueue),
      [">skip"]: () => skip(message, serverQueue),
      [">clear"]: () => clear(serverQueue),
      [">list"]: () => listPlaylist(message, serverQueue),
      [">delete-playlist"]: () => listPlaylist(message),
      [">exit"]: () => exit(serverQueue),
    });
    
    const messagePrefix = message.content.split(" ");
    const serverQueue = queue.get(message.guild.id);
    await factoryObject(message, serverQueue)[messagePrefix[0]]();
  });
});
