import multer from 'multer';
import path from 'path';
import { Request } from 'express';
import fs from 'fs';

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req: Request, file: Express.Multer.File, cb) => {
    const timestamp = Date.now();
    // Properly decode Japanese characters from the filename
    const decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const extension = path.extname(decodedName);
    const baseName = path.basename(decodedName, extension);
    const fileName = `${timestamp}-${baseName}${extension}`;
    cb(null, fileName);
  }
});

const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  console.log('File filter - fieldname:', file.fieldname, 'originalname:', file.originalname);
  
  if (file.fieldname === 'logo') {
    // Logo files: images only
    const allowedImageTypes = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const fileExtension = path.extname(file.originalname).toLowerCase();
    
    if (allowedImageTypes.includes(fileExtension)) {
      cb(null, true);
    } else {
      cb(new Error('ロゴファイルは画像形式（JPG、PNG、GIF、WEBP）のみアップロード可能です。'));
    }
  } else if (file.fieldname === 'attachment') {
    // Attachment files: documents only
    const allowedTypes = ['.pdf', '.doc', '.docx', '.txt', '.xls', '.xlsx'];
    const fileExtension = path.extname(file.originalname).toLowerCase();
    
    if (allowedTypes.includes(fileExtension)) {
      cb(null, true);
    } else {
      cb(new Error('資料ファイルはPDF、DOC、DOCX、TXT、XLS、XLSXファイルのみアップロード可能です。'));
    }
  } else {
    console.log('Unexpected field name:', file.fieldname);
    cb(new Error(`不正なフィールド名です: ${file.fieldname}`));
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
    fieldSize: 10 * 1024 * 1024, // 10MB for text fields
    fields: 50, // Allow up to 50 fields
    files: 10 // Allow up to 10 files
  }
});

export const deleteFile = (fileName: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const filePath = path.join(uploadsDir, fileName);
    fs.unlink(filePath, (err) => {
      if (err && err.code !== 'ENOENT') {
        reject(err);
      } else {
        resolve();
      }
    });
  });
};

export const getFilePath = (fileName: string): string => {
  return path.join(uploadsDir, fileName);
};