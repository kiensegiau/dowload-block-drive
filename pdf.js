const fs = require('fs');
const path = require('path');
const axios = require('axios');

const OUTPUT_DIR = path.join(process.cwd(), 'downloads', 'pdf');
const LOG_FILE = path.join(process.cwd(), 'downloads', 'failed_files.txt');

class PDFProcessor {
    constructor(driveAPI) {
        this.driveAPI = driveAPI;
        this.outputDir = OUTPUT_DIR;
        
        // Tạo thư mục output nếu chưa có
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
            console.log(`📁 Đã tạo thư mục: ${this.outputDir}`);
        }
    }

    async processFiles(pdfFiles) {
        console.log(`\n📑 Bắt đầu xử lý ${pdfFiles.length} file PDF`);
        console.log(`📂 Thư mục lưu file: ${this.outputDir}`);
        
        const failedFiles = [];

        for (const file of pdfFiles) {
            try {
                // Kiểm tra quyền tải xuống
                const fileInfo = await this.driveAPI.drive.files.get({
                    fileId: file.id,
                    fields: 'capabilities',
                    supportsAllDrives: true
                });

                if (fileInfo.data.capabilities.canDownload) {
                    console.log(`\n📥 File có thể tải: ${file.name}`);
                    await this.downloadNormalPDF(file.id, file.name);
                } else {
                    console.log(`\n🔒 File bị khóa: ${file.name}`);
                    failedFiles.push({
                        name: file.name,
                        reason: 'File bị khóa tải xuống'
                    });
                }
            } catch (error) {
                console.error(`❌ Lỗi khi xử lý ${file.name}:`, error.message);
                failedFiles.push({
                    name: file.name,
                    reason: error.message
                });
            }
        }

        // Ghi log các file lỗi
        if (failedFiles.length > 0) {
            const logContent = failedFiles.map(file => 
                `${new Date().toISOString()}\nTên file: ${file.name}\nLý do: ${file.reason}\n-------------------`
            ).join('\n');
            
            fs.appendFileSync(LOG_FILE, logContent + '\n');
            console.log(`\n⚠️ Có ${failedFiles.length} file lỗi. Chi tiết trong: ${LOG_FILE}`);
        }

        console.log('\n✅ Đã xử lý xong tất cả file!');
        return {
            total: pdfFiles.length,
            success: pdfFiles.length - failedFiles.length,
            failed: failedFiles.length
        };
    }

    async downloadNormalPDF(fileId, fileName) {
        try {
            console.log(`📥 Đang tải: ${fileName}`);
            const dest = fs.createWriteStream(path.join(this.outputDir, fileName));
            
            const response = await this.driveAPI.drive.files.get(
                { fileId: fileId, alt: 'media' },
                { responseType: 'stream' }
            );

            return new Promise((resolve, reject) => {
                let progress = 0;
                response.data
                    .on('data', chunk => {
                        progress += chunk.length;
                        process.stdout.write(`\r    Tiến độ: ${(progress/1024/1024).toFixed(2)} MB`);
                    })
                    .on('end', () => {
                        console.log(`\n    ✅ Đã tải xong: ${fileName}`);
                        resolve();
                    })
                    .on('error', err => reject(err))
                    .pipe(dest);
            });
        } catch (error) {
            console.error(`❌ Lỗi khi tải ${fileName}:`, error.message);
            throw error;
        }
    }
}

module.exports = { PDFProcessor }; 