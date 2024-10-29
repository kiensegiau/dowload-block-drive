const puppeteer = require('puppeteer');
const util = require('util');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { exec, spawn } = require('child_process');
const os = require('os');

// Cấu hình
const OUTPUT_DIR = path.join(__dirname, 'output');
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB mỗi chunk
const MAX_CONCURRENT_CHUNKS = 16; // 16 luồng
const RETRY_TIMES = 3;
const RETRY_DELAY = 1000;

const VIDEO_ITAGS = {
    '137': '1080p',
    '136': '720p',
    '135': '480p', 
    '134': '360p',
    '133': '240p',
    '160': '144p'
};

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function formatTime(seconds) {
    seconds = Math.floor(seconds);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

async function downloadChunk(url, start, end, headers) {
    const rangeHeaders = {
        ...headers,
        'Range': `bytes=${start}-${end}`
    };

    const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'arraybuffer',
        headers: rangeHeaders,
        timeout: 30000
    });

    return response.data;
}

async function downloadVideo(url, filename) {
    const outputPath = path.join(TEMP_DIR, filename);
    console.log(`\n⬇️ Bắt đầu tải ${filename}...`);

    return new Promise(async (resolve, reject) => {
        try {
            // Lấy kích thước file và tính toán chunks
            const response = await axios.head(url, { headers });
            const fileSize = parseInt(response.headers['content-length']);
            const chunks = Math.ceil(fileSize / CHUNK_SIZE);
            const chunkInfos = [];
            let downloadedChunks = 0;
            
            console.log(`📦 Kích thước file ${filename}: ${Math.round(fileSize/1024/1024)}MB`);

            // Tạo thông tin chunks
            for (let i = 0; i < chunks; i++) {
                const start = i * CHUNK_SIZE;
                const end = Math.min(start + CHUNK_SIZE - 1, fileSize - 1);
                chunkInfos.push({ index: i, start, end });
            }

            // Tạo và mở file để ghi
            let fileHandle;
            try {
<<<<<<< HEAD
                // Tạo file trống với kích thước đng
=======
                // Tạo file trống với kích thước đúng
>>>>>>> b3f67cd8dc95596ddeb683492a271c14469f3b34
                const writer = fs.createWriteStream(outputPath);
                await new Promise((res, rej) => {
                    writer.on('error', rej);
                    writer.on('finish', res);
                    writer.write(Buffer.alloc(fileSize));
                    writer.end();
                });

                // Mở file để ghi chunks
                fileHandle = await fs.promises.open(outputPath, 'r+');
                console.log(`🚀 Tải với ${MAX_CONCURRENT_CHUNKS} luồng...`);

                // Tải chunks
                let startTime = Date.now();
                let lastUpdate = Date.now();
                let lastBytes = 0;

                for (let i = 0; i < chunks; i += MAX_CONCURRENT_CHUNKS) {
                    const batch = chunkInfos.slice(i, i + MAX_CONCURRENT_CHUNKS);
                    await Promise.all(batch.map(async ({ index, start, end }) => {
                        try {
                            const chunkData = await downloadChunk(url, start, end, headers);
                            await fileHandle.write(chunkData, 0, chunkData.length, start);
                            downloadedChunks++;

                            // Hiển thị tiến trình
                            const downloadedBytes = downloadedChunks * CHUNK_SIZE;
                            const progress = (downloadedChunks / chunks) * 100;
                            const currentTime = Date.now();

                            if (currentTime - lastUpdate >= 1000) {
                                const speed = ((downloadedBytes - lastBytes) / 1024 / 1024) / ((currentTime - lastUpdate) / 1000);
                                const elapsed = (currentTime - startTime) / 1000;
                                const remaining = elapsed / (progress / 100) - elapsed;

                                process.stdout.write(
                                    `\r⏳ ${filename}: ${Math.round(downloadedBytes/1024/1024)}MB / ${Math.round(fileSize/1024/1024)}MB ` +
                                    `(${progress.toFixed(2)}%) - ${speed.toFixed(2)} MB/s - Còn lại: ${formatTime(remaining)}`
                                );

                                lastUpdate = currentTime;
                                lastBytes = downloadedBytes;
                            }
                        } catch (error) {
                            console.error(`\n❌ Lỗi tải chunk ${index}:`, error.message);
                            throw error;
                        }
                    }));
                }

                console.log(`\n✅ Hoàn thành tải ${filename}`);
                resolve();
            } catch (error) {
                reject(error);
            } finally {
                if (fileHandle) {
                    await fileHandle.close();
                }
            }
        } catch (error) {
            reject(error);
        }
    });
}

