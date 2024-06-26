const express = require('express');
const app = express();
const http = require('http');
const axios = require('axios');
const server = http.createServer(app);
const telegramBot = require('node-telegram-bot-api');
const ytdl = require('ytdl-core');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');

const token = process.env.TOKEN;

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const MAX_FILE_SIZE_MB = 50;

function compressVideo(inputPath, outputPath, callback) {
    const targetSizeMB = MAX_FILE_SIZE_MB;
    const inputSizeMB = fs.statSync(inputPath).size / (1024 * 1024);

    let videoBitrate = '1000k';
    let audioBitrate = '128k';
    let videoResolution = '-2:480';
    let crfValue = 28;


    if (inputSizeMB > targetSizeMB) {
        videoBitrate = '500k';
        audioBitrate = '64k';
        crfValue = 30;
        videoResolution = '-2:360';
    }

    const ffmpegCommand = ffmpeg(inputPath)
        .outputOptions('-vf', `scale=${videoResolution}`)
        .outputOptions('-c:v', 'libx264')
        .outputOptions('-crf', crfValue.toString())
        .outputOptions('-b:a', audioBitrate)
        .on('end', () => {
            callback(null, outputPath);
        })
        .on('error', (err) => {
            callback(err, null);
        });

    ffmpegCommand
        .addOption('-threads', '2')
        .save(outputPath);
}

function sanitizeFileName(filename) {
    return filename.replace(/[<>:"/\\|?*]+/g, '').replace(/ /g, '_');
}

const greetings = ['hi', 'hey', 'hy', 'hlo', 'hello', 'hi', 'hii', 'hiii', 'hiiii'];

const bot = new telegramBot(token, { polling: true });

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    console.log(chatId, text);

    const introMessage = `
👋 *Hello! I'm your digital helper bot.* 🎉

*Features:*
📺 *YouTube Downloader*: Send me a YouTube link, and I'll download it for you!
📚 *Wikipedia Explorer*: Type any topic, and I'll fetch interesting facts from Wikipedia.

*How to Use:*
- *YouTube*: Paste a YouTube link.
- *Wikipedia*: Type a word or phrase.

🌟 *Start by sending me a message!* Let's explore the digital world together! 🚀
  `;
    if (text == '/start') {
        bot.sendMessage(chatId, introMessage, { parse_mode: 'Markdown' });
        return;
    }

    if(greetings.includes(text.toLowerCase().trim())){
        bot.sendMessage(chatId, `👋 Hello! How can I assist you today? Type "/start" to see what I can do!`);
        return;
    }

    if (ytdl.validateURL(text)) {
        try {
            const info = await ytdl.getInfo(text);
            const videoTitle = info.videoDetails.title;
            console.log(videoTitle);
            const sanitizedTitle = sanitizeFileName(videoTitle);
            const videosDir = path.resolve(__dirname, 'videos');
            const videoPath = path.resolve(videosDir, `${sanitizedTitle}.mp4`);
            const compressedVideoPath = path.resolve(videosDir, `${sanitizedTitle}_compressed.mp4`);

            bot.sendMessage(chatId, 'Downloading your video. Please wait...');


            ytdl(text, { format: 'mp4' }).pipe(fs.createWriteStream(videoPath)).on('finish', async () => {
                let stats = fs.statSync(videoPath);
                let fileSizeInBytes = stats.size;
                let fileSizeInMegabytes = fileSizeInBytes / (1024 * 1024);

                if (fileSizeInMegabytes > MAX_FILE_SIZE_MB) {
                    bot.sendMessage(chatId, 'Compressing the video to fit Telegram limits...');

                    compressVideo(videoPath, compressedVideoPath, async (err, outputPath) => {
                        if (err) {
                            console.error('Error compressing video:', err);
                            bot.sendMessage(chatId, 'Sorry, there was an error compressing your video.');
                            return;
                        }

                        let compressedStats = fs.statSync(outputPath);
                        let compressedSizeInMB = compressedStats.size / (1024 * 1024);

                        if (compressedSizeInMB <= MAX_FILE_SIZE_MB) {
                            try {
                                await bot.sendVideo(chatId, outputPath);
                                fs.unlinkSync(videoPath);
                                fs.unlinkSync(outputPath);
                                bot.sendMessage(chatId, 'Thank you for using this bot. We appreciate your support, Jassi! 🌟');
                            } catch (sendError) {
                                console.error('Error sending video:', sendError);
                                bot.sendMessage(chatId, 'Sorry, there was an error sending your video.');
                            }
                        } else {
                            bot.sendMessage(chatId, 'Sorry, even after compression, the video is too large to send. Please try a smaller video.');
                            fs.unlinkSync(videoPath);
                            fs.unlinkSync(outputPath);
                        }
                    });
                } else {
                    bot.sendVideo(chatId, videoPath).then(() => {
                        fs.unlinkSync(videoPath);
                        bot.sendMessage(chatId, 'Thank you for using this bot. We appreciate your support, Jassi! 🌟');
                    }).catch((sendError) => {
                        console.error('Error sending video:', sendError);
                        bot.sendMessage(chatId, 'Sorry, there was an error sending your video.');
                    });
                }
            }).on('error', (downloadError) => {
                console.error('Error downloading video:', downloadError);
                bot.sendMessage(chatId, 'Sorry, there was an error downloading your video.');
            });
        } catch (error) {
            console.error('Error processing YouTube link:', error);
            bot.sendMessage(chatId, 'Sorry, there was an error processing your request.');
        }
    } else {
        fetchWikipediaInfo(text, chatId);
    }
});



server.listen(3000, 'localhost', () => {
    console.log("Server is running on port 3000");
});
