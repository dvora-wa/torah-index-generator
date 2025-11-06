import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IndexType, IndexEntry, GeneratedIndex } from './types';

@Injectable()
export class GptService {
  private openaiApiKey: string;
  private apiEndpoint = 'https://api.openai.com/v1/chat/completions';

  constructor(private configService: ConfigService) {
    this.openaiApiKey = this.configService.get<string>('OPENAI_API_KEY')!;
    if (!this.openaiApiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }
  }

  async generateIndex(
    pdfContent: string,
    indexType: IndexType,
  ): Promise<GeneratedIndex> {
    const prompt = this.buildPrompt(pdfContent, indexType);

    try {
      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.openaiApiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4-turbo',
          messages: [
            {
              role: 'system',
              content: this.getSystemPrompt(indexType),
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.7,
          max_tokens: 4000,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`);
      }

      const data = await response.json();
      const content = data.choices[0].message.content;

      // Parse the response and extract entries
      const entries = this.parseGptResponse(content, indexType);

      // Sort entries alphabetically
      entries.sort((a, b) => a.term.localeCompare(b.term, 'he-IL'));

      return {
        type: indexType,
        entries,
        generatedAt: new Date(),
      };
    } catch (error) {
      throw new Error(`Failed to generate index: ${error.message}`);
    }
  }

  private buildPrompt(pdfContent: string, indexType: IndexType): string {
    const contentPreview = pdfContent.substring(0, 8000); // Limit context

    const prompts: Record<IndexType, string> = {
      [IndexType.SOURCES]: `Please analyze the following Torah book text and create a comprehensive index of sources (Tanach references, Talmudic sources, etc.). 
      
      Format the response as a JSON array with objects containing: term (the source), pageNumbers (array of page numbers where it appears), and description (brief context).
      
      Text: ${contentPreview}`,

      [IndexType.TOPICS]: `Please analyze the following Torah book text and create a comprehensive topical index.
      
      Format the response as a JSON array with objects containing: term (the topic), pageNumbers (array of page numbers), and description (brief context).
      
      Text: ${contentPreview}`,

      [IndexType.PERSONS]: `Please analyze the following Torah book text and create an index of persons mentioned (biblical figures, rabbis, authors, etc.).
      
      Format the response as a JSON array with objects containing: term (the person's name), pageNumbers (array of page numbers), and description (brief context/role).
      
      Text: ${contentPreview}`,
    };

    return prompts[indexType];
  }

  private getSystemPrompt(indexType: IndexType): string {
    const prompts: Record<IndexType, string> = {
      [IndexType.SOURCES]: 'You are an expert in Torah and Jewish texts. Create detailed indexes of sources from Torah books.',
      [IndexType.TOPICS]: 'You are an expert in Torah and Jewish texts. Create organized topical indexes from Torah books.',
      [IndexType.PERSONS]: 'You are an expert in Torah and Jewish texts. Create accurate indexes of persons mentioned in Torah books.',
    };

    return prompts[indexType];
  }

  private parseGptResponse(content: string, _indexType: IndexType): IndexEntry[] {
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return this.parseTextResponse(content);
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return Array.isArray(parsed)
        ? parsed.map(item => ({
            term: item.term || item.name || '',
            pageNumbers: Array.isArray(item.pageNumbers) ? item.pageNumbers : [],
            description: item.description || item.context || '',
          }))
        : [];
    } catch (error) {
      // Fallback to text parsing if JSON parsing fails
      return this.parseTextResponse(content);
    }
  }

  private parseTextResponse(content: string): IndexEntry[] {
    // Fallback parser for non-JSON responses
    const lines = content.split('\n').filter(line => line.trim().length > 0);
    const entries: IndexEntry[] = [];

    for (const line of lines) {
      const match = line.match(/^[\d.]*\s*(.+?)\s*(?:\(.*?(\d+).*?\))?$/);
      if (match) {
        entries.push({
          term: match[1].trim(),
          pageNumbers: match[2] ? [parseInt(match[2], 10)] : [],
          description: '',
        });
      }
    }

    return entries;
  }
}

