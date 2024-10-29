const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Import các module cần thiết
const { downloadFromDriveId, OUTPUT_DIR, TEMP_DIR, VIDEO_OUTPUT_DIR } = require('./app.js');
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

    async getFolderContentsRecursive(folderId, depth = 0) {
        try {
            console.log(`${'  '.repeat(depth)}📂 Đang quét thư mục: ${folderId}`);
            let allFiles = [];
            let pageToken = null;

            do {
                const response = await this.drive.files.list({
                    q: `'${folderId}' in parents and trashed = false`,
                    spaces: 'drive',
                    fields: 'nextPageToken, files(id, name, mimeType)',
                    pageToken: pageToken,
                    supportsAllDrives: true,
                    includeItemsFromAllDrives: true
                });

                for (const file of response.data.files) {
                    if (file.mimeType === 'application/vnd.google-apps.folder') {
                        // Nếu là folder, quét đệ quy
                        console.log(`${'  '.repeat(depth)}📁 Tìm thấy thư mục con: ${file.name}`);
                        const subFiles = await this.getFolderContentsRecursive(file.id, depth + 1);
                        allFiles = allFiles.concat(subFiles);
                    } else {
                        // Nếu là file, thêm vào danh sách
                        allFiles.push({
                            ...file,
                            folderDepth: depth,
                            folderPath: await this.getFolderPath(folderId)
                        });
                    }
                }

                pageToken = response.data.nextPageToken;
            } while (pageToken);

            return allFiles;
        } catch (error) {
            console.error(`${'  '.repeat(depth)}❌ Lỗi khi quét thư mục ${folderId}:`, error.message);
            throw error;
        }
    }

    async getFolderPath(folderId) {
        try {
            const path = [];
            let currentId = folderId;

            while (currentId) {
                const folder = await this.drive.files.get({
                    fileId: currentId,
                    fields: 'name, parents',
                    supportsAllDrives: true
                });

                path.unshift(folder.data.name);
                currentId = folder.data.parents ? folder.data.parents[0] : null;
            }

            return path.join('/');
        } catch (error) {
            console.error('❌ Lỗi khi lấy đường dẫn thư mục:', error.message);
            return '';
        }
    }

    async processFolderRecursive(folderId, depth = 0) {
        try {
            const folderInfo = await this.drive.files.get({
                fileId: folderId,
                fields: 'name',
                supportsAllDrives: true
            });
            
            console.log(`\n${'  '.repeat(depth)}📂 Đang quét thư mục: ${folderInfo.data.name}`);
            let pageToken = null;

            do {
                const response = await this.drive.files.list({
                    q: `'${folderId}' in parents and trashed = false`,
                    spaces: 'drive',
                    fields: 'nextPageToken, files(id, name, mimeType)',
                    pageToken: pageToken,
                    supportsAllDrives: true,
                    includeItemsFromAllDrives: true
                });

                // Phân loại files trong thư mục hiện tại
                const currentFiles = response.data.files;
                const folders = currentFiles.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
                const files = currentFiles.filter(f => f.mimeType !== 'application/vnd.google-apps.folder');

                if (files.length > 0) {
                    console.log(`${'  '.repeat(depth)}📄 Tìm thấy ${files.length} file trong thư mục ${folderInfo.data.name}`);
                    
                    // Xử lý files trong thư mục hiện tại
                    const pdfFiles = files.filter(f => f.mimeType === 'application/pdf');
                    const videoFiles = files.filter(f => 
                        f.mimeType.includes('video/') || 
                        f.mimeType.includes('application/vnd.google-apps.video')
                    );
                    const otherFiles = files.filter(f => 
                        !f.mimeType.includes('video/') && 
                        f.mimeType !== 'application/pdf'
                    );

                    // Lấy đường dẫn thư mục hiện tại
                    const currentPath = await this.getFolderPath(folderId);

                    // Xử lý PDF files
                    if (pdfFiles.length > 0) {
                        console.log(`${'  '.repeat(depth)}📑 Đang tải ${pdfFiles.length} file PDF...`);
                        const pdfProcessor = new PDFProcessor(this);
                        for (const file of pdfFiles) {
                            try {
                                console.log(`${'  '.repeat(depth)}📄 Tải: ${file.name}`);
                                await pdfProcessor.processFiles([{
                                    ...file,
                                    folderPath: currentPath
                                }]);
                            } catch (error) {
                                console.error(`❌ Lỗi khi tải PDF ${file.name}:`, error.message);
                            }
                        }
                    }

                    // Xử lý Video files
                    if (videoFiles.length > 0) {
                        console.log(`${'  '.repeat(depth)}🎥 Đang tải ${videoFiles.length} file video...`);
                        for (const file of videoFiles) {
                            try {
                                console.log(`${'  '.repeat(depth)}🎬 Tải: ${file.name}`);
                                let fileName = file.name;
                                if (!fileName.toLowerCase().endsWith('.mp4')) {
                                    fileName += '.mp4';
                                }
                                await downloadFromDriveId(file.id, path.join(currentPath, fileName));
                            } catch (error) {
                                console.error(`❌ Lỗi khi tải video ${file.name}:`, error.message);
                            }
                        }
                    }

                    // Xử lý Other files
                    if (otherFiles.length > 0) {
                        console.log(`${'  '.repeat(depth)}📄 Đang tải ${otherFiles.length} file khác...`);
                        for (const file of otherFiles) {
                            try {
                                const localPath = path.join(OUTPUT_DIR, 'others', currentPath);
                                if (!fs.existsSync(localPath)) {
                                    fs.mkdirSync(localPath, { recursive: true });
                                }
                                
                                console.log(`${'  '.repeat(depth)}📄 Tải: ${file.name}`);
                                await this.drive.files.get(
                                    { fileId: file.id, alt: 'media' },
                                    { responseType: 'stream' }
                                ).then(response => {
                                    return new Promise((resolve, reject) => {
                                        const dest = fs.createWriteStream(path.join(localPath, file.name));
                                        response.data
                                            .on('end', () => resolve())
                                            .on('error', err => reject(err))
                                            .pipe(dest);
                                    });
                                });
                            } catch (error) {
                                console.error(`❌ Lỗi khi tải file ${file.name}:`, error.message);
                            }
                        }
                    }
                }

                // Đệ quy vào các thư mục con
                for (const folder of folders) {
                    await this.processFolderRecursive(folder.id, depth + 1);
                }

                pageToken = response.data.nextPageToken;
            } while (pageToken);

        } catch (error) {
            console.error(`${'  '.repeat(depth)}❌ Lỗi khi xử lý thư mục:`, error.message);
        }
    }

    async createRootFolder() {
        try {
            console.log('\n📂 Tạo folder gốc "video-drive-clone"...');
            
            // Kiểm tra xem folder đã tồn tại chưa
            const response = await this.drive.files.list({
                q: "name='video-drive-clone' and mimeType='application/vnd.google-apps.folder' and trashed=false",
                fields: 'files(id, name)',
                spaces: 'drive'
            });

            if (response.data.files.length > 0) {
                console.log('✅ Folder đã tồn tại, sử dụng folder cũ');
                return response.data.files[0].id;
            }

            // Tạo folder mới nếu chưa tồn tại
            const folderMetadata = {
                name: 'video-drive-clone',
                mimeType: 'application/vnd.google-apps.folder'
            };

            const folder = await this.drive.files.create({
                resource: folderMetadata,
                fields: 'id'
            });

            console.log('✅ Đã tạo folder gốc mới');
            return folder.data.id;
        } catch (error) {
            console.error('❌ Lỗi khi tạo folder gốc:', error.message);
            throw error;
        }
    }

    async checkFileExists(fileName, parentId) {
        try {
            const response = await this.drive.files.list({
                q: `name='${fileName}' and '${parentId}' in parents and trashed=false`,
                fields: 'files(id, name)',
                spaces: 'drive'
            });
            return response.data.files.length > 0 ? response.data.files[0] : null;
        } catch (error) {
            console.error(`❌ Lỗi khi kiểm tra file ${fileName}:`, error.message);
            return null;
        }
    }

    async checkFolderExists(folderName, parentId) {
        try {
            const query = parentId 
                ? `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
                : `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;

            const response = await this.drive.files.list({
                q: query,
                fields: 'files(id, name)',
                spaces: 'drive'
            });
            return response.data.files.length > 0 ? response.data.files[0] : null;
        } catch (error) {
            console.error(`❌ Lỗi khi kiểm tra folder ${folderName}:`, error.message);
            return null;
        }
    }

    async downloadAndUploadFolder(sourceFolderId, parentId = null, depth = 0) {
        try {
            const sourceFolder = await this.drive.files.get({
                fileId: sourceFolderId,
                fields: 'name',
                supportsAllDrives: true
            });

            console.log(`\n${'  '.repeat(depth)}📂 Đang xử lý thư mục: ${sourceFolder.data.name}`);

            // Kiểm tra folder đã tồn tại chưa
            let targetFolder = await this.checkFolderExists(sourceFolder.data.name, parentId);
            let targetFolderId;
            
            if (targetFolder) {
                console.log(`${'  '.repeat(depth)}📁 Folder đã tồn tại: ${sourceFolder.data.name}`);
                targetFolderId = targetFolder.id; // Lấy ID trực tiếp từ kết quả checkFolderExists
            } else {
                // Tạo folder mới nếu chưa tồn tại
                const folderMetadata = {
                    name: sourceFolder.data.name,
                    mimeType: 'application/vnd.google-apps.folder',
                    parents: parentId ? [parentId] : null
                };

                const newFolder = await this.drive.files.create({
                    resource: folderMetadata,
                    fields: 'id'
                });
                targetFolderId = newFolder.data.id;
                console.log(`${'  '.repeat(depth)}✅ Đã tạo thư mục mới: ${sourceFolder.data.name}`);
            }

            // Xử lý các files trong folder
            let pageToken = null;
            do {
                const response = await this.drive.files.list({
                    q: `'${sourceFolderId}' in parents and trashed = false`,
                    spaces: 'drive',
                    fields: 'nextPageToken, files(id, name, mimeType)',
                    pageToken: pageToken,
                    supportsAllDrives: true,
                    includeItemsFromAllDrives: true
                });

                for (const item of response.data.files) {
                    if (item.mimeType === 'application/vnd.google-apps.folder') {
                        // Nếu là folder, đệ quy với targetFolderId
                        await this.downloadAndUploadFolder(item.id, targetFolderId, depth + 1);
                    } else {
                        try {
                            // Kiểm tra file đã tồn tại
                            const existingFile = await this.checkFileExists(item.name, targetFolderId);
                            const videoPath = path.join(VIDEO_OUTPUT_DIR, item.name);
                            const tempFilePath = path.join(TEMP_DIR, `temp_${Date.now()}_${item.name}`);
                            
                            if (existingFile) {
                                console.log(`${'  '.repeat(depth)}📄 File đã tồn tại: ${item.name}`);
                                // Kiểm tra và xóa file local nếu tồn tại
                                if (fs.existsSync(videoPath)) {
                                    try {
                                        fs.unlinkSync(videoPath);
                                        console.log(`${'  '.repeat(depth)}🗑️ Đã xóa file video local: ${item.name}`);
                                    } catch (err) {
                                        console.warn(`${'  '.repeat(depth)}⚠️ Không thể xóa file video local: ${item.name}`, err.message);
                                    }
                                }
                                // Kiểm tra và xóa file tạm nếu tồn tại
                                const tempFiles = fs.readdirSync(TEMP_DIR);
                                for (const tempFile of tempFiles) {
                                    if (tempFile.includes(item.name)) {
                                        try {
                                            fs.unlinkSync(path.join(TEMP_DIR, tempFile));
                                            console.log(`${'  '.repeat(depth)}🗑️ Đã xóa file tạm: ${tempFile}`);
                                        } catch (err) {
                                            console.warn(`${'  '.repeat(depth)}⚠️ Không thể xóa file tạm: ${tempFile}`, err.message);
                                        }
                                    }
                                }
                                continue;
                            }

                            if (item.mimeType.includes('video/')) {
                                // Tạo session ID duy nhất cho mỗi video
                                const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                                const sessionDir = path.join(TEMP_DIR, sessionId);
                                const videoPath = path.join(VIDEO_OUTPUT_DIR, item.name);
                                
                                try {
                                    console.log(`${'  '.repeat(depth)}📥 Đang tải video: ${item.name}`);
                                    
                                    // Download video
                                    await downloadFromDriveId(item.id, item.name);
                                    console.log(`${'  '.repeat(depth)}✅ Đã tải xong video: ${item.name}`);

                                    // Kiểm tra file tồn tại trước khi upload
                                    if (!fs.existsSync(videoPath)) {
                                        throw new Error(`Không tìm thấy file video: ${item.name}`);
                                    }

                                    // Upload video
                                    console.log(`${'  '.repeat(depth)}📤 Đang upload video: ${item.name}`);
                                    const fileMetadata = {
                                        name: item.name,
                                        parents: [targetFolderId]
                                    };

                                    const media = {
                                        mimeType: item.mimeType,
                                        body: fs.createReadStream(videoPath)
                                    };

                                    // Upload và đợi cho đến khi hoàn thành
                                    await this.drive.files.create({
                                        resource: fileMetadata,
                                        media: media,
                                        fields: 'id'
                                    });

                                    console.log(`${'  '.repeat(depth)}✅ Upload thành công: ${item.name}`);

                                    // Chỉ xóa file sau khi upload thành công
                                    if (fs.existsSync(videoPath)) {
                                        // Đợi một chút để đảm bảo stream đã đóng
                                        await new Promise(resolve => setTimeout(resolve, 1000));
                                        fs.unlinkSync(videoPath);
                                        console.log(`${'  '.repeat(depth)}🗑️ Đã xóa file video: ${item.name}`);
                                    }

                                    // Dọn dẹp các file tạm liên quan
                                    const tempFiles = fs.readdirSync(TEMP_DIR);
                                    for (const tempFile of tempFiles) {
                                        if (tempFile.includes(sessionId)) {
                                            const tempPath = path.join(TEMP_DIR, tempFile);
                                            try {
                                                fs.unlinkSync(tempPath);
                                                console.log(`${'  '.repeat(depth)}🗑️ Đã xóa file tạm: ${tempFile}`);
                                            } catch (err) {
                                                console.warn(`${'  '.repeat(depth)}⚠️ Không thể xóa file tạm: ${tempFile}`);
                                            }
                                        }
                                    }

                                } catch (error) {
                                    console.error(`${'  '.repeat(depth)}❌ Lỗi xử lý video: ${error.message}`);
                                    // Dọn dẹp nếu có lỗi
                                    try {
                                        if (fs.existsSync(videoPath)) {
                                            fs.unlinkSync(videoPath);
                                            console.log(`${'  '.repeat(depth)}🗑️ Đã xóa file video sau lỗi: ${item.name}`);
                                        }
                                    } catch (cleanupError) {
                                        console.warn(`${'  '.repeat(depth)}⚠️ Không thể xóa file sau lỗi: ${cleanupError.message}`);
                                    }
                                }
                            } else {
                                // Xử lý các file không phải video
                                const tempFilePath = path.join(TEMP_DIR, `temp_${Date.now()}_${item.name}`);
                                
                                try {
                                    console.log(`${'  '.repeat(depth)}📥 Đang tải: ${item.name}`);
                                    await this.drive.files.get(
                                        { fileId: item.id, alt: 'media' },
                                        { responseType: 'stream' }
                                    ).then(response => {
                                        return new Promise((resolve, reject) => {
                                            const dest = fs.createWriteStream(tempFilePath);
                                            response.data
                                                .on('end', () => resolve())
                                                .on('error', err => reject(err))
                                                .pipe(dest);
                                        });
                                    });

                                    // Upload file
                                    console.log(`${'  '.repeat(depth)}📤 Đang upload: ${item.name}`);
                                    const fileMetadata = {
                                        name: item.name,
                                        parents: [targetFolderId]
                                    };

                                    const media = {
                                        mimeType: item.mimeType,
                                        body: fs.createReadStream(tempFilePath)
                                    };

                                    // Upload và đợi hoàn thành
                                    await this.drive.files.create({
                                        resource: fileMetadata,
                                        media: media,
                                        fields: 'id'
                                    });

                                    console.log(`${'  '.repeat(depth)}✅ Upload thành công: ${item.name}`);

                                    // Chỉ xóa sau khi upload thành công
                                    if (fs.existsSync(tempFilePath)) {
                                        await new Promise(resolve => setTimeout(resolve, 1000));
                                        fs.unlinkSync(tempFilePath);
                                        console.log(`${'  '.repeat(depth)}🗑️ Đã xóa file tạm: ${item.name}`);
                                    }

                                } catch (error) {
                                    console.error(`${'  '.repeat(depth)}❌ Lỗi xử lý file: ${error.message}`);
                                    // Dọn dẹp nếu có lỗi
                                    try {
                                        if (fs.existsSync(tempFilePath)) {
                                            fs.unlinkSync(tempFilePath);
                                        }
                                    } catch (cleanupError) {
                                        console.warn(`${'  '.repeat(depth)}⚠️ Không thể xóa file tạm: ${cleanupError.message}`);
                                    }
                                }
                            }
                        } catch (error) {
                            console.error(`${'  '.repeat(depth)}❌ Lỗi: ${error.message}`);
                            // Dọn dẹp nếu có lỗi
                            try {
                                const videoPath = path.join(VIDEO_OUTPUT_DIR, item.name);
                                if (fs.existsSync(videoPath)) {
                                    fs.unlinkSync(videoPath);
                                    console.log(`${'  '.repeat(depth)}🗑️ Đã xóa file sau lỗi: ${item.name}`);
                                }
                                // Dọn dẹp files tạm liên quan
                                const tempFiles = fs.readdirSync(TEMP_DIR);
                                for (const tempFile of tempFiles) {
                                    if (tempFile.includes(item.name)) {
                                        fs.unlinkSync(path.join(TEMP_DIR, tempFile));
                                        console.log(`${'  '.repeat(depth)}🗑️ Đã xóa file tạm sau lỗi: ${tempFile}`);
                                    }
                                }
                            } catch (cleanupError) {
                                console.warn(`${'  '.repeat(depth)}⚠️ Không thể dọn dẹp sau lỗi: ${cleanupError.message}`);
                            }
                        }
                    }
                }

                pageToken = response.data.nextPageToken;
            } while (pageToken);

        } catch (error) {
            console.error(`${'  '.repeat(depth)}❌ Lỗi:`, error.message);
        }
    }
}

async function cloneFolderToDrive() {
    try {
        const driveAPI = new DriveAPI();
        await driveAPI.initialize();

        // Tạo folder gốc "video-drive-clone"
        const rootFolderId = await driveAPI.createRootFolder();
        console.log(`📁 Folder gốc ID: ${rootFolderId}`);

        // ID folder nguồn cần copy
        const sourceFolderId = "1NI3zYATy7_Ff4yndVpxS98LgHpWcr6Gv";
        
        console.log('\n🚀 Bắt đầu sao chép vào folder "video-drive-clone"...');
        await driveAPI.downloadAndUploadFolder(sourceFolderId, rootFolderId);
        console.log('\n✅ Hoàn thành sao chép!');
        
        console.log('\n📂 Bạn có thể tìm thấy tất cả files trong folder "video-drive-clone" trên Drive của bạn');
    } catch (error) {
        console.error('❌ Lỗi:', error.message);
    }
}

// Chạy chương trình
cloneFolderToDrive();