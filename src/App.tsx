import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, FileText, Loader2, Plus, X } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import Sidebar from './components/Sidebar';
import NoteEditor, { SaveStatus } from './components/NoteEditor';
import SettingsModal from './components/SettingsModal';
import ConfirmDialog from './components/ConfirmDialog';
import {
  Note,
  SettingsInfo,
  chooseNotesDir,
  composeNote,
  createNote,
  deleteNote,
  getSettings,
  listNotes,
  openNotesDir,
  resetNotesDir,
  revealNote,
  saveNote,
  setNotesDir,
  splitNote,
} from './services/notes';

function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [createdAt, setCreatedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<SettingsInfo | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const titleRef = useRef('');
  const bodyRef = useRef('');
  const selectedRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const titleInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const applyNote = useCallback(
    (note: Note) => {
      clearTimer();
      const parts = splitNote(note.content);
      selectedRef.current = note.path;
      titleRef.current = parts.title;
      bodyRef.current = parts.body;
      dirtyRef.current = false;
      setSelectedPath(note.path);
      setTitle(parts.title);
      setBody(parts.body);
      setLastSavedAt(note.updatedAt);
      setCreatedAt(note.createdAt);
      setStatus('idle');
    },
    [clearTimer]
  );

  const clearEditor = useCallback(() => {
    clearTimer();
    selectedRef.current = null;
    titleRef.current = '';
    bodyRef.current = '';
    dirtyRef.current = false;
    setSelectedPath(null);
    setTitle('');
    setBody('');
    setLastSavedAt(null);
    setCreatedAt(null);
    setStatus('idle');
  }, [clearTimer]);

  const runSave = useCallback((): Promise<void> => {
    const task = async () => {
      const path = selectedRef.current;
      if (!path || !dirtyRef.current) {
        return;
      }

      const content = composeNote(titleRef.current, bodyRef.current);
      dirtyRef.current = false;
      setStatus('saving');

      try {
        const updated = await saveNote(path, content);

        if (selectedRef.current === path) {
          selectedRef.current = updated.path;
          setSelectedPath(updated.path);
        }

        setNotes((previous) => {
          const rest = previous.filter(
            (note) => note.path !== path && note.path !== updated.path
          );
          return [updated, ...rest].sort((a, b) => b.updatedAt - a.updatedAt);
        });
        setLastSavedAt(updated.updatedAt);
        setStatus(dirtyRef.current ? 'dirty' : 'saved');
      } catch (err) {
        dirtyRef.current = true;
        setStatus('error');
        setError(`保存失败：${String(err)}`);
      }
    };

    saveChainRef.current = saveChainRef.current.then(task, task);
    return saveChainRef.current;
  }, []);

  const scheduleSave = useCallback(() => {
    dirtyRef.current = true;
    setStatus('dirty');
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void runSave();
    }, 500);
  }, [clearTimer, runSave]);

  const handleTitleChange = useCallback(
    (value: string) => {
      titleRef.current = value;
      setTitle(value);
      setNotes((previous) =>
        previous.map((note) =>
          note.path === selectedRef.current ? { ...note, title: value } : note
        )
      );
      scheduleSave();
    },
    [scheduleSave]
  );

  const handleBodyChange = useCallback(
    (value: string) => {
      bodyRef.current = value;
      setBody(value);
      scheduleSave();
    },
    [scheduleSave]
  );

  // 首次加载
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [info, loadedNotes] = await Promise.all([getSettings(), listNotes()]);
        if (cancelled) return;
        setSettings(info);
        setNotes(loadedNotes);
        if (loadedNotes.length > 0) {
          applyNote(loadedNotes[0]);
        }
      } catch (err) {
        if (!cancelled) {
          setError(`加载笔记失败：${String(err)}`);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyNote]);

  const handleSelect = useCallback(
    async (note: Note) => {
      if (note.path === selectedRef.current) {
        return;
      }
      if (dirtyRef.current) {
        await runSave();
      }
      applyNote(note);
    },
    [applyNote, runSave]
  );

  const handleCreate = useCallback(async () => {
    try {
      if (dirtyRef.current) {
        await runSave();
      }
      const note = await createNote();
      setNotes((previous) => [note, ...previous]);
      setSearchTerm('');
      applyNote(note);
      window.setTimeout(() => titleInputRef.current?.focus(), 80);
    } catch (err) {
      setError(`新建笔记失败：${String(err)}`);
    }
  }, [applyNote, runSave]);

  const handleRefresh = useCallback(async () => {
    try {
      if (dirtyRef.current) {
        await runSave();
      }
      await saveChainRef.current;

      const loadedNotes = await listNotes();
      setNotes(loadedNotes);

      const currentPath = selectedRef.current;
      const current = currentPath
        ? loadedNotes.find((note) => note.path === currentPath)
        : undefined;

      if (current) {
        applyNote(current);
      } else if (loadedNotes.length > 0) {
        applyNote(loadedNotes[0]);
      } else {
        clearEditor();
      }
    } catch (err) {
      setError(`刷新失败：${String(err)}`);
    }
  }, [applyNote, clearEditor, runSave]);

  const handleReveal = useCallback(() => {
    if (!selectedRef.current) return;
    revealNote(selectedRef.current).catch((err) => setError(`打开访达失败：${String(err)}`));
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    setIsDeleteOpen(false);
    clearTimer();

    try {
      if (dirtyRef.current) {
        await runSave();
      }
      await saveChainRef.current;

      const path = selectedRef.current;
      if (!path) return;

      await deleteNote(path);

      // 重新从磁盘读取，避免刚保存时文件名已变化导致列表残留旧条目
      const remaining = await listNotes();
      setNotes(remaining);
      if (remaining.length > 0) {
        applyNote(remaining[0]);
      } else {
        clearEditor();
      }
    } catch (err) {
      setError(`删除失败：${String(err)}`);
    }
  }, [applyNote, clearEditor, clearTimer, runSave]);

  const changeDirectory = useCallback(
    async (action: () => Promise<SettingsInfo>) => {
      setSettingsBusy(true);
      try {
        if (dirtyRef.current) {
          await runSave();
        }
        await saveChainRef.current;

        const info = await action();
        setSettings(info);

        const loadedNotes = await listNotes();
        setNotes(loadedNotes);
        setSearchTerm('');
        if (loadedNotes.length > 0) {
          applyNote(loadedNotes[0]);
        } else {
          clearEditor();
        }
        setIsSettingsOpen(false);
      } catch (err) {
        setError(`切换目录失败：${String(err)}`);
      } finally {
        setSettingsBusy(false);
      }
    },
    [applyNote, clearEditor, runSave]
  );

  const handleChooseDir = useCallback(async () => {
    if (!settings) return;
    try {
      const dir = await chooseNotesDir(settings.notesDir);
      if (!dir) return;
      await changeDirectory(() => setNotesDir(dir));
    } catch (err) {
      setError(`选择目录失败：${String(err)}`);
    }
  }, [changeDirectory, settings]);

  const handleResetDir = useCallback(async () => {
    await changeDirectory(() => resetNotesDir());
  }, [changeDirectory]);

  const handleOpenDir = useCallback(() => {
    openNotesDir().catch((err) => setError(`打开目录失败：${String(err)}`));
  }, []);

  // 关闭窗口前保存，然后隐藏窗口（⌘Q 才会退出）
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    (async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const windowHandle = getCurrentWindow();
        const stop = await windowHandle.onCloseRequested(async (event) => {
          event.preventDefault();
          if (dirtyRef.current) {
            await runSave();
          }
          await saveChainRef.current;
          await windowHandle.hide();
        });
        if (disposed) {
          stop();
        } else {
          unlisten = stop;
        }
      } catch (err) {
        console.error('注册关闭事件失败:', err);
      }
    })();

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [runSave]);

  // ⌘Q / 托盘退出：先落盘，再真正退出
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    (async () => {
      try {
        const stop = await listen('quit-requested', async () => {
          try {
            if (dirtyRef.current) {
              await runSave();
            }
            await saveChainRef.current;
          } catch (err) {
            console.error('退出前保存失败:', err);
          }

          try {
            await invoke('quit_app');
          } catch (err) {
            console.error('退出失败:', err);
          }
        });

        if (disposed) {
          stop();
        } else {
          unlisten = stop;
        }
      } catch (err) {
        console.error('注册退出事件失败:', err);
      }
    })();

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [runSave]);

  // 窗口失焦时顺手保存
  useEffect(() => {
    const handleBlur = () => {
      if (dirtyRef.current) {
        void runSave();
      }
    };
    window.addEventListener('blur', handleBlur);
    return () => window.removeEventListener('blur', handleBlur);
  }, [runSave]);

  // 快捷键
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const withMeta = event.metaKey || event.ctrlKey;
      if (!withMeta) return;

      const key = event.key.toLowerCase();
      if (key === 'n') {
        event.preventDefault();
        void handleCreate();
      } else if (key === 's') {
        event.preventDefault();
        clearTimer();
        void runSave();
      } else if (key === 'f') {
        event.preventDefault();
        searchInputRef.current?.focus();
      } else if (key === 'r') {
        event.preventDefault();
        void handleRefresh();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clearTimer, handleCreate, handleRefresh, runSave]);

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(null), 6000);
    return () => window.clearTimeout(timer);
  }, [error]);

  const filteredNotes = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) {
      return notes;
    }
    return notes.filter((note) => {
      return (
        note.title.toLowerCase().includes(term) ||
        note.content.toLowerCase().includes(term)
      );
    });
  }, [notes, searchTerm]);

  const selectedNote = useMemo(
    () => notes.find((note) => note.path === selectedPath) ?? null,
    [notes, selectedPath]
  );

  const folderName = useMemo(() => {
    const dir = settings?.notesDir;
    if (!dir) return '';
    const segments = dir.split(/[/\\]/).filter(Boolean);
    return segments[segments.length - 1] || dir;
  }, [settings]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#f6f5f2] text-slate-800">
      <Sidebar
        notes={filteredNotes}
        totalCount={notes.length}
        selectedPath={selectedPath}
        isLoading={isLoading}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        onCreate={handleCreate}
        onSelect={handleSelect}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onRefresh={handleRefresh}
        folderName={folderName}
        notesDir={settings?.notesDir || ''}
        searchInputRef={searchInputRef}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        {isLoading ? (
          <LoadingState />
        ) : selectedPath ? (
          <NoteEditor
            title={title}
            body={body}
            status={status}
            lastSavedAt={lastSavedAt}
            createdAt={createdAt}
            fileName={selectedNote?.fileName || ''}
            notePath={selectedPath}
            titleInputRef={titleInputRef}
            onTitleChange={handleTitleChange}
            onBodyChange={handleBodyChange}
            onReveal={handleReveal}
            onDelete={() => setIsDeleteOpen(true)}
            onError={(message) => setError(message)}
          />
        ) : (
          <EmptyState onCreate={handleCreate} />
        )}
      </main>

      {error && (
        <div className="fixed bottom-5 left-1/2 z-[60] flex max-w-[90%] -translate-x-1/2 items-start gap-2.5 rounded-xl border border-red-100 bg-white px-4 py-3 shadow-xl shadow-slate-900/5">
          <AlertCircle size={15} className="mt-0.5 shrink-0 text-red-500" />
          <p className="text-[12px] leading-5 text-slate-600">{error}</p>
          <button
            onClick={() => setError(null)}
            aria-label="关闭提示"
            className="ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={12} />
          </button>
        </div>
      )}

      <SettingsModal
        isOpen={isSettingsOpen}
        settings={settings}
        busy={settingsBusy}
        onClose={() => setIsSettingsOpen(false)}
        onChooseDir={handleChooseDir}
        onResetDir={handleResetDir}
        onOpenDir={handleOpenDir}
      />

      <ConfirmDialog
        isOpen={isDeleteOpen}
        title="删除这篇笔记？"
        message={`《${title.trim() || '无标题笔记'}》将从保存目录中永久删除，此操作无法撤销。`}
        confirmText="删除"
        onConfirm={handleConfirmDelete}
        onCancel={() => setIsDeleteOpen(false)}
      />
    </div>
  );
}

const LoadingState = () => (
  <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-white text-slate-400">
    <Loader2 size={20} className="animate-spin text-primary-400" />
    <span className="text-[12px]">正在读取笔记…</span>
  </div>
);

const EmptyState = ({ onCreate }: { onCreate: () => void }) => (
  <div className="flex flex-1 flex-col items-center justify-center bg-white px-6">
    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-500">
      <FileText size={24} strokeWidth={1.8} />
    </div>
    <h2 className="mt-4 text-[15px] font-semibold text-slate-700">选择一篇笔记开始</h2>
    <p className="mt-1.5 text-[12px] text-slate-400">或新建一篇，随手记下此刻的想法</p>
    <button
      onClick={onCreate}
      className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-primary-500 px-3.5 py-2 text-[12.5px] font-medium text-white shadow-sm shadow-primary-500/20 transition-colors hover:bg-primary-600"
    >
      <Plus size={14} />
      新建笔记
      <span className="ml-1 font-mono text-[10px] text-primary-100">⌘N</span>
    </button>
  </div>
);

export default App;
