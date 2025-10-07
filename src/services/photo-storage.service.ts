import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const prisma = new PrismaClient();

export interface PhotoData {
  filename: string;
  dataUrl: string;
  size: number;
  timestamp: string;
}

export interface StoredPhoto {
  id: number;
  filename: string;
  path: string;
  size: number;
  mimeType: string;
}

export class PhotoStorageService {
  private static readonly UPLOAD_DIR = process.env.PHOTO_UPLOAD_DIR || './uploads/photos';
  
  /**
   * Store photos from base64 data URLs to filesystem and database
   */
  static async storePhotos(
    photos: PhotoData[],
    ticketId: number,
    userId: number,
    context: 'ticket' | 'activity' = 'ticket'
  ): Promise<StoredPhoto[]> {
    // Ensure upload directory exists
    await fs.mkdir(this.UPLOAD_DIR, { recursive: true });
    
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
        
        // Generate unique filename
        const hash = crypto.createHash('md5').update(buffer).digest('hex');
        const extension = mimeType.split('/')[1] || 'jpg';
        const uniqueFilename = `${context}_${ticketId}_${hash}_${Date.now()}.${extension}`;
        const filePath = path.join(this.UPLOAD_DIR, uniqueFilename);
        
        // Save file to disk
        await fs.writeFile(filePath, buffer);
        
        // Save to database as attachment
        const attachment = await prisma.attachment.create({
          data: {
            filename: photo.filename,
            path: filePath,
            mimeType,
            size: photo.size,
            ticketId,
            uploadedById: userId,
          }
        });
        
        storedPhotos.push({
          id: attachment.id,
          filename: attachment.filename,
          path: attachment.path,
          size: attachment.size,
          mimeType: attachment.mimeType,
        });
        
      } catch (error) {
        console.error(`Failed to store photo ${photo.filename}:`, error);
        // Continue with other photos
      }
    }
    
    return storedPhotos;
  }
  
  /**
   * Retrieve photo as base64 data URL
   */
  static async getPhotoAsDataUrl(attachmentId: number): Promise<string | null> {
    try {
      const attachment = await prisma.attachment.findUnique({
        where: { id: attachmentId }
      });
      
      if (!attachment) {
        return null;
      }
      
      const buffer = await fs.readFile(attachment.path);
      const base64 = buffer.toString('base64');
      return `data:${attachment.mimeType};base64,${base64}`;
      
    } catch (error) {
      console.error(`Failed to retrieve photo ${attachmentId}:`, error);
      return null;
    }
  }
  
  /**
   * Delete photo from filesystem and database
   */
  static async deletePhoto(attachmentId: number): Promise<boolean> {
    try {
      const attachment = await prisma.attachment.findUnique({
        where: { id: attachmentId }
      });
      
      if (!attachment) {
        return false;
      }
      
      // Delete file from disk
      try {
        await fs.unlink(attachment.path);
      } catch (error) {
        console.warn(`Failed to delete file ${attachment.path}:`, error);
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
   * Get all photos for a ticket
   */
  static async getTicketPhotos(ticketId: number): Promise<StoredPhoto[]> {
    const attachments = await prisma.attachment.findMany({
      where: {
        ticketId,
        mimeType: {
          startsWith: 'image/'
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    return attachments.map(att => ({
      id: att.id,
      filename: att.filename,
      path: att.path,
      size: att.size,
      mimeType: att.mimeType,
    }));
  }
}
