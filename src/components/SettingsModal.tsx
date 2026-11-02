import React from 'react';
import { FolderOpen, Loader2, RotateCcw, X } from 'lucide-react';
import { SettingsInfo } from '../services/notes';

type SettingsModalProps = {
  isOpen: boolean;
  settings: SettingsInfo | null;
  busy: boolean;
  onClose: () => void;
  onChooseDir: () => void;
  onResetDir: () => void;
  onOpenDir: () => void;
};

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  settings,
  busy,
  onClose,
  onChooseDir,
  onResetDir,
  onOpenDir,
}) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-[2px]"
      onMouseDown={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="w-full max-w-[520px] overflow-hidden rounded-2xl bg-white shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-[15px] font-semibold text-slate-800">设置</h2>
          <button
            onClick={onClose}
            disabled={busy}
            aria-label="关闭"
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5">
          <h3 className="text-[13px] font-semibold text-slate-700">笔记保存目录</h3>
          <p className="mt-1 text-[12px] leading-5 text-slate-500">
            所有笔记都会以 Markdown 文件的形式保存在这个目录，可随时用其他编辑器打开。
          </p>

          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
            <div className="flex items-start gap-2.5">
              <FolderOpen size={15} className="mt-0.5 shrink-0 text-slate-400" />
              <p className="min-w-0 break-all font-mono text-[11.5px] leading-5 text-slate-600">
                {settings?.notesDir || '加载中…'}
              </p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={onChooseDir}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary-500 px-3 py-1.5 text-[12px] font-medium text-white shadow-sm transition-colors hover:bg-primary-600 disabled:opacity-60"
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <FolderOpen size={13} />}
              选择文件夹…
            </button>

            <button
              onClick={onOpenDir}
              disabled={busy}
              className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-60"
            >
              在访达中打开
            </button>

            {settings?.isCustom && (
              <button
                onClick={onResetDir}
                disabled={busy}
                className="ml-auto inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11.5px] text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-60"
              >
                <RotateCcw size={12} />
                恢复默认
              </button>
            )}
          </div>

          <p className="mt-2.5 text-[11px] leading-5 text-slate-400">
            第一行会自动作为标题，文件名也会跟随标题变化。修改目录后，新目录中的
            .md 文件会自动出现在左侧列表。
          </p>

          <div className="mt-5 border-t border-slate-100 pt-4">
            <h3 className="text-[12px] font-semibold text-slate-700">快捷键</h3>
            <div className="mt-2 grid grid-cols-2 gap-y-1.5 text-[11.5px] text-slate-500">
              <span>打开主窗口（全局）</span>
              <span className="text-right font-mono text-slate-400">⌘ ⇧ Space</span>
              <span>新建笔记</span>
              <span className="text-right font-mono text-slate-400">⌘ N</span>
              <span>立即保存</span>
              <span className="text-right font-mono text-slate-400">⌘ S</span>
              <span>搜索笔记</span>
              <span className="text-right font-mono text-slate-400">⌘ F</span>
              <span>退出应用</span>
              <span className="text-right font-mono text-slate-400">⌘ Q</span>
            </div>
            <p className="mt-2 text-[11px] leading-5 text-slate-400">
              即使窗口隐藏在菜单栏，按 ⌘ ⇧ Space 也能直接打开主窗口。
            </p>
          </div>
        </div>

        <div className="flex justify-end border-t border-slate-100 bg-slate-50/70 px-5 py-3">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-lg bg-white px-3.5 py-1.5 text-[12.5px] font-medium text-slate-600 shadow-sm ring-1 ring-slate-200 transition-colors hover:bg-slate-50 disabled:opacity-60"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