async function mergeVideoAudio(filename) {
    const videoPath = path.join(TEMP_DIR, 'temp_video.mp4');
    const audioPath = path.join(TEMP_DIR, 'temp_audio.mp4');
<<<<<<< HEAD
    const outputPath = path.join(VIDEO_OUTPUT_DIR, filename);

    if (!fs.existsSync(VIDEO_OUTPUT_DIR)) {
        fs.mkdirSync(VIDEO_OUTPUT_DIR, { recursive: true });
    }
=======
    const outputPath = path.join(OUTPUT_DIR, filename);
>>>>>>> b3f67cd8dc95596ddeb683492a271c14469f3b34

    return new Promise((resolve, reject) => {
        console.log('🔄 Đang ghép video và audio...');
        const startTime = Date.now();

        // Truyền tham số dưới dạng mảng
        const ffmpeg = spawn('ffmpeg', [
            '-y',
            '-i', videoPath,
            '-i', audioPath,
            '-c:v', 'copy',
            '-c:a', 'copy',
            '-movflags', '+faststart',
            '-threads', '24',
            '-thread_queue_size', '512',
            '-bufsize', '512M',
            '-tune', 'fastdecode',
            '-rc-lookahead', '0',
            '-g', '60',
            '-keyint_min', '60',
            '-progress', path.join(TEMP_DIR, 'ffmpeg-progress.txt'),
            outputPath
        ]);

        // Chỉ log lỗi quan trọng
        ffmpeg.stderr.on('data', (data) => {
            const msg = data.toString();
            if (msg.includes('Error') || msg.includes('error')) {
                log(`❌ FFmpeg error:\n${msg}`, true);
            }
        });

        ffmpeg.on('close', (code) => {
            if (code === 0) {
                const duration = ((Date.now() - startTime) / 1000).toFixed(1);
                const fileSize = (fs.statSync(outputPath).size / (1024 * 1024)).toFixed(1);
                log(`✅ Hoàn thành ghép video! (${duration}s)`);
                log(`📦 File cuối: ${fileSize}MB`);
                resolve();
            } else {
                reject(new Error(`FFmpeg exit với code ${code}`));
            }
        });
    });
}

// Thêm biến global ở đầu file
let browser;
let page;
let headers = {};

<<<<<<< HEAD
// Thêm hằng số cho video output directory
const VIDEO_OUTPUT_DIR = path.join(process.cwd(), 'downloads', 'video');

// Thêm vào đầu file, giữ nguyên các imports hiện có
const TOKEN_PATH = "token.json";

