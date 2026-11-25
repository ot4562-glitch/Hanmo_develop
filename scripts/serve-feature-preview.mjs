// 기능 브라우저 QA는 기본 QA 서버와 다른 포트를 사용한다.
process.env.PORT='4174';
await import('./serve-static.mjs');
