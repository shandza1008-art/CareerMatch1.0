import crypto from 'crypto';
import path from 'path';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

export interface ParsedResumeFile {
  rawText: string;
  contentHash: string;
  fileType: string;
  fileSize: number;
  originalFilename: string;
}

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.docx', '.txt']);
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

export function sanitizeFilename(filename: string): string {
  const base = path.basename(filename || 'resume');
  return base.replace(/[^\w.\- ()]/g, '_').slice(0, 120);
}

export function verifyMagicBytes(buffer: Buffer, filename: string, mimetype: string): string | null {
  const lower = filename.toLowerCase();
  const isPdf = lower.endsWith('.pdf') || mimetype === 'application/pdf';
  const isDocx =
    lower.endsWith('.docx') ||
    mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  if (isPdf) {
    if (buffer.length < 5 || buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
      return 'Security check failed: File header does not match a valid PDF signature (%PDF-).';
    }
  } else if (isDocx) {
    // DOCX is an OpenXML ZIP archive starting with PK\x03\x04 (or empty zip PK\x05\x06)
    if (
      buffer.length < 4 ||
      buffer[0] !== 0x50 ||
      buffer[1] !== 0x4b ||
      (buffer[2] !== 0x03 && buffer[2] !== 0x05)
    ) {
      return 'Security check failed: File header does not match a valid DOCX archive signature.';
    }
  }
  return null;
}

export function validateResumeFile(filename: string, mimetype: string, size: number): string | null {
  const lower = filename.toLowerCase();
  const hasAllowedExt = Array.from(ALLOWED_EXTENSIONS).some((ext) => lower.endsWith(ext));
  const allowedMimes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'application/octet-stream',
  ];

  if (!hasAllowedExt || (!allowedMimes.includes(mimetype) && mimetype !== '')) {
    return 'Unsupported file format. Please upload a valid PDF (.pdf) or Word (.docx) resume.';
  }
  if (size <= 0) {
    return 'Uploaded file is empty.';
  }
  if (size > MAX_FILE_BYTES) {
    return 'File exceeds the 10 MB size limit.';
  }
  return null;
}

export async function extractTextFromFile(
  buffer: Buffer,
  originalFilename: string,
  mimetype: string
): Promise<ParsedResumeFile> {
  const safeFilename = sanitizeFilename(originalFilename);
  const magicErr = verifyMagicBytes(buffer, safeFilename, mimetype);
  if (magicErr) {
    throw new Error(magicErr);
  }

  const lower = safeFilename.toLowerCase();
  let rawText = '';

  if (lower.endsWith('.pdf') || mimetype === 'application/pdf') {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      rawText = (result?.text || '').trim();
    } finally {
      await parser.destroy();
    }
  } else if (
    lower.endsWith('.docx') ||
    mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const result = await mammoth.extractRawText({ buffer });
    rawText = (result?.value || '').trim();
  } else {
    rawText = buffer.toString('utf-8').trim();
  }

  // Normalize whitespace while preserving line breaks for section detection
  const cleaned = rawText
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!cleaned || cleaned.length < 20) {
    throw new Error(
      'Could not extract readable text from this file. If this is a scanned image PDF, please export a text-selectable PDF or DOCX.'
    );
  }

  const normalizedForHash = cleaned.toLowerCase().replace(/\s+/g, ' ');
  const contentHash = crypto.createHash('sha256').update(normalizedForHash).digest('hex');

  return {
    rawText: cleaned,
    contentHash,
    fileType:
      mimetype ||
      (lower.endsWith('.pdf')
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
    fileSize: buffer.length,
    originalFilename: safeFilename,
  };
}
