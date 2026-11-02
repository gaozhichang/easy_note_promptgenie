import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { openExternal, readNoteImage } from '../services/notes';

type MarkdownPreviewProps = {
  body: string;
  notePath: string;
  onError: (message: string) => void;
};

type NoteImageProps = {
  src?: string;
  alt?: string;
  notePath: string;
};

const imageCache = new Map<string, Promise<string>>();

function loadNoteImage(notePath: string, src: string): Promise<string> {
  const key = `${notePath}\u0000${src}`;
  const cached = imageCache.get(key);
  if (cached) {
    return cached;
  }

  const pending = readNoteImage(notePath, src);
  imageCache.set(key, pending);
  void pending.catch(() => {
    if (imageCache.get(key) === pending) {
      imageCache.delete(key);
    }
  });
  return pending;
}

const NoteImage: React.FC<NoteImageProps> = ({ src, alt, notePath }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);

    if (!src) {
      setFailed(true);
      return;
    }

    if (/^(?:https?:|data:|blob:|asset:)/i.test(src)) {
      setUrl(src);
      return;
    }

    setUrl(null);
    loadNoteImage(notePath, src)
      .then((resolved) => {
        if (!cancelled) setUrl(resolved);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [notePath, src]);

  if (failed) {
    return (
      <span className="my-3 inline-flex rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[12px] text-slate-400">
        图片加载失败：{alt || src || '未知图片'}
      </span>
    );
  }

  if (!url) {
    return (
      <span className="my-3 inline-flex rounded-md border border-slate-100 bg-slate-50 px-2.5 py-1.5 text-[12px] text-slate-400">
        图片加载中…
      </span>
    );
  }

  return (
    <img
      src={url}
      alt={alt || ''}
      loading="lazy"
      className="my-3 max-h-[520px] max-w-full rounded-lg border border-slate-200 object-contain"
    />
  );
};

const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({ body, notePath, onError }) => {
  if (!body.trim()) {
    return (
      <p className="py-8 text-center text-[13px] text-slate-400">
        还没有内容，切换到「源码」开始写吧。
      </p>
    );
  }

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const anchor = target.closest('a');
    if (!anchor) return;

    const href = anchor.getAttribute('href');
    if (!href) return;

    event.preventDefault();
    if (href.startsWith('#')) return;

    if (/^(?:https?:|mailto:)/i.test(href)) {
      void openExternal(href).catch((error) => {
        onError(`打开链接失败：${String(error)}`);
      });
    }
  };

  return (
    <div
      onClick={handleClick}
      className="markdown-preview prose prose-slate max-w-none pb-6 text-[15px] leading-[1.9] prose-headings:font-semibold prose-headings:tracking-tight prose-p:my-3 prose-pre:overflow-x-auto prose-pre:rounded-lg prose-pre:bg-slate-900 prose-pre:text-slate-100 prose-code:before:content-none prose-code:after:content-none prose-img:my-0 prose-table:text-[13px]"
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          img: ({ src, alt }) => <NoteImage src={src} alt={alt} notePath={notePath} />,
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownPreview;
