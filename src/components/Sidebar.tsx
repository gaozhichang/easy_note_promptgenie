import React, { useMemo, useState } from 'react';
import {
  ChevronRight,
  FileText,
  Plus,
  RefreshCw,
  Search,
  Settings,
  X,
} from 'lucide-react';
import { Note } from '../services/notes';
import { formatNoteTime } from '../utils/time';

type SidebarProps = {
  notes: Note[];
  totalCount: number;
  selectedPath: string | null;
  isLoading: boolean;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  onCreate: () => void;
  onSelect: (note: Note) => void;
  onOpenSettings: () => void;
  onRefresh: () => void;
  folderName: string;
  notesDir: string;
  searchInputRef: React.RefObject<HTMLInputElement>;
};

type NoteGroupKey = 'week' | 'month' | 'earlier';

type NoteGroup = {
  key: NoteGroupKey;
  label: string;
  notes: Note[];
};

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;

const DEFAULT_EXPANDED_GROUPS: Record<NoteGroupKey, boolean> = {
  week: true,
  month: false,
  earlier: false,
};

const ALL_EXPANDED_GROUPS: Record<NoteGroupKey, boolean> = {
  week: true,
  month: true,
  earlier: true,
};

function groupNotes(notes: Note[]): NoteGroup[] {
  const now = Date.now();
  const sorted = [...notes].sort((a, b) => b.updatedAt - a.updatedAt);
  const age = (note: Note) => now - note.updatedAt;

  const groups: NoteGroup[] = [
    {
      key: 'week',
      label: '最近 7 天',
      notes: sorted.filter((note) => age(note) < WEEK_MS),
    },
    {
      key: 'month',
      label: '最近一个月',
      notes: sorted.filter((note) => age(note) >= WEEK_MS && age(note) < MONTH_MS),
    },
    {
      key: 'earlier',
      label: '更早',
      notes: sorted.filter((note) => age(note) >= MONTH_MS),
    },
  ];

  return groups.filter((group) => group.notes.length > 0);
}