=======
>>>>>>> b3f67cd8dc95596ddeb683492a271c14469f3b34
// Sửa lại hàm getVideoUrl
async function getVideoUrl(driveId, filename) {
    try {
        console.log('🚀 Khởi động trình duyệt...');
<<<<<<< HEAD
        
        browser = await puppeteer.launch({
            headless: false,
            defaultViewport: null,
            args: [
                '--start-maximized',
=======
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
>>>>>>> b3f67cd8dc95596ddeb683492a271c14469f3b34
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process',
<<<<<<< HEAD
                '--disable-blink-features=AutomationControlled',
                '--allow-running-insecure-content',
                '--disable-site-isolation-trials',
                '--disable-features=BlockInsecurePrivateNetworkRequests'
            ],
            ignoreDefaultArgs: ['--enable-automation']
        });

        const page = await browser.newPage();
        
        // Thêm các headers giống trình duyệt thật
        await page.setExtraHTTPHeaders({
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Upgrade-Insecure-Requests': '1'
        });

        // Theo dõi tất cả các requests
        const client = await page.target().createCDPSession();
        await client.send('Network.enable');
        
        let videoUrls = new Map(); // Lưu tất cả các URL video với các itag khác nhau

        // Theo dõi cả requests và responses
        client.on('Network.requestWillBeSent', request => {
            const url = request.request.url;
            if (url.includes('videoplayback')) {
                // Phân tích URL để lấy itag
                const urlObj = new URL(url);
                const itag = urlObj.searchParams.get('itag');
                if (itag) {
                    console.log(`🔍 Tìm thấy video stream itag=${itag} (${VIDEO_ITAGS[itag] || 'unknown'})`);
                    videoUrls.set(itag, url);
                }
            }
        });

        client.on('Network.responseReceived', response => {
            const url = response.response.url;
            if (url.includes('videoplayback')) {
                console.log(`📥 Response cho video URL:`, {
                    status: response.response.status,
                    headers: response.response.headers
                });
            }
        });

        // Chặn các requests không cần thiết để tăng tốc
        await page.setRequestInterception(true);
        page.on('request', (request) => {
            if (request.resourceType() === 'image' || 
                request.resourceType() === 'stylesheet' || 
                request.resourceType() === 'font') {
                request.abort();
            } else {
                request.continue();
            }
        });

        const driveUrl = `https://drive.google.com/file/d/${driveId}/view`;
        console.log('🌐 Đang truy cập video...');
        
        await page.goto(driveUrl, {
=======
                '--flag-switches-begin',
                '--flag-switches-end',
                `--window-size=1920,1080`
            ],
            defaultViewport: {
                width: 1920,
                height: 1080
            },
            userDataDir: path.join(__dirname, 'chrome-data')
        });
        
        page = await browser.newPage();

        // Lấy cookies và user agent để tạo headers
        const cookies = await page.cookies();
        const userAgent = await page.evaluate(() => navigator.userAgent);
        
        // Khởi tạo headers
        headers = {
            'Cookie': cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; '),
            'User-Agent': userAgent,
            'Accept': '*/*',
            'Accept-Encoding': 'identity;q=1, *;q=0',
            'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
            'Connection': 'keep-alive'
        };

        // Truy cập URL video Drive
        const videoUrl =
          "https://drive.google.com/file/d/1mMXEGewkYhzNg59SdhTWMdtp7XDIKGsw/view?usp=drive_link";
        console.log('🌐 Đang truy cp video...');
        
        await page.goto(videoUrl, {
>>>>>>> b3f67cd8dc95596ddeb683492a271c14469f3b34
            waitUntil: 'networkidle0',
            timeout: 60000
        });

<<<<<<< HEAD
        // Click vào player để kích hoạt load video
        try {
            await page.click('.drive-viewer-video-player');
            console.log('✅ Đã click vào video player');
        } catch (err) {
            console.log('⚠️ Không thể click vào video player');
        }

        // Đợi và kiểm tra các streams
        console.log('⏳ Đang đợi video streams load...');
        await new Promise(resolve => setTimeout(resolve, 10000));

        // Tìm URL video chất lượng cao nhất
        let bestUrl = null;
        let bestQuality = '';
        
        for (const [itag, url] of videoUrls.entries()) {
            const quality = VIDEO_ITAGS[itag];
            if (quality && (!bestQuality || getQualityRank(quality) > getQualityRank(bestQuality))) {
                bestUrl = url;
                bestQuality = quality;
            }
        }

        if (bestUrl) {
            console.log(`✅ Đã tìm thấy video chất lượng cao nhất: ${bestQuality}`);
            return bestUrl;
        } else {
            console.log('⚠️ Không tìm thấy URL video');
            return null;
        }

    } catch (error) {
        console.error('❌ Lỗi:', error.message);
=======
        console.log('⏳ Đang đợi video load...');
        const previewFrame = await page.waitForSelector('iframe[src*="drive.google.com"]');
        const contentFrame = await previewFrame.contentFrame();

        // Tìm URL trực tiếp từ source
        const videoData = await contentFrame.evaluate(() => {
            const ytPlayer = document.querySelector('#movie_player');
            if (ytPlayer && ytPlayer.getAvailableQualityLevels) {
                const qualities = ytPlayer.getAvailableQualityLevels();
                const config = ytPlayer.getPlayerResponse();
                return {
                    qualities: qualities,
                    streamingData: config.streamingData
                };
            }
            return null;
        });

        if (videoData && videoData.streamingData) {
            const { formats, adaptiveFormats } = videoData.streamingData;
            
            // Tìm video stream chất lượng cao nhất
            let bestVideoStream = null;
            let audioStream = null;

            for (const format of adaptiveFormats) {
                if (format.mimeType.includes('video/mp4')) {
                    if (!bestVideoStream || format.height > bestVideoStream.height) {
                        bestVideoStream = format;
                    }
                } else if (format.mimeType.includes('audio/mp4') && !audioStream) {
                    audioStream = format;
                }
            }

            if (bestVideoStream && audioStream) {
                console.log(`🎥 Đã tìm thấy video stream (${bestVideoStream.height}p)`);
                console.log(`🔊 Đã tìm thấy audio stream`);

                console.log(`\n📺 Tải video với độ phân giải ${bestVideoStream.height}p`);
                await downloadVideo(bestVideoStream.url, 'temp_video.mp4');
                await downloadVideo(audioStream.url, 'temp_audio.mp4');
                await mergeVideoAudio(filename);
                return;
            }
        }

        // Nếu không tìm được URL trực tiếp, fallback về cách cũ
        console.log('⚠️ Không tìm được URL trực tiếp, thử phương pháp khác...');
        // ... code cũ ...

    } catch (error) {
        log(`Lỗi trong getVideoUrl: ${error.message}`, true);
>>>>>>> b3f67cd8dc95596ddeb683492a271c14469f3b34
        throw error;
    }
}

