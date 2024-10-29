const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
// Import app.js và OUTPUT_DIR
const { downloadFromDriveId, OUTPUT_DIR, TEMP_DIR } = require('./app.js');

// Cấu hình credentials
const TOKEN_PATH = path.join(__dirname, 'token.json');
const SCOPES = [
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/drive.file'
];

class DriveAPI {
    constructor() {
        this.drive = null;
        this.auth = null;
    }

    async initialize() {
        try {
            console.log('🔑 Khởi tạo Drive API...');
            const credentials = {
                "client_id": "58168105452-b1ftgklngm45smv9vj417t155t33tpih.apps.googleusercontent.com",
                "project_id": "annular-strata-438914-c0",
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
                "client_secret": "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",
                "redirect_uris": ["http://localhost:3000/api/auth/google-callback"]
            };
            
            this.auth = new google.auth.OAuth2(
                credentials.client_id,
                credentials.client_secret,
                credentials.redirect_uris[0]
            );

            // Kiểm tra token đã lưu
            if (fs.existsSync(TOKEN_PATH)) {
                const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
                this.auth.setCredentials(token);
            } else {
                await this.getNewToken();
            }

            this.drive = google.drive({ version: 'v3', auth: this.auth });
            console.log('✅ Khởi tạo Drive API thành công');
        } catch (error) {
            console.error('❌ Lỗi khởi tạo Drive API:', error.message);
            throw error;
        }
    }

    async getNewToken() {
        const authUrl = this.auth.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES,
        });

        console.log('📱 Truy cập URL này để xác thực:', authUrl);
        const code = await this.promptForCode();
        
        const { tokens } = await this.auth.getToken(code);
        this.auth.setCredentials(tokens);
        
        // Lưu token
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
        console.log('💾 Token đã được lưu tại:', TOKEN_PATH);
    }

    promptForCode() {
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        return new Promise((resolve) => {
            rl.question('📝 Nhập mã xác thực: ', (input) => {
                rl.close();
                // Tách mã xác thực từ URL
                const urlParams = new URLSearchParams(input.split('?')[1]);
                const code = urlParams.get('code');
                resolve(code);
            });
        });
    }

    async getFolderContents(folderId) {
        try {
            console.log(`🔍 Đang quét thư mục ${folderId}...`);
            const files = [];
            let pageToken = null;

            do {
                const response = await this.drive.files.list({
                    q: `'${folderId}' in parents`,
                    spaces: 'drive',
                    fields: 'nextPageToken, files(id, name)',
                    pageToken: pageToken,
                    supportsAllDrives: true,
                    includeItemsFromAllDrives: true,
                });

                files.push(...response.data.files);
                pageToken = response.data.nextPageToken;
            } while (pageToken);

            return files;
        } catch (error) {
            console.error('❌ Lỗi khi lấy nội dung thư mục:', error.message);
            throw error;
        }
    }

    async testConnection() {
        try {
            if (!this.drive) {
                throw new Error('Drive API chưa được khởi tạo');
            }

            // Thử lấy thông tin về Drive của user
            const response = await this.drive.about.get({
                fields: 'user'
            });

            console.log('✅ Kết nối Drive API thành công');
            console.log('👤 User:', response.data.user.displayName);
            return true;
        } catch (error) {
            console.error('❌ Lỗi kết nối Drive API:', error.message);
            return false;
        }
    }
}

// Thêm đoạn code test ở cuối file
async function testDriveAPI() {
    try {
        const driveAPI = new DriveAPI();
        await driveAPI.initialize();
        const testResult = await driveAPI.testConnection();
        
        if (testResult) {
            console.log('🎉 Test hoàn tất: Kết nối thành công');
        } else {
            console.log('❌ Test thất bại: Không thể kết nối');
        }
    } catch (error) {
        console.error('❌ Lỗi trong quá trình test:', error.message);
    }
}

// Chạy test
testDriveAPI();

async function listFolderContents() {
    try {
        const driveAPI = new DriveAPI();
        await driveAPI.initialize();
        const files = await driveAPI.getFolderContents(
          "1gtnc7ot9bix4J8qlx2KQjFGJRqEisLfN"
        );
        console.log('📂 Nội dung thư mục:', files);
        
        // Lọc các file video
        const videoFiles = files.filter(file => {
            const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.wmv'];
            return videoExtensions.some(ext => 
                file.name.toLowerCase().endsWith(ext) || 
                (!file.name.includes('.')) // File không có đuôi (có thể là video)
            );
        });
        
        console.log(`\n🎥 Tìm thấy ${videoFiles.length} file video`);
        
        // Lưu trữ thông tin file gốc và file tạm
        const fileMapping = [];
        
        // Tải tuần tự từng file video
        for (const file of videoFiles) {
            console.log(`\n🎬 Bắt đầu tải: ${file.name}`);
            try {
                // Đảm bảo tên file có đuôi .mp4
                let originalName = file.name;
                if (!originalName.toLowerCase().endsWith('.mp4')) {
                    originalName += '.mp4';
                }
                // Tạo tên file an toàn cho quá trình xử lý
                const safeName = originalName.replace(/[^a-zA-Z0-9-_.]/g, '_');
                
                await downloadFromDriveId(file.id, safeName);
                console.log(`✅ Đã tải xong: ${safeName}`);
                
                // Lưu mapping giữa tên an toàn và tên gốc
                fileMapping.push({
                    safe: safeName,
                    original: originalName
                });
            } catch (error) {
                console.error(`❌ Lỗi khi tải ${file.name}:`, error.message);
                continue;
            }
        }
        
        console.log('\n✅ Đã tải xong tất cả các file video!');
        
        // Đổi tên các file về tên gốc
        console.log('\n🔄 Đang đổi tên các file về tên gốc...');
        for (const map of fileMapping) {
            const oldPath = path.join(OUTPUT_DIR, map.safe);
            const newPath = path.join(OUTPUT_DIR, map.original);
            try {
                if (fs.existsSync(oldPath)) {
                    fs.renameSync(oldPath, newPath);
                    console.log(`✅ Đã đổi tên: ${map.safe} -> ${map.original}`);
                } else {
                    console.log(`⚠️ Không tìm thấy file: ${map.safe}`);
                }
            } catch (error) {
                console.error(`❌ Lỗi khi đổi tên ${map.safe}:`, error.message);
            }
        }
        
        // Xóa dữ liệu stream sau khi hoàn thành
        try {
            const tempFiles = fs.readdirSync(TEMP_DIR);
            for (const file of tempFiles) {
                if (file.includes('temp_') || file.includes('stream_')) {
                    fs.unlinkSync(path.join(TEMP_DIR, file));
                }
            }
            console.log('🧹 Đã xóa dữ liệu stream tạm thời');
        } catch (error) {
            console.error('⚠️ Lỗi khi xóa dữ liệu stream:', error.message);
        }
        
        console.log('\n🎉 Hoàn thành tất cả!');
    } catch (error) {
        console.error('❌ Lỗi:', error.message);
    }
}

// Gọi hàm để bắt đầu quá trình
listFolderContents();