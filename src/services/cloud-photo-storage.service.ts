import { PrismaClient } from '@prisma/client';
// import AWS from 'aws-sdk'; // Commented out - install with: npm install aws-sdk @types/aws-sdk
import crypto from 'crypto';

const prisma = new PrismaClient();

// Configure AWS S3 (or use Azure Blob Storage, Google Cloud Storage)
// Uncomment when AWS SDK is installed: npm install aws-sdk @types/aws-sdk
/*
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1'
});
*/

export interface PhotoData {
  filename: string;
  dataUrl: string;
  size: number;
  timestamp: string;
}

export interface StoredPhoto {
  id: number;
  filename: string;
  url: string;
  thumbnailUrl?: string;
  size: number;
  mimeType: string;
}

// This service is for future cloud storage implementation
// Currently photos are handled locally with metadata only
export class CloudPhotoStorageService {
  private static readonly BUCKET_NAME = process.env.AWS_S3_BUCKET || 'kardex-photos';
  private static readonly CDN_URL = process.env.CDN_URL; // Optional CloudFront URL
  
  /**
   * BEST PRACTICE: Store photos in cloud storage + metadata in database
   */
  static async storePhotos(
    photos: PhotoData[],
    ticketId: number,
    userId: number,
    context: 'ticket' | 'activity' = 'ticket'
  ): Promise<StoredPhoto[]> {
    const storedPhotos: StoredPhoto[] = [];
    
    for (const photo of photos) {
      try {
        // Extract base64 data and mime type
        const matches = photo.dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches) {
          throw new Error('Invalid data URL format');
        }
        
        const mimeType = matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, 'base64');
        
        // Generate unique S3 key
        const hash = crypto.createHash('md5').update(buffer).digest('hex');
        const extension = mimeType.split('/')[1] || 'jpg';
        const s3Key = `${context}/${ticketId}/${hash}_${Date.now()}.${extension}`;
        
        // Upload to S3
        const uploadResult = await s3.upload({
          Bucket: this.BUCKET_NAME,
          Key: s3Key,
          Body: buffer,
          ContentType: mimeType,
          Metadata: {
            ticketId: ticketId.toString(),
            userId: userId.toString(),
            originalFilename: photo.filename,
            capturedAt: photo.timestamp
          }
        }).promise();
        
        // Generate thumbnail (optional)
        const thumbnailUrl = await this.generateThumbnail(s3Key, buffer, mimeType);
        
        // Store metadata in database
        const attachment = await prisma.attachment.create({
          data: {
            filename: photo.filename,
            path: uploadResult.Location, // S3 URL
            mimeType,
            size: photo.size,
            ticketId,
            uploadedById: userId,
          }
        });
        
        storedPhotos.push({
          id: attachment.id,
          filename: attachment.filename,
          url: this.getCDNUrl(uploadResult.Location),
          thumbnailUrl,
          size: attachment.size,
          mimeType: attachment.mimeType,
        });
        
      } catch (error) {
        console.error(`Failed to store photo ${photo.filename}:`, error);
      }
    }
    
    return storedPhotos;
  }
  
  /**
   * Generate thumbnail for faster loading
   */
  private static async generateThumbnail(
    originalKey: string, 
    buffer: Buffer, 
    mimeType: string
  ): Promise<string | undefined> {
    try {
      // Use Sharp library for image resizing
      const sharp = require('sharp');
      const thumbnailBuffer = await sharp(buffer)
        .resize(200, 200, { fit: 'cover' })
        .jpeg({ quality: 80 })
        .toBuffer();
      
      const thumbnailKey = originalKey.replace(/\.[^.]+$/, '_thumb.jpg');
      
      const uploadResult = await s3.upload({
        Bucket: this.BUCKET_NAME,
        Key: thumbnailKey,
        Body: thumbnailBuffer,
        ContentType: 'image/jpeg'
      }).promise();
      
      return this.getCDNUrl(uploadResult.Location);
      
    } catch (error) {
      console.warn('Failed to generate thumbnail:', error);
      return undefined;
    }
  }
  
  /**
   * Get CDN URL if available, otherwise S3 URL
   */
  private static getCDNUrl(s3Url: string): string {
    if (this.CDN_URL) {
      const key = s3Url.split('/').slice(3).join('/');
      return `${this.CDN_URL}/${key}`;
    }
    return s3Url;
  }
  
  /**
   * Delete photo from S3 and database
   */
  static async deletePhoto(attachmentId: number): Promise<boolean> {
    try {
      const attachment = await prisma.attachment.findUnique({
        where: { id: attachmentId }
      });
      
      if (!attachment) return false;
      
      // Extract S3 key from URL
      const s3Key = attachment.path.split('/').slice(3).join('/');
      
      // Delete from S3
      await s3.deleteObject({
        Bucket: this.BUCKET_NAME,
        Key: s3Key
      }).promise();
      
      // Delete thumbnail if exists
      const thumbnailKey = s3Key.replace(/\.[^.]+$/, '_thumb.jpg');
      try {
        await s3.deleteObject({
          Bucket: this.BUCKET_NAME,
          Key: thumbnailKey
        }).promise();
      } catch (error) {
        // Thumbnail might not exist
      }
      
      // Delete from database
      await prisma.attachment.delete({
        where: { id: attachmentId }
      });
      
      return true;
      
    } catch (error) {
      console.error(`Failed to delete photo ${attachmentId}:`, error);
      return false;
    }
  }
  
  /**
   * Get signed URL for secure access (optional)
   */
  static async getSignedUrl(attachmentId: number, expiresIn: number = 3600): Promise<string | null> {
    try {
      const attachment = await prisma.attachment.findUnique({
        where: { id: attachmentId }
      });
      
      if (!attachment) return null;
      
      const s3Key = attachment.path.split('/').slice(3).join('/');
      
      return s3.getSignedUrl('getObject', {
        Bucket: this.BUCKET_NAME,
        Key: s3Key,
        Expires: expiresIn
      });
      
    } catch (error) {
      console.error(`Failed to generate signed URL for ${attachmentId}:`, error);
      return null;
    }
  }
}