<<<<<<< HEAD
// Helper functions
function getVideoQuality(itag) {
    const qualities = {
        '37': '1080p',
        '137': '1080p',
        '22': '720p',
        '18': '360p',
        '59': '480p',
        '43': '360p',
        // thêm các itag khác nếu cần
    };
    return qualities[itag] || 'unknown';
}

function getQualityRank(quality) {
    const ranks = {
        '1080p': 5,
        '720p': 4,
        '480p': 3,
        '360p': 2,
        'unknown': 1
    };
    return ranks[quality] || 0;
}

// Thêm hàm tải trực tiếp
async function downloadDirectly(driveId, filename, accessToken) {
    const url = `https://www.googleapis.com/drive/v3/files/${driveId}?alt=media`;
    const outputPath = path.join(VIDEO_OUTPUT_DIR, filename);
    
    console.log(`📥 Đang tải video vào: ${outputPath}`);
    
    const response = await axios({
        method: 'get',
        url: url,
        headers: {
            'Authorization': `Bearer ${accessToken}`
        },
        responseType: 'stream'
    });

    const writer = fs.createWriteStream(outputPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
        writer.on('finish', () => {
            console.log('✅ Tải video thành công');
            resolve(outputPath);
        });
        writer.on('error', reject);
    });
}

=======
>>>>>>> b3f67cd8dc95596ddeb683492a271c14469f3b34
// Thay đổi đường dẫn TEMP_DIR và OUTPUT_DIR
const TEMP_DIR = path.join(__dirname, 'temp');

// Thêm function logging
function log(message, error = false) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    if (error) {
        console.error('\n❌', logMessage);
        // Ghi log ra file nếu là lỗi
        fs.appendFileSync('error.log', logMessage + '\n');
    } else {
        console.log(logMessage);
    }
}

