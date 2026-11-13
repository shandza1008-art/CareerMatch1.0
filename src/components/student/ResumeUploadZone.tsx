import React, { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  CheckCircle2,
  FileCheck2,
  FileText,
  Lock,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import { getAuthToken } from '../../lib/api';

export interface ResumeUploadResult {
  resumeId: number;
  analysisId: number;
  versionNumber: number;
  filename: string;
  overallScore: number;
  isDuplicate: boolean;
  duplicateOf?: string | null;
  aiProvider: 'gemini' | 'local-nlp';
  fallbackNotice?: string;
}

interface ResumeUploadZoneProps {
  targetRole: string;
  onUploadComplete: (result: ResumeUploadResult) => Promise<void> | void;
}

type WorkflowStage = 'idle' | 'validating' | 'uploading' | 'parsing' | 'complete' | 'error';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const ACCEPTED_EXTENSIONS = ['.pdf', '.docx'];
const ACCEPTED_MIMES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '', // Some OS drag events omit MIME; verified via extension + magic bytes
]);

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function validateFileSecurityClient(file: File): Promise<string | null> {
  const lower = file.name.toLowerCase();
  const extValid = ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
  if (!extValid) {
    return 'Only PDF (.pdf) and Word (.docx) files are permitted.';
  }

  if (!ACCEPTED_MIMES.has(file.type)) {
    return 'Unsupported MIME type detected. Please upload a standard PDF or DOCX document.';
  }

  if (file.size <= 0) {
    return 'Selected file is empty (0 bytes).';
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return `File size (${formatFileSize(file.size)}) exceeds the 10 MB security limit.`;
  }

  // Inspect magic bytes in the browser before transmitting to backend
  const headerBuffer = await file.slice(0, 5).arrayBuffer();
  const bytes = new Uint8Array(headerBuffer);

  if (lower.endsWith('.pdf')) {
    const ascii = String.fromCharCode(...bytes.slice(0, 5));
    if (ascii !== '%PDF-') {
      return 'Invalid PDF signature: file header does not start with %PDF-.';
    }
  } else if (lower.endsWith('.docx')) {
    const isZipHeader = bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05);
    if (!isZipHeader) {
      return 'Invalid DOCX signature: file is not a valid OpenXML Word archive.';
    }
  }

  return null;
}

