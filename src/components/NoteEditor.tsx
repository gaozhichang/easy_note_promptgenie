import React, { useEffect, useRef, useState } from 'react';
import {
  Bold,
  Code,
  FolderOpen,
  Heading1,
  Heading2,
  ImagePlus,
  Italic,
  Link,
  List,
  ListOrdered,
  Loader2,
  Quote,
  Strikethrough,
  Trash2,
} from 'lucide-react';
import { chooseImageFile, insertNoteImage } from '../services/notes';
import { formatClock, formatFullDate } from '../utils/time';

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

type NoteEditorProps = {
  title: string;
  body: string;
  status: SaveStatus;
  lastSavedAt: number | null;
  createdAt: number | null;
  fileName: string;
  notePath: string;
  titleInputRef: React.RefObject<HTMLInputElement>;
  onTitleChange: (value: string) => void;
  onBodyChange: (value: string) => void;
  onReveal: () => void;
  onDelete: () => void;
  onError: (message: string) => void;
};

type ToolButtonProps = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
};

const ToolButton: React.FC<ToolButtonProps> = ({ label, onClick, disabled, children }) => (
  <button
    type="button"
    title={label}
    aria-label={label}
    onMouseDown={(event) => event.preventDefault()}
    onClick={onClick}
    disabled={disabled}
    className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
  >
    {children}
  </button>
);