// Sửa lại setupTempFolders với logging chi tiết
async function setupTempFolders() {
    try {
        log('Bắt đầu tạo thư mục...');
        log(`TEMP_DIR: ${TEMP_DIR}`);
        log(`OUTPUT_DIR: ${OUTPUT_DIR}`);
<<<<<<< HEAD
        log(`VIDEO_OUTPUT_DIR: ${VIDEO_OUTPUT_DIR}`);

        // Tạo các thư mục nếu chưa tồn tại
        [TEMP_DIR, OUTPUT_DIR, VIDEO_OUTPUT_DIR].forEach(dir => {
=======

        [TEMP_DIR, OUTPUT_DIR].forEach(dir => {
>>>>>>> b3f67cd8dc95596ddeb683492a271c14469f3b34
            if (!fs.existsSync(dir)) {
                log(`Tạo thư mục: ${dir}`);
                fs.mkdirSync(dir, { recursive: true });
            } else {
                log(`Thư mục đã tồn tại: ${dir}`);
            }
        });

        // Kiểm tra quyền ghi
        const testFile = path.join(TEMP_DIR, 'test.txt');
<<<<<<< HEAD
        try {
            fs.writeFileSync(testFile, 'test');
            fs.unlinkSync(testFile);
            log('✅ Kiểm tra quyền ghi thành công');
        } catch (error) {
            throw new Error(`Không có quyền ghi vào thư mục: ${error.message}`);
        }

        return true;
    } catch (error) {
        log('❌ Lỗi khi setup thư mục:', error.message);
        log('❌ Stack:', error);
=======
        log(`Kiểm tra quyền ghi: ${testFile}`);
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        log('✅ Kiểm tra quyền ghi thành công');

        // Dọn dẹp files cũ
        const files = fs.readdirSync(TEMP_DIR);
        log(`Số files cần dọn dẹp: ${files.length}`);
        files.forEach(file => {
            const filePath = path.join(TEMP_DIR, file);
            log(`Xóa file: ${filePath}`);
            fs.unlinkSync(filePath);
        });

        return true;
    } catch (error) {
        log(`Lỗi khi setup thư mục: ${error.message}`, true);
        log(`Stack: ${error.stack}`, true);
>>>>>>> b3f67cd8dc95596ddeb683492a271c14469f3b34
        return false;
    }
}

// Thêm cleanup function
async function cleanupTempFolders() {
    try {
        // Dọn dẹp sau khi hoàn thành
        const files = fs.readdirSync(TEMP_DIR);
        files.forEach(file => {
            fs.unlinkSync(path.join(TEMP_DIR, file));
        });
    } catch (err) {
        console.warn('⚠️ Không thể dọn dẹp temp:', err.message);
    }
}

// Cập nhật main flow
async function main(driveId, filename) {
    try {
        log('🎬 Bắt đầu chương trình');
        
        if (!await setupTempFolders()) {
            throw new Error('Không thể tạo thư mục cần thiết');
        }

        // Kiểm tra system resources
        const stats = fs.statfsSync(__dirname);
        const freeSpace = stats.bfree * stats.bsize;
        log(`Dung lượng trống: ${Math.round(freeSpace/1024/1024)}MB`);

        const freemem = os.freemem();
        log(`RAM trống: ${Math.round(freemem/1024/1024)}MB`);

        await getVideoUrl(driveId, filename);
    } catch (error) {
        log(`Lỗi không xử lý được: ${error.message}`, true);
        log(`Stack: ${error.stack}`, true);
    } finally {
        // Cleanup
        try {
            if (browser) {
                await browser.close();
            }
            log('Dọn dẹp thư mục temp...');
            const files = fs.readdirSync(TEMP_DIR);
            files.forEach(file => {
                const filePath = path.join(TEMP_DIR, file);
                log(`Xóa file: ${filePath}`);
                fs.unlinkSync(filePath);
            });
        } catch (err) {
            log(`Không thể dọn dẹp: ${err.message}`, true);
        }
    }
}

// Thêm xử lý lỗi process
process.on('uncaughtException', async (error) => {
    log(`Lỗi không xử lý được: ${error.message}`, true);
    if (browser) await browser.close();
    process.exit(1);
});

process.on('unhandledRejection', async (error) => {
    log(`Promise rejection không xử lý: ${error.message}`, true);
    if (browser) await browser.close();
    process.exit(1);
});

<<<<<<< HEAD
// Sửa lại hàm downloadFromDriveId ể nhận filename
=======
// Sửa lại hàm downloadFromDriveId để nhận filename
>>>>>>> b3f67cd8dc95596ddeb683492a271c14469f3b34
async function downloadFromDriveId(driveId, filename) {
    console.log(`🎬 Bắt đầu tải video: ${filename}`);
    // Đảm bảo filename hợp lệ
    filename = filename.replace(/[/\\?%*:|"<>]/g, '-');
    await main(driveId, filename);
}

async function processVideoFiles(videoFiles, driveAPI) {
<<<<<<< HEAD
    // Chuyển code xử lý video từ api.js sang đy
=======
    // Chuyển code xử lý video từ api.js sang đây
>>>>>>> b3f67cd8dc95596ddeb683492a271c14469f3b34
    const fileMapping = [];
    
    for (const file of videoFiles) {
        console.log(`\n🎬 Bắt đầu tải: ${file.name}`);
        try {
            let originalName = file.name;
            if (!originalName.toLowerCase().endsWith('.mp4')) {
                originalName += '.mp4';
            }
            const safeName = originalName.replace(/[^a-zA-Z0-9-_.]/g, '_');
            
            await downloadFromDriveId(file.id, safeName);
            console.log(`✅ Đã tải xong: ${safeName}`);
            
            fileMapping.push({
                safe: safeName,
                original: originalName
            });
        } catch (error) {
            console.error(`❌ Lỗi khi tải ${file.name}:`, error.message);
            continue;
        }
    }
    
    // Xử lý đổi tên và dọn dẹp
<<<<<<< HEAD
    // ... copy phần code xử lý đổi tên và dn dẹp từ api.js ...
=======
    // ... copy phần code xử lý đổi tên và dọn dẹp từ api.js ...
>>>>>>> b3f67cd8dc95596ddeb683492a271c14469f3b34
}

module.exports = {
    downloadFromDriveId,
    OUTPUT_DIR,
    TEMP_DIR,
<<<<<<< HEAD
    VIDEO_OUTPUT_DIR,
=======
>>>>>>> b3f67cd8dc95596ddeb683492a271c14469f3b34
    processVideoFiles
};
