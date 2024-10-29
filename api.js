const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Import các module cần thiết
const { downloadFromDriveId, OUTPUT_DIR, TEMP_DIR } = require('./app.js');
const { PDFProcessor } = require('./pdf.js');
const TOKEN_PATH = "token.json";
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
                    q: `'${folderId}' in parents and trashed = false`,
                    spaces: 'drive',
                    fields: 'nextPageToken, files(id, name, mimeType)',
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

async function listFolderContents() {
    try {
        const driveAPI = new DriveAPI();
        await driveAPI.initialize();
        
        // Sử dụng folder ID mới
        const folderId = "1MyQFPc1p-6yQEfxdR8TaoIU8ugVRulr8";
        
        const files = await driveAPI.getFolderContents(folderId);
        
        // Phân loại files
        const pdfFiles = files.filter(file => 
            file.mimeType === 'application/pdf'
        );
        
        const videoFiles = files.filter(file => 
            file.mimeType.includes('video/') || 
            file.mimeType.includes('application/vnd.google-apps.video')
        );

        // Xử lý PDF files
        if (pdfFiles.length > 0) {
            console.log(`\n📑 Tìm thấy ${pdfFiles.length} file PDF - Bắt đầu xử lý...`);
            const pdfProcessor = new PDFProcessor(driveAPI);
            await pdfProcessor.processFiles(pdfFiles);
        }

        // Xử lý Video files
        if (videoFiles.length > 0) {
            console.log(`\n🎥 Tìm thấy ${videoFiles.length} file video - Bắt đầu xử lý...`);
            for (const file of videoFiles) {
                try {
                    console.log(`\n⏳ Đang xử lý video: ${file.name}`);
                    await downloadFromDriveId(file.id, file.name);
                } catch (error) {
                    console.error(`❌ Lỗi khi xử lý video ${file.name}:`, error.message);
                }
            }
        }

        if (pdfFiles.length === 0 && videoFiles.length === 0) {
            console.log('\n⚠️ Không tìm thấy file PDF hoặc video nào trong thư mục.');
        }
        
    } catch (error) {
        console.error('❌ Lỗi:', error.message);
    }
}

// Chạy test và xử lý folder
testDriveAPI();
listFolderContents();