import React from 'react';
import { FolderOpen, Trash2 } from 'lucide-react';
import { formatClock, formatFullDate } from '../utils/time';

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

type NoteEditorProps = {
  title: string;
  body: string;
  status: SaveStatus;
  lastSavedAt: number | null;
  createdAt: number | null;
  fileName: string;
  titleInputRef: React.RefObject<HTMLInputElement>;
  onTitleChange: (value: string) => void;
  onBodyChange: (value: string) => void;
  onReveal: () => void;
  onDelete: () => void;
};

const NoteEditor: React.FC<NoteEditorProps> = ({
  title,
  body,
  status,
  lastSavedAt,
  createdAt,
  fileName,
  titleInputRef,
  onTitleChange,
  onBodyChange,
  onReveal,
  onDelete,
}) => {
  const savedText = lastSavedAt ? `已保存 ${formatClock(lastSavedAt)}` : '已保存';
  const statusMeta: Record<SaveStatus, { text: string; dot: string }> = {
    idle: { text: savedText, dot: 'bg-emerald-400' },
    dirty: { text: '编辑中…', dot: 'bg-amber-400' },
    saving: { text: '保存中…', dot: 'bg-primary-400 animate-pulse' },
    saved: { text: savedText, dot: 'bg-emerald-400' },
    error: { text: '保存失败', dot: 'bg-red-500' },
  };
  const currentStatus = statusMeta[status];
  const charCount = body.replace(/\s/g, '').length;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-100 px-5">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${currentStatus.dot}`} />
          <span className="truncate text-[11.5px] text-slate-400">{currentStatus.text}</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={onReveal}
            title="在访达中显示"
            aria-label="在访达中显示"
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <FolderOpen size={15} />
          </button>
          <button
            onClick={onDelete}
            title="删除笔记"
            aria-label="删除笔记"
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-[780px] flex-1 flex-col px-10 pb-4 pt-10">
        <input
          ref={titleInputRef}
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          placeholder="无标题笔记"
          spellCheck={false}
          className="w-full shrink-0 border-none bg-transparent text-[30px] font-bold leading-[1.25] tracking-[-0.015em] text-slate-900 outline-none placeholder:text-slate-300"
        />

        <div className="mt-2.5 flex shrink-0 items-center gap-2 text-[11px] text-slate-400">
          {createdAt ? <span>创建于 {formatFullDate(createdAt)}</span> : <span>新笔记</span>}
          {fileName && (
            <>
              <span className="text-slate-200">·</span>
              <span className="truncate">{fileName}</span>
            </>
          )}
        </div>

        <textarea
          value={body}
          onChange={(event) => onBodyChange(event.target.value)}
          placeholder="开始记录…"
          spellCheck={false}
          className="mt-6 min-h-0 w-full flex-1 resize-none border-none bg-transparent pb-2 text-[15px] leading-[1.9] text-slate-700 outline-none placeholder:text-slate-300"
        />

        <footer className="flex shrink-0 items-center justify-between border-t border-slate-100 pt-3 text-[10.5px] text-slate-400">
          <span>{charCount} 字</span>
          <span>自动保存 · ⌘S 立即保存 · ⌘N 新建</span>
        </footer>
      </div>
    </div>
  );
};

export default NoteEditor;
