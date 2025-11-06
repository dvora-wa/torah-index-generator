import { Injectable } from '@nestjs/common';
import { GptService } from 'src/modules/index/gpt.service';
import { PdfService } from '../pdf/pdf.service';
import { IndexType, IndexEntry, GeneratedIndex } from './types';
import * as fs from 'fs';

@Injectable()
export class IndexService {
     constructor(
    private gptService: GptService,
    private pdfService: PdfService,
  ) {}

  async generateIndexFromFile(
    filePath: string,
    indexType: IndexType,
  ): Promise<GeneratedIndex> {
    // Extract PDF content
    const pdfContent = await this.pdfService.extractText(filePath);

    // Generate index using GPT
    const index = await this.gptService.generateIndex(
      pdfContent.text,
      indexType,
    );

    // Clean up uploaded file (as per spec: system doesn't save files)
    this.cleanupFile(filePath);

    return index;
  }

  getPreviewEntries(entries: IndexEntry[], previewCount: number = 5): IndexEntry[] {
    return entries.slice(0, previewCount);
  }

  formatEntryForWord(entry: IndexEntry): string {
    const pageInfo = entry.pageNumbers.length > 0
      ? ` (${entry.pageNumbers.join(', ')})`
      : '';
    const description = entry.description ? `\n${entry.description}` : '';
    return `${entry.term}${pageInfo}${description}`;
  }

  private cleanupFile(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.error(`Failed to cleanup file: ${error.message}`);
    }
  }
}
