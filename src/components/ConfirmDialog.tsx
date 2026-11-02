import React from 'react';

type ConfirmDialogProps = {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmText = '确认',
  cancelText = '取消',
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-[2px]"
      onMouseDown={onCancel}
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="px-6 pt-5 pb-4">
          <h2 className="text-[15px] font-semibold text-slate-800">{title}</h2>
          <p className="mt-2 text-[13px] leading-6 text-slate-500">{message}</p>
        </div>

        <div className="flex justify-end gap-2 bg-slate-50/80 px-5 py-3">
          <button
            onClick={onCancel}
            className="rounded-lg px-3.5 py-1.5 text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-100"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg bg-red-500 px-3.5 py-1.5 text-[13px] font-medium text-white shadow-sm transition-colors hover:bg-red-600"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