const Sidebar: React.FC<SidebarProps> = ({
  notes,
  totalCount,
  selectedPath,
  isLoading,
  searchTerm,
  onSearchChange,
  onCreate,
  onSelect,
  onOpenSettings,
  onRefresh,
  folderName,
  notesDir,
  searchInputRef,
}) => {
  const [expandedGroups, setExpandedGroups] = useState<Record<NoteGroupKey, boolean>>(
    DEFAULT_EXPANDED_GROUPS
  );
  const [expandedSearchGroups, setExpandedSearchGroups] =
    useState<Record<NoteGroupKey, boolean>>(ALL_EXPANDED_GROUPS);
  const groups = useMemo(() => groupNotes(notes), [notes]);
  const searching = searchTerm.trim().length > 0;

  const toggleGroup = (key: NoteGroupKey) => {
    if (searching) {
      setExpandedSearchGroups((previous) => ({ ...previous, [key]: !previous[key] }));
      return;
    }
    setExpandedGroups((previous) => ({ ...previous, [key]: !previous[key] }));
  };

  return (
    <aside className="flex h-full w-[292px] shrink-0 flex-col border-r border-slate-200/80 bg-[#fbfaf8]">
      <div className="px-4 pb-3 pt-5">
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-500 text-white shadow-sm shadow-primary-500/25">
              <FileText size={15} strokeWidth={2.2} />
            </div>
            <h1 className="truncate text-[15px] font-semibold tracking-tight text-slate-800">
              快捷记事本
            </h1>
          </div>

          <button
            onClick={onCreate}
            title="新建笔记（⌘N）"
            aria-label="新建笔记"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white hover:text-primary-600 hover:shadow-sm"
          >
            <Plus size={18} strokeWidth={2.2} />
          </button>
        </div>

        <div className="relative mt-3">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            ref={searchInputRef}
            value={searchTerm}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="搜索笔记"
            spellCheck={false}
            className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-8 text-[12.5px] text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
          />
          {searchTerm && (
            <button
              onClick={() => onSearchChange('')}
              aria-label="清空搜索"
              className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between px-4 pb-1.5 pt-1">
        <span className="text-[11px] font-medium text-slate-400">
          {searchTerm ? '搜索结果' : '全部笔记'}
        </span>
        <div className="flex items-center gap-1">
          <span className="text-[11px] tabular-nums text-slate-400">
            {searchTerm ? `${notes.length}/${totalCount}` : totalCount}
          </span>
          <button
            onClick={onRefresh}
            title="刷新列表"
            aria-label="刷新列表"
            className="flex h-5 w-5 items-center justify-center rounded text-slate-400 transition-colors hover:bg-white hover:text-slate-600"
          >
            <RefreshCw size={11} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {isLoading ? (
          <div className="space-y-1">
            {[0, 1, 2, 3, 4].map((index) => (
              <div key={index} className="animate-pulse rounded-xl px-3 py-2.5">
                <div className="h-3 w-2/3 rounded bg-slate-200/80" />
                <div className="mt-2 h-2.5 w-full rounded bg-slate-200/60" />
              </div>
            ))}
          </div>
        ) : notes.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-[12.5px] text-slate-400">
              {searchTerm ? '没有找到匹配的笔记' : '还没有笔记'}
            </p>
            {!searchTerm && (
              <button
                onClick={onCreate}
                className="mt-3 text-[12.5px] font-medium text-primary-600 hover:text-primary-700"
              >
                新建第一篇
              </button>
            )}
          </div>
        ) : (
          groups.map((group) => {
            const expanded = searching
              ? expandedSearchGroups[group.key]
              : expandedGroups[group.key];

            return (
              <div key={group.key} className="mb-1">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  aria-expanded={expanded}
                  aria-label={`${group.label}，${group.notes.length} 篇笔记`}
                  className="group flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left transition-colors hover:bg-white/70"
                >
                  <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-slate-500 transition-colors group-hover:text-slate-600">
                    <ChevronRight
                      size={12}
                      className={`shrink-0 transition-transform ${
                        expanded ? 'rotate-90' : ''
                      }`}
                    />
                    <span className="truncate">{group.label}</span>
                  </span>
                  <span className="shrink-0 text-[10px] tabular-nums text-slate-400">
                    {group.notes.length}
                  </span>
                </button>

                {expanded && (
                  <div className="mt-0.5">
                    {group.notes.map((note) => {
                      const active = note.path === selectedPath;
                      return (
                        <button
                          key={note.path}
                          onClick={() => onSelect(note)}
                          className={`group mb-0.5 w-full rounded-xl px-3 py-2.5 text-left transition-colors ${
                            active ? 'bg-primary-50' : 'hover:bg-white'
                          }`}
                        >
                          <div className="flex items-baseline gap-2">
                            <span
                              className={`min-w-0 flex-1 truncate text-[13px] ${
                                active
                                  ? 'font-semibold text-primary-700'
                                  : 'font-medium text-slate-700'
                              }`}
                            >
                              {note.title.trim() || '无标题笔记'}
                            </span>
                            <span
                              className={`shrink-0 text-[10.5px] tabular-nums ${
                                active ? 'text-primary-400' : 'text-slate-400'
                              }`}
                            >
                              {formatNoteTime(note.updatedAt)}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-[11.5px] leading-5 text-slate-400">
                            {note.preview || '空白笔记'}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <button
        onClick={onOpenSettings}
        title={notesDir}
        className="group flex shrink-0 items-center gap-2 border-t border-slate-200/80 px-4 py-3 text-left transition-colors hover:bg-white/70"
      >
        <Settings size={14} className="shrink-0 text-slate-400 group-hover:text-slate-500" />
        <div className="min-w-0 flex-1">
          <div className="text-[10.5px] text-slate-400">保存位置</div>
          <div className="truncate text-[12px] text-slate-600">{folderName || '加载中…'}</div>
        </div>
        <ChevronRight size={13} className="shrink-0 text-slate-300" />
      </button>
    </aside>
  );
};

export default Sidebar;
