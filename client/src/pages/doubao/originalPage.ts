import source from './original/doubao-work-main.html?raw';

// Preserve all original DOM, CSS, SVGs and UI event handlers. Only host contracts change.
export function originalPage(): string {
  let html = source;
  const start = html.indexOf('  async function request(method,path,');
  const end = html.indexOf('  function dateLabel(', start);
  if (start < 0 || end < 0) throw new Error('原版请求适配边界变化，请检查源码');
  html = html.slice(0, start) + `  async function request(method,path,options={}){
    if(state.signedOut)throw new Error('请先授权登录');
    return bridge().request(method,path,options);
  }
` + html.slice(end);
  html = html.replace(/window\.magic/g, 'window.AppPlatform')
    .replace(/magic-app-oauth-result/g, 'app-oauth-result')
    .replace("$('#logoutButton').addEventListener('click',()=>{", "$('#logoutButton').addEventListener('click',async()=>{")
    .replace('    state.signedOut=true;try{sessionStorage.setItem',
      '    try{await window.AppPlatform.logout();}catch(error){handleError(error);return;}\n    state.signedOut=true;try{sessionStorage.setItem')
    .replace("const AUTH_URL='https://magic.solutionsuite.cn/api/user-token/browser/authorize?app_id='+APP_ID;",
      "const AUTH_URL='miaoda:authorize';")
    .replace(/妙笔授权登录/g, '授权登录')
    .replace(/正在接收 SSE 回复…/g, '正在接收回复…');
  return html;
}
