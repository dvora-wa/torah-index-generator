import {
  Controller,
  Post,
  Body,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import { IndexService } from './index.service';
import { IndexType, IndexResponseDto } from './types';


@Controller('api/index')
export class IndexController {
constructor(private indexService: IndexService) {}

  @Post('generate')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          const timestamp = Date.now();
          const filename = `${timestamp}-${file.originalname}`;
          cb(null, filename);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (file.mimetype !== 'application/pdf') {
          cb(new BadRequestException('Only PDF files are allowed'), false);
        } else {
          cb(null, true);
        }
      },
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    }),
  )
  @HttpCode(HttpStatus.OK)
  async generateIndex(
    @UploadedFile() file: Express.Multer.File,
    @Body('indexType') indexType: IndexType,
  ): Promise<IndexResponseDto> {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    if (!Object.values(IndexType).includes(indexType)) {
      throw new BadRequestException(
        `Invalid index type. Must be one of: ${Object.values(IndexType).join(', ')}`,
      );
    }

    try {
      // Generate the index
      const generatedIndex = await this.indexService.generateIndexFromFile(
        file.path,
        indexType,
      );

      // Get preview entries (first 5)
      const previewEntries = this.indexService.getPreviewEntries(
        generatedIndex.entries,
        5,
      );

      return {
        success: true,
        data: generatedIndex,
        message: `${indexType} index generated successfully`,
        previewEntries,
      };
    } catch (error) {
      throw new BadRequestException(
        `Failed to generate index: ${error.message}`,
      );
    }
  }

  @Post('export-word')
  @HttpCode(HttpStatus.OK)
  async exportToWord(@Body() body: { entries: any[]; indexType: string }): Promise<{ buffer: Buffer }> {
    // This endpoint receives the index data and exports to Word
    // Implementation depends on docx library choice
    try {
      const { Document, Packer, Paragraph, AlignmentType } = require('docx');

      const paragraphs = [
        new Paragraph({
          text: `מפתח ${body.indexType}`,
          bold: true,
          alignment: AlignmentType.RIGHT,
          size: 28,
        }),
        new Paragraph({
          text: '',
        }),
      ];

      for (const entry of body.entries) {
        const pageInfo = entry.pageNumbers.length > 0
          ? ` (${entry.pageNumbers.join(', ')})`
          : '';

        paragraphs.push(
          new Paragraph({
            text: `${entry.term}${pageInfo}`,
            alignment: AlignmentType.RIGHT,
            indent: { left: 400 },
          }),
        );

        if (entry.description) {
          paragraphs.push(
            new Paragraph({
              text: entry.description,
              italics: true,
              alignment: AlignmentType.RIGHT,
              indent: { left: 800 },
              size: 22,
            }),
          );
        }
      }

      const doc = new Document({
        sections: [
          {
            properties: {},
            children: paragraphs,
          },
        ],
      });

      const buffer = await Packer.toBuffer(doc);
      return { buffer };
    } catch (error) {
      throw new BadRequestException(
        `Failed to export to Word: ${error.message}`,
      );
    }
  }


}
