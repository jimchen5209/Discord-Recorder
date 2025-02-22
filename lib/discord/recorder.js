const Stream = require('stream');
const Prism = require('prism-media');
const moment = require('moment-timezone')
const AudioUtils = require('./../audio.js');
const LicsonMixer = require('./../lisconMixer/mixer.js');

function startRecord(connection, channelConfig) {
    const recvStream = connection.receive("opus");

    const channelRecvMixer = global.discord.channelRecvMixers[channelConfig.channelID] = new LicsonMixer(16, 2, 48000);
    const outputMP3Stream = global.discord.outputMP3Streams[channelConfig.channelID] = AudioUtils.generatePCMtoMP3Stream(channelRecvMixer);

    const userOPUSStreams = global.discord.userOPUSStreams[channelConfig.channelID] = {};
    const userDecoders = global.discord.userDecoders[channelConfig.channelID] = {};
    const userPCMStreams = global.discord.userPCMStreams[channelConfig.channelID] = {};
    const userMixers = global.discord.userMixers[channelConfig.channelID] = {};
    const userMP3Buffers = global.discord.userMP3Buffers[channelConfig.channelID] = {};

    console.log("[Discord Record] Start record in voice channel => " + channelConfig.channelID + " .");

    // PlayMixer(PCM) => mixer(PCM)
    channelRecvMixer.addSource(global.discord.audio.playMixer[channelConfig.channelID]);

    recvStream.on("data", (data, userID, timestamp, sequence) => {
        if (userID == undefined || channelConfig.record.ignoreUsers.includes(userID)) {
            return;
        }
        if (userOPUSStreams[userID] == undefined) {
            const userOPUSStream = userOPUSStreams[userID] = new Stream.PassThrough();
            const userDecoder = userDecoders[userID] = new Prism.opus.Decoder({
                channels: 2,
                rate: 48000,
                frameSize: 10
            });
            const userPCMStream = userPCMStreams[userID] = new Stream.PassThrough();
            const userMixer = userMixers[userID] = new LicsonMixer(16, 2, 48000);
            const userMP3Buffer = userMP3Buffers[userID] = [];

            console.log("[Discord Record] Add user " + userID + " to record mixer " + channelConfig.channelID + " .")

            // userOPUSStream(OPUS) => userDecoders(OPUS)
            userOPUSStream.pipe(userDecoders[userID]);
            // userDecoder(PCM) => userPCMStream(PCM)
            userDecoder.pipe(userPCMStream)
            // userPCMStream(PCM) => userMixer(PCM)
            userMixer.addSource(userPCMStream)
            // userPCMStream(PCM) => channelRecvMixer(PCM)
            channelRecvMixer.addSource(userPCMStream)

            // userMixer(PCM) => MP3Buffer(MP3)
            AudioUtils.generatePCMtoMP3Stream(userMixer).on("data", mp3Data => {
                userMP3Buffer.push(mp3Data);
                if (userMP3Buffer.length > 4096) {
                    userMP3Buffer.shift(userMP3Buffer.length - 4096)
                }
            });
        }
        userOPUSStreams[userID].push(data);
    });

    if (channelConfig.record.sendTo.type == 'telegram' && channelConfig.record.sendTo.chatID) {
        var mp3File = []
        var mp3Start = moment().tz('Asia/Taipei').format('YYYY-MM-DD hh:mm:ss')
        outputMP3Stream.on('data', function (data) {
            mp3File.push(data)
        })
        setInterval(() => {
            var mp3End = moment().tz('Asia/Taipei').format('YYYY-MM-DD hh:mm:ss')
            const caption = `${mp3Start} -> ${mp3End} \n${moment().tz("Asia/Taipei").format("#YYYYMMDD #YYYY")}`
            const fileName = mp3Start + ' to ' + mp3End + '.mp3'

            mp3Start = moment().tz('Asia/Taipei').format('YYYY-MM-DD hh:mm:ss')

            const fileData = Buffer.concat(mp3File)

            mp3File = [];
            global.telegram.sendAudio(channelConfig.record.sendTo.chatID, fileData, fileName, caption)
        }, 20 * 1000)
    }
}

module.exports = {
    startRecord
}