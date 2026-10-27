import React, { useEffect, useRef } from 'react';
import { originalPage } from './originalPage';
import { createPlatform } from './platform';

const DoubaoPage: React.FC = () => {
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const target = frame.current?.contentWindow;
    if (!target) return;
    const platform = createPlatform();
    Object.assign(target, { AppPlatform: platform });
    target.document.open();
    target.document.write(originalPage());
    target.document.close();
    return () => platform.dispose();
  }, []);
  return <iframe ref={frame} title="豆包工作" style={{ position: 'fixed', inset: 0,
    width: '100%', height: '100%', border: 0, display: 'block', background: '#fff' }} />;
};
export default DoubaoPage;
