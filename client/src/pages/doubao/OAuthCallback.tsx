import React, { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, LoaderCircle, ShieldAlert } from 'lucide-react';
import { completeAuth } from '../../api/doubao';
import { Button } from '../../components/ui/button';
const OAuthCallback: React.FC = () => {
  const [search] = useSearchParams();
  const started = useRef(false);
  const input = useRef({ code: search.get('code') || '', state: search.get('state') || '' });
  const denied = search.has('error');
  const result = useMutation({ mutationFn: completeAuth, retry: false, onSuccess: () => {
    // Parent polls its own authenticated status; no bearer credentials cross windows.
    window.close();
  } });
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    window.history.replaceState(window.history.state, '', window.location.pathname);
    if (!denied && input.current.code && input.current.state) result.mutate(input.current);
  }, [denied, result]);
  const invalid = denied || !input.current.code || !input.current.state;
  return <main className="grid min-h-dvh place-items-center bg-slate-50 p-6 text-center">
    <section className="w-full max-w-md rounded-3xl border bg-white p-10 shadow-sm">
      {result.isSuccess ? <CheckCircle2 className="mx-auto mb-6 size-12 text-emerald-600" /> :
        invalid || result.isError ? <ShieldAlert className="mx-auto mb-6 size-12 text-amber-600" /> :
          <LoaderCircle className="mx-auto mb-6 size-12 animate-spin text-blue-600" />}
      <h1 className="text-2xl font-semibold">{result.isSuccess ? '授权成功' :
        invalid || result.isError ? '授权未完成' : '正在完成授权'}</h1>
      <p className="my-4 text-sm leading-6 text-muted-foreground">{result.isSuccess ?
        '授权已安全保存，可以关闭窗口回到原页面。' : invalid ? '你取消了授权或回调参数已失效，请回到原页面重试。' :
          result.error?.message || '正在验证并保存授权，完成后会自动关闭此窗口，请稍候。'}</p>
      <Button asChild variant="outline"><Link to="/">返回豆包工作</Link></Button>
    </section>
  </main>;
};
export default OAuthCallback;
