 const DriveAPI = require("./api");

 async function getFolderIdFromUrl(url) {
   // Xử lý các định dạng URL Google Drive phổ biến
   const patterns = [
     /\/folders\/([a-zA-Z0-9-_]+)/, // Format: /folders/folderID
     /id=([a-zA-Z0-9-_]+)/, // Format: id=folderID
     /([a-zA-Z0-9-_]{33})/, // Format: direct folderID
   ];

   for (const pattern of patterns) {
     const match = url.match(pattern);
     if (match) return match[1];
   }
   throw new Error("❌ Không tìm thấy folder ID từ URL");
 }

 async function listFolderContents(url) {
   try {
     // Khởi tạo Drive API
     const driveAPI = new DriveAPI();
     await driveAPI.initialize();

     // Lấy folder ID từ URL
     const folderId = await getFolderIdFromUrl(url);
     console.log("📂 Folder ID:", folderId);

     // Lấy danh sách files và folders
     const contents = await driveAPI.getFolderContents(folderId);

     // Hiển thị kết quả
     console.log("\n📑 Danh sách nội dung:");
     contents.forEach((item) => {
       const icon =
         item.mimeType === "application/vnd.google-apps.folder" ? "📁" : "📄";
       console.log(`${icon} ${item.name}`);
     });

     return contents;
   } catch (error) {
     console.error("❌ Lỗi:", error.message);
     throw error;
   }
 }

 // Ví dụ sử dụng
 async function main() {
   const folderUrl =
     process.argv[2] || "https://drive.google.com/drive/folders/your_folder_id";

   if (!folderUrl) {
     console.log("❌ Vui lòng cung cấp URL folder Google Drive");
     process.exit(1);
   }

   try {
     await listFolderContents(folderUrl);
   } catch (error) {
     console.error("❌ Lỗi:", error.message);
     process.exit(1);
   }
 }

 // Chạy chương trình nếu được gọi trực tiếp
 if (require.main === module) {
   main();
 }

 module.exports = { listFolderContents, getFolderIdFromUrl };