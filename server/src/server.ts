import express from 'express';
import cors from 'cors';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { Store } from './store.js';
import { createApi } from './routes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 4000);

const statePath = resolve(__dirname, '../runtime/state.json');
const store = new Store(statePath);

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.use('/api', createApi(store));

// 生产环境托管 web 构建产物
const webDist = resolve(__dirname, '../../web/dist');
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get('*', (_req, res) => res.sendFile(resolve(webDist, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`合并报表系统服务已启动: http://localhost:${PORT}`);
  console.log(`数据文件: ${statePath}`);
});