const NoteEditor: React.FC<NoteEditorProps> = ({
  title,
  body,
  status,
  lastSavedAt,
  createdAt,
  fileName,
  notePath,
  titleInputRef,
  onTitleChange,
  onBodyChange,
  onReveal,
  onDelete,
  onError,
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

  const bodyInputRef = useRef<HTMLTextAreaElement>(null);
  const notePathRef = useRef(notePath);
  const pendingSelectionRef = useRef<[number, number] | null>(null);
  const [imageBusy, setImageBusy] = useState(false);

  useEffect(() => {
    notePathRef.current = notePath;
  }, [notePath]);

  // 工具栏改写正文后，等 React 更新完再恢复光标/选区。
  useEffect(() => {
    const pending = pendingSelectionRef.current;
    if (!pending) return;
    pendingSelectionRef.current = null;

    const textarea = bodyInputRef.current;
    if (!textarea) return;
    textarea.focus();
    textarea.setSelectionRange(pending[0], pending[1]);
  }, [body]);

  const getSelection = () => {
    const textarea = bodyInputRef.current;
    if (!textarea) {
      return { start: body.length, end: body.length };
    }
    return { start: textarea.selectionStart, end: textarea.selectionEnd };
  };

  const applyBody = (next: string, start: number, end: number) => {
    pendingSelectionRef.current = [start, end];
    onBodyChange(next);
  };

  const wrapSelection = (before: string, after: string, placeholder: string) => {
    const { start, end } = getSelection();
    const selected = body.slice(start, end) || placeholder;
    const next = `${body.slice(0, start)}${before}${selected}${after}${body.slice(end)}`;
    applyBody(next, start + before.length, start + before.length + selected.length);
  };

  const prefixLines = (prefix: string, ordered = false) => {
    const { start, end } = getSelection();
    const cursorOnly = start === end;
    const lineStart = start === 0 ? 0 : body.lastIndexOf('\n', start - 1) + 1;
    const nextBreak = body.indexOf('\n', end);
    const lineEnd = nextBreak === -1 ? body.length : nextBreak;
    const lines = body.slice(lineStart, lineEnd).split('\n');

    const formatted = lines.map((line, index) => {
      const cleaned = line.replace(/^\s*(?:#{1,6}\s+|[-*+]\s+|\d+\.\s+|>\s+)/, '');
      return ordered ? `${index + 1}. ${cleaned}` : `${prefix}${cleaned}`;
    });
    const block = formatted.join('\n');
    const next = `${body.slice(0, lineStart)}${block}${body.slice(lineEnd)}`;
    const blockEnd = lineStart + block.length;
    applyBody(next, cursorOnly ? blockEnd : lineStart, blockEnd);
  };

  const insertBlock = (text: string) => {
    const { start, end } = getSelection();
    const before = body.slice(0, start);
    const after = body.slice(end);
    const leading = before && !before.endsWith('\n') ? '\n' : '';
    const trailing = after && !after.startsWith('\n') ? '\n' : '';
    const insertion = `${leading}${text}${trailing}`;
    const next = `${before}${insertion}${after}`;
    const cursor = before.length + insertion.length;
    applyBody(next, cursor, cursor);
  };

  const insertLink = () => {
    const { start, end } = getSelection();
    const selected = body.slice(start, end) || '链接文字';
    const url = 'https://';
    const next = `${body.slice(0, start)}[${selected}](${url})${body.slice(end)}`;
    const urlStart = start + selected.length + 3;
    applyBody(next, urlStart, urlStart + url.length);
  };

  const handleInsertImage = async () => {
    if (!notePath || imageBusy) return;

    const targetPath = notePath;
    setImageBusy(true);
    try {
      const source = await chooseImageFile();
      if (!source) return;

      const relativePath = await insertNoteImage(targetPath, source);
      if (notePathRef.current !== targetPath) {
        return;
      }

      const alt =
        (source.split(/[/\\]/).pop() || '图片')
          .replace(/\.[^.]+$/, '')
          .replace(/[\[\]]/g, '')
          .trim() || '图片';
      insertBlock(`![${alt}](${relativePath})`);
    } catch (error) {
      onError(`插入图片失败：${String(error)}`);
    } finally {
      setImageBusy(false);
    }
  };

  const handleBodyKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(event.metaKey || event.ctrlKey)) return;

    const key = event.key.toLowerCase();
    if (key === 'b') {
      event.preventDefault();
      wrapSelection('**', '**', '加粗文字');
    } else if (key === 'i') {
      event.preventDefault();
      wrapSelection('*', '*', '斜体文字');
    } else if (key === 'k') {
      event.preventDefault();
      insertLink();
    }
  };

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

        <div className="mt-5 flex shrink-0 flex-wrap items-center gap-0.5 border-y border-slate-100 py-1">
          <span className="mr-1 px-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-300">
            Markdown
          </span>

          <ToolButton label="一级标题" onClick={() => prefixLines('# ')}>
            <Heading1 size={15} />
          </ToolButton>
          <ToolButton label="二级标题" onClick={() => prefixLines('## ')}>
            <Heading2 size={15} />
          </ToolButton>

          <span className="mx-1 h-4 w-px bg-slate-100" />

          <ToolButton label="加粗 (⌘B)" onClick={() => wrapSelection('**', '**', '加粗文字')}>
            <Bold size={15} />
          </ToolButton>
          <ToolButton label="斜体 (⌘I)" onClick={() => wrapSelection('*', '*', '斜体文字')}>
            <Italic size={15} />
          </ToolButton>
          <ToolButton
            label="删除线"
            onClick={() => wrapSelection('~~', '~~', '删除线文字')}
          >
            <Strikethrough size={15} />
          </ToolButton>

          <span className="mx-1 h-4 w-px bg-slate-100" />

          <ToolButton label="无序列表" onClick={() => prefixLines('- ')}>
            <List size={15} />
          </ToolButton>
          <ToolButton label="有序列表" onClick={() => prefixLines('', true)}>
            <ListOrdered size={15} />
          </ToolButton>
          <ToolButton label="引用" onClick={() => prefixLines('> ')}>
            <Quote size={15} />
          </ToolButton>
          <ToolButton label="行内代码" onClick={() => wrapSelection('`', '`', '代码')}>
            <Code size={15} />
          </ToolButton>

          <span className="mx-1 h-4 w-px bg-slate-100" />

          <ToolButton label="链接 (⌘K)" onClick={insertLink}>
            <Link size={15} />
          </ToolButton>
          <ToolButton
            label={imageBusy ? '正在插入图片…' : '插入图片'}
            onClick={() => void handleInsertImage()}
            disabled={imageBusy || !notePath}
          >
            {imageBusy ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
          </ToolButton>
        </div>

        <textarea
          ref={bodyInputRef}
          value={body}
          onChange={(event) => onBodyChange(event.target.value)}
          onKeyDown={handleBodyKeyDown}
          placeholder="开始记录… 支持 Markdown 语法"
          spellCheck={false}
          className="mt-3 min-h-0 w-full flex-1 resize-none border-none bg-transparent pb-2 text-[15px] leading-[1.9] text-slate-700 outline-none placeholder:text-slate-300"
        />

        <footer className="flex shrink-0 items-center justify-between border-t border-slate-100 pt-3 text-[10.5px] text-slate-400">
          <span>{charCount} 字 · Markdown</span>
          <span>自动保存 · ⌘S 立即保存 · ⌘N 新建</span>
        </footer>
      </div>
    </div>
  );
};

export default NoteEditor;