export function ResumeUploadZone({ targetRole, onUploadComplete }: ResumeUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dragDepthRef = useRef(0);

  const [isDragging, setIsDragging] = useState(false);
  const [stage, setStage] = useState<WorkflowStage>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [resultSummary, setResultSummary] = useState<ResumeUploadResult | null>(null);

  const isBusy = stage === 'validating' || stage === 'uploading' || stage === 'parsing';

  const resetZone = () => {
    setStage('idle');
    setUploadProgress(0);
    setSelectedFile(null);
    setErrorMsg('');
    setResultSummary(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const uploadViaXHR = (file: File): Promise<ResumeUploadResult> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append('file', file);
      if (targetRole.trim()) {
        formData.append('targetRole', targetRole.trim());
      }

      xhr.open('POST', '/api/student/resumes/analyze', true);
      xhr.withCredentials = true;

      const token = getAuthToken();
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const pct = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(pct);
          if (pct >= 100) {
            setStage('parsing');
          }
        }
      };

      xhr.onload = () => {
        let parsed: Record<string, unknown> = {};
        try {
          parsed = xhr.responseText ? JSON.parse(xhr.responseText) : {};
        } catch {
          reject(new Error('Unexpected response received from parsing server.'));
          return;
        }

        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(parsed as unknown as ResumeUploadResult);
        } else {
          reject(new Error(String(parsed.error || `Upload failed with status ${xhr.status}.`)));
        }
      };

      xhr.onerror = () => {
        reject(new Error('Network error while uploading resume. Please retry.'));
      };

      xhr.send(formData);
    });
  };

  const processFile = async (file: File) => {
    if (isBusy) return;
    setErrorMsg('');
    setResultSummary(null);
    setSelectedFile(file);
    setStage('validating');
    setUploadProgress(0);

    try {
      const validationError = await validateFileSecurityClient(file);
      if (validationError) {
        setStage('error');
        setErrorMsg(validationError);
        return;
      }

      setStage('uploading');
      const result = await uploadViaXHR(file);
      setStage('complete');
      setUploadProgress(100);
      setResultSummary(result);
      await onUploadComplete(result);
    } catch (err) {
      setStage('error');
      setErrorMsg(err instanceof Error ? err.message : 'Unable to process resume file.');
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current += 1;
    if (!isBusy) setIsDragging(true);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setIsDragging(false);
    if (isBusy) return;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      if (files.length > 1) {
        setStage('error');
        setErrorMsg('Please drop one resume file at a time in the Student Analyzer.');
        return;
      }
      processFile(files[0]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (isBusy) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      inputRef.current?.click();
    }
  };

  return (
    <div className="space-y-3">
      <motion.div
        role="button"
        tabIndex={isBusy ? -1 : 0}
        aria-label="Upload PDF or DOCX resume by dragging and dropping or pressing Enter to browse"
        aria-disabled={isBusy}
        onClick={() => !isBusy && inputRef.current?.click()}
        onKeyDown={handleKeyDown}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        whileHover={isBusy ? undefined : { y: -2 }}
        animate={{ scale: isDragging ? 1.015 : 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 26 }}
        className={`surface-specular-card relative rounded-2xl border-2 border-dashed p-6 text-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#198F90] ${
          isBusy
            ? 'cursor-wait border-[#1EA8A9] bg-teal-50/40 dark:border-[#20B4B6] dark:bg-teal-950/20'
            : isDragging
            ? 'cursor-copy border-[#20B4B6] bg-teal-50/80 dark:border-[#20B4B6] dark:bg-teal-950/40'
            : 'cursor-pointer border-slate-300 bg-slate-50/60 hover:border-[#1EA8A9] hover:bg-teal-50/30 dark:border-slate-700 dark:bg-slate-950/40 dark:hover:border-[#20B4B6]'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          disabled={isBusy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) processFile(file);
          }}
        />

        <motion.div
          animate={isDragging ? { scale: 1.12, rotate: -4 } : { scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-teal-200/80 bg-white text-[#198F90] shadow-sm dark:border-teal-800/60 dark:bg-slate-900 dark:text-[#20B4B6]"
        >
          <Upload className="h-5 w-5" />
        </motion.div>

        <p className="mt-3 text-sm font-semibold text-slate-950 dark:text-white">
          {isDragging ? 'Release to verify and parse resume' : 'Drag and drop your resume here'}
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          PDF (.pdf) or Word (.docx) · Maximum 10 MB · Magic-byte verified
        </p>

        <div className="mt-4 flex items-center justify-center gap-3">
          <span className="btn-glossy-teal inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-xs font-bold">
            {isBusy ? 'Processing Resume...' : 'Browse PDF / DOCX'}
          </span>
        </div>

        <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
          <Lock className="h-3 w-3 shrink-0 text-[#198F90] dark:text-[#20B4B6]" />
          <span>Authenticated upload · Private to your student account</span>
        </div>
      </motion.div>

      {/* Active Upload / Parsing Progress Pipeline */}
      <AnimatePresence mode="wait">
        {selectedFile && stage !== 'idle' && (
          <motion.div
            key={`${selectedFile.name}-${stage}`}
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 380, damping: 26 }}
            className="surface-specular-card rounded-2xl border border-slate-200 bg-slate-50/90 p-4 text-xs dark:border-slate-800 dark:bg-slate-950/80 space-y-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <FileText className="h-4 w-4 shrink-0 text-[#198F90] dark:text-[#20B4B6]" />
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900 dark:text-white">{selectedFile.name}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {formatFileSize(selectedFile.size)} ·{' '}
                    {selectedFile.name.toLowerCase().endsWith('.pdf') ? 'PDF Document' : 'Word DOCX'}
                  </p>
                </div>
              </div>
              {!isBusy && (
                <button
                  type="button"
                  onClick={resetZone}
                  aria-label="Clear upload status"
                  className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {isBusy && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-medium text-slate-700 dark:text-slate-300">
                  <span>
                    {stage === 'validating' && 'Verifying file signature & security headers...'}
                    {stage === 'uploading' && 'Uploading file securely...'}
                    {stage === 'parsing' && 'Extracting text & running AI skill scoring...'}
                  </span>
                  <span className="font-mono tabular-nums">{uploadProgress}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${stage === 'parsing' ? 100 : uploadProgress}%` }}
                    transition={{ duration: 0.25, ease: 'easeOut' }}
                    className="bar-glossy-teal h-2 rounded-full"
                  />
                </div>
              </div>
            )}

            {stage === 'error' && errorMsg && (
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{errorMsg}</span>
              </motion.div>
            )}

            {stage === 'complete' && resultSummary && (
              <motion.div
                initial={{ opacity: 0, scale: 0.94, y: 6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 24 }}
                className="space-y-1.5 rounded-xl border border-teal-200 bg-teal-50/70 p-3.5 text-teal-950 dark:border-teal-800/60 dark:bg-teal-950/30 dark:text-teal-100"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 font-semibold">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-[#198F90] dark:text-[#20B4B6]" />
                    Parsed &amp; Scored (v{resultSummary.versionNumber})
                  </span>
                  <span className="font-mono font-bold tabular-nums text-[#198F90] dark:text-[#20B4B6]">
                    {resultSummary.overallScore} / 100
                  </span>
                </div>
                <p className="flex items-center gap-1.5 text-[11px] text-teal-900 dark:text-teal-200">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[#198F90] dark:text-[#20B4B6]" />
                  <span>
                    Engine: {resultSummary.aiProvider === 'gemini' ? 'Gemini 4 Hydrogen' : 'Local NLP Engine'}
                    {resultSummary.isDuplicate ? ` · Duplicate content matched "${resultSummary.duplicateOf}"` : ''}
                  </span>
                </p>
                {resultSummary.fallbackNotice && (
                  <p className="flex items-start gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                    <FileCheck2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{resultSummary.fallbackNotice}</span>
                  </p>
                )}
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
